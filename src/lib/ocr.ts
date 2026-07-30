// Dynamic import used for tesseract.js
import os from 'os';
import { updateRegistrationStatus } from './db';

/**
 * Memvalidasi struk bukti pembayaran menggunakan OCR (Optical Character Recognition)
 * 
 * @param base64Image String gambar bukti transfer dalam format Base64
 * @param amount Nominal unik yang harus dibayarkan (misal: 150003)
 */
export async function validateReceiptOCR(
  base64Image: string,
  amount: number
): Promise<{ success: boolean; message: string; recognizedText: string; extractedTime?: string }> {
  try {
    const { createWorker } = await import('tesseract.js');
    const os = await import('os');
    const worker = await createWorker('eng', 1, {
      cachePath: os.tmpdir(),
    });

    const { data: { text } } = await worker.recognize(base64Image);
    await worker.terminate();

    const upperText = text.toUpperCase();

    // 1. Validasi Penerima
    const hasRecipient =
      upperText.includes('EVENT ORGANIZER JAGAD PRE') ||
      upperText.includes('QRIS RUN') ||
      upperText.includes('GO-JEK') ||
      upperText.includes('GOPAY');

    // 2. Validasi Nominal Bayar
    const cleanTextDigits = upperText.replace(/[^0-9]/g, '');
    const cleanAmount = Math.round(amount).toString();

    const formattedDot = new Intl.NumberFormat('id-ID', { minimumFractionDigits: 0 }).format(amount).replace(/[^0-9.]/g, '');
    const formattedComma = formattedDot.replace(/\./g, ',');

    const hasAmount =
      cleanTextDigits.includes(cleanAmount) ||
      upperText.includes(cleanAmount) ||
      upperText.includes(formattedDot) ||
      upperText.includes(formattedComma);

    if (!hasRecipient) {
      return {
        success: false,
        message: 'Validasi OCR Gagal: Nama penerima ("Event Organizer Jagad Pre" / "Syiar QRIS Run") tidak terdeteksi pada struk bukti pembayaran Anda! <strong>Pastikan bukti yang dikirim benar!</strong>',
        recognizedText: text
      };
    }

    if (!hasAmount) {
      return {
        success: false,
        message: `Validasi OCR Gagal: Nominal transfer senilai ${formattedDot} tidak terdeteksi pada struk bukti pembayaran Anda! Mohon pastikan nominal yang ditransfer sesuai.`,
        recognizedText: text
      };
    }

    return {
      success: true,
      message: 'Validasi OCR Sukses! Struk bukti transfer valid.',
      recognizedText: text,
      extractedTime: new Date().toISOString()
    };
  } catch (err) {
    console.error('Error saat menjalankan verifikasi OCR struk pembayaran:', err);
    return {
      success: true, // Fallback allow
      message: 'Verifikasi OCR dilewati karena kendala teknis pembacaan berkas gambar.',
      recognizedText: '',
      extractedTime: new Date().toISOString()
    };
  }
}

/**
 * Memproses CSV Mutasi Bank untuk konfirmasi pembayaran otomatis.
 * Mencocokkan nominal unik di mutasi dengan nominal tagihan peserta.
 */
export async function processBankMutationsCSV(
  csvText: string,
  pendingRegs: any[],
  isImage: boolean = false
): Promise<{ confirmedCount: number; confirmedIds: number[] }> {
  let confirmedCount = 0;
  const confirmedIds: number[] = [];

  const lines = csvText.split(/\r?\n/);

  // Fungsi helper untuk variasi bulan
  const getMonthName = (monthIdx: number, short = false) => {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
    const monthsFull = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
    return short ? months[monthIdx] : monthsFull[monthIdx];
  };

  for (const reg of pendingRegs) {
    const totalPay = reg.amount + (reg.id % 1000);

    const formattedDot = new Intl.NumberFormat('id-ID', { minimumFractionDigits: 0 }).format(totalPay).replace(/[^0-9.]/g, '');
    const formattedComma = formattedDot.replace(/\./g, ',');

    // 1. Buat puluhan variasi format tanggal dan waktu dari input pengguna
    const dateVars: string[] = [];
    const timeVars: string[] = [];

    if (reg.transactionTime) {
      const d = new Date(reg.transactionTime);
      if (!isNaN(d.getTime())) {
        const dd = String(d.getUTCDate()).padStart(2, '0');
        const d_noPad = String(d.getUTCDate());
        const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
        const yy = String(d.getUTCFullYear()).slice(2);
        const yyyy = String(d.getUTCFullYear());

        dateVars.push(`${dd}/${mm}/${yyyy}`);
        dateVars.push(`${dd}-${mm}-${yyyy}`);
        dateVars.push(`${yyyy}-${mm}-${dd}`);
        dateVars.push(`${dd}/${mm}`);
        dateVars.push(`${dd}-${mm}`);
        dateVars.push(`${dd}-${getMonthName(d.getUTCMonth(), true)}-${yy}`);
        dateVars.push(`${dd} ${getMonthName(d.getUTCMonth(), true)}`);
        dateVars.push(`${dd} ${getMonthName(d.getUTCMonth(), false)}`);
        dateVars.push(`${d_noPad}/${mm}`);

        const hh = String(d.getUTCHours()).padStart(2, '0');
        const min = String(d.getUTCMinutes()).padStart(2, '0');

        // Cek jika waktu adalah 00:00 (fallback jika OCR struk gagal mendeteksi jam)
        if (hh !== '00' || min !== '00') {
          // Berikan toleransi waktu +/- 30 menit karena mutasi sering kali telat masuk dari waktu transfer asli
          for (let offset = -30; offset <= 30; offset++) {
            const nd = new Date(d.getTime() + offset * 60000);
            const ohh = String(nd.getUTCHours()).padStart(2, '0');
            const omin = String(nd.getUTCMinutes()).padStart(2, '0');

            timeVars.push(`${ohh}:${omin}`);
            timeVars.push(`${ohh}.${omin}`);
            timeVars.push(`${ohh} ${omin}`);
          }
        }
      }
    }

    let isMatch = false;

    if (isImage) {
      // Untuk gambar OCR, periksa secara global pada seluruh teks karena Tesseract sering memisahkan baris
      const upperText = csvText.toUpperCase();
      const hasAmount = upperText.includes(totalPay.toString()) || upperText.includes(formattedDot) || upperText.includes(formattedComma);

      if (hasAmount) {
        if (dateVars.length > 0) {
          const hasDate = dateVars.some(dv => upperText.includes(dv.toUpperCase()));
          // Jika timeVars kosong (jam 00:00), maka abaikan pengecekan waktu
          const hasTime = timeVars.length === 0 ? true : timeVars.some(tv => upperText.includes(tv));
          if (hasDate && hasTime) {
            isMatch = true;
          }
        } else {
          isMatch = true;
        }
      }
    } else {
      // 2. Pemindaian mutasi baris demi baris
      for (const line of lines) {
        const hasAmount =
          line.includes(totalPay.toString()) ||
          line.includes(formattedDot) ||
          line.includes(formattedComma);

        if (hasAmount) {
          // Jika ada jumlah uang yang cocok di baris ini, syaratkan juga validasi tanggal dan waktu
          if (dateVars.length > 0) {
            const upperLine = line.toUpperCase();
            const hasDate = dateVars.some(dv => upperLine.includes(dv.toUpperCase()));
            // Jika timeVars kosong, anggap true
            const hasTime = timeVars.length === 0 ? true : timeVars.some(tv => upperLine.includes(tv));

            if (hasDate && hasTime) {
              isMatch = true;
              break;
            }
          } else {
            // Fallback untuk pendaftar lama yang belum punya kolom waktu transaksi
            isMatch = true;
            break;
          }
        }
      }
    }

    if (isMatch) {
      const success = await updateRegistrationStatus(reg.id, 'PAID');
      if (success) {
        confirmedCount++;
        confirmedIds.push(reg.id);
      }
    }
  }

  return { confirmedCount, confirmedIds };
}
