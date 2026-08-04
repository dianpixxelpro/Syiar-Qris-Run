/**
 * Konfigurasi Status Event & Tampilan
 * 
 * showSelamatCard:
 * - false : (Tahap Verifikasi) Card selamat disembunyikan di beranda (menampilkan tombol Kuota Penuh).
 *           Halaman & Link "Cek Status" AKTIF dan DITAMPILKAN agar peserta dapat mengecek status/upload bukti.
 * - true  : (Event/Project Selesai) Card selamat DITAMPILKAN di beranda.
 *           Halaman & Link "Cek Status" DI-HIDDEN (redirect ke beranda) karena seluruh proses sudah selesai.
 */
export const showSelamatCard = true;
