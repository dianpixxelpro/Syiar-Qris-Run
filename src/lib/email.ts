import nodemailer from 'nodemailer';

/**
 * Membuat transporter Nodemailer menggunakan Gmail SMTP
 * Pastikan EMAIL_USER dan EMAIL_APP_PASSWORD sudah diset di .env
 */
function createTransporter() {
  const emailUser = process.env.EMAIL_USER || (import.meta as any).env?.EMAIL_USER || '';
  const emailPass = process.env.EMAIL_APP_PASSWORD || (import.meta as any).env?.EMAIL_APP_PASSWORD || '';

  if (!emailUser || !emailPass) {
    console.warn('[EMAIL] EMAIL_USER atau EMAIL_APP_PASSWORD belum dikonfigurasi di .env. Email tidak akan dikirim.');
    return null;
  }

  const emailHost = process.env.EMAIL_HOST || (import.meta as any).env?.EMAIL_HOST;
  const emailPort = process.env.EMAIL_PORT || (import.meta as any).env?.EMAIL_PORT;

  if (emailHost && emailPort) {
    return nodemailer.createTransport({
      host: emailHost,
      port: Number(emailPort),
      secure: Number(emailPort) === 465, // true for 465, false for other ports like 587
      auth: {
        user: emailUser,
        pass: emailPass,
      },
    });
  }

  // Fallback ke gmail jika EMAIL_HOST dan EMAIL_PORT tidak ada (opsional)
  return nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: emailUser,
      pass: emailPass,
    },
  });
}

const FROM_NAME = 'Syiar QRIS Run';
const BASE_URL = process.env.PUBLIC_BASE_URL || (import.meta as any).env?.PUBLIC_BASE_URL || 'http://localhost:4321';

// ─────────────────────────────────────────
// Template HTML Premium (Dark Theme)
// ─────────────────────────────────────────

function wrapEmailTemplate(title: string, bodyHtml: string): string {
  return `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>${title}</title>
  <style>
    body { margin:0; padding:0; background-color:#0a0f1e; font-family:'Segoe UI',Arial,sans-serif; color:#e2e8f0; }
    .wrapper { max-width:600px; margin:0 auto; padding:32px 16px; }
    .card { background:linear-gradient(135deg,#111827,#1a2234); border:1px solid rgba(255,255,255,0.08); border-radius:16px; overflow:hidden; }
    .header { background:linear-gradient(135deg,#1d4ed8,#0f766e); padding:32px 40px; text-align:center; }
    .header-logo { font-size:28px; font-weight:900; color:#fff; letter-spacing:-1px; }
    .header-logo span { color:#22d3ee; }
    .header-tagline { font-size:13px; color:rgba(255,255,255,0.7); margin-top:6px; }
    .body { padding:40px; }
    .title { font-size:22px; font-weight:800; color:#f1f5f9; margin:0 0 8px; }
    .subtitle { font-size:14px; color:#94a3b8; margin:0 0 28px; }
    .info-box { background:rgba(255,255,255,0.04); border:1px solid rgba(255,255,255,0.08); border-radius:12px; padding:20px 24px; margin-bottom:24px; }
    .info-row { display:flex; justify-content:space-between; padding:8px 0; border-bottom:1px solid rgba(255,255,255,0.06); font-size:14px; }
    .info-row:last-child { border-bottom:none; }
    .info-label { color:#94a3b8; }
    .info-value { font-weight:700; color:#e2e8f0; text-align:right; }
    .btn { display:block; width:fit-content; margin:28px auto 0; background:linear-gradient(135deg,#2563eb,#0d9488); color:#fff; text-decoration:none; padding:14px 36px; border-radius:50px; font-size:15px; font-weight:700; text-align:center; }
    .status-badge { display:inline-block; padding:6px 16px; border-radius:50px; font-size:12px; font-weight:700; letter-spacing:0.05em; }
    .status-pending { background:rgba(245,158,11,0.15); color:#fbbf24; border:1px solid rgba(245,158,11,0.3); }
    .status-paid { background:rgba(16,185,129,0.15); color:#34d399; border:1px solid rgba(16,185,129,0.3); }
    .footer { padding:24px 40px; text-align:center; border-top:1px solid rgba(255,255,255,0.06); }
    .footer p { font-size:12px; color:#475569; margin:4px 0; }
    .highlight { color:#22d3ee; font-weight:700; }
    @media only screen and (max-width: 480px) {
      .mobile-block { display: block !important; width: 100% !important; padding: 0 !important; margin-bottom: 15px !important; }
      .mobile-center { text-align: center !important; }
      .qr-td { display: block !important; width: 100% !important; text-align: center !important; padding-right: 0 !important; margin-bottom: 15px !important; }
      .qr-text-td { display: block !important; width: 100% !important; text-align: center !important; }
      .qr-img-wrapper { display: inline-block !important; }
    }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="card">
      <div class="header">
        <div class="header-logo">⚡ Syiar <span>QRIS Run</span></div>
        <div class="header-tagline">Event Lari Edukasi & Digitalisasi Bank Indonesia</div>
      </div>
      <div class="body">
        ${bodyHtml}
      </div>
      <div class="footer">
        <p>Email ini dikirim otomatis oleh sistem Syiar QRIS Run.</p>
        <p>Jangan balas email ini. Hubungi panitia jika ada pertanyaan.</p>
      </div>
    </div>
  </div>
</body>
</html>`;
}

// ─────────────────────────────────────────
// 1. Email Bukti Diterima (Menunggu Konfirmasi)
// ─────────────────────────────────────────

export async function sendPaymentReceivedEmail(params: {
  to: string;
  name: string;
  eventTitle: string;
  amount: number;
  regId: number;
}): Promise<boolean> {
  const transporter = createTransporter();
  if (!transporter) return false;

  const formatPrice = (n: number) =>
    new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(n);

  const bodyHtml = `
    <p class="title">📩 Bukti Pembayaran Diterima!</p>
    <p class="subtitle">Halo, <strong>${params.name}</strong>! Bukti transfer Anda telah berhasil kami terima.</p>

    <div class="info-box">
      <div class="info-row">
        <span class="info-label">ID Pendaftaran</span>
        <span class="info-value">#REG-${params.regId}</span>
      </div>
      <div class="info-row">
        <span class="info-label">Event</span>
        <span class="info-value">${params.eventTitle}</span>
      </div>
      <div class="info-row">
        <span class="info-label">Nominal Transfer</span>
        <span class="info-value highlight">${formatPrice(params.amount)}</span>
      </div>
      <div class="info-row">
        <span class="info-label">Status</span>
        <span class="info-value"><span class="status-badge status-pending">⏳ MENUNGGU KONFIRMASI</span></span>
      </div>
    </div>

    <p style="font-size:14px; color:#94a3b8; line-height:1.6;">
      Tim panitia kami sedang memverifikasi pembayaran Anda. Proses verifikasi biasanya memakan waktu <strong style="color:#e2e8f0;">1×24 jam</strong>. Setelah dikonfirmasi, E-Tiket Anda akan dikirim ke email ini.
    </p>
    <p style="font-size:13px; color:#64748b; margin-top:16px;">
      💡 Pastikan Anda telah mentransfer nominal yang tepat dan screenshot struk pembayaran terlihat jelas.
    </p>
  `;

  try {
    await transporter.sendMail({
      from: `"${FROM_NAME}" <${process.env.EMAIL_USER || (import.meta as any).env?.EMAIL_USER}>`,
      to: params.to,
      subject: `[Syiar QRIS Run] Bukti Pembayaran Diterima — ${params.eventTitle}`,
      html: wrapEmailTemplate('Bukti Pembayaran Diterima', bodyHtml),
    });
    console.log(`[EMAIL] Sent payment received email to ${params.to}`);
    return true;
  } catch (err) {
    console.error('[EMAIL] Failed to send payment received email:', err);
    return false;
  }
}

// ─────────────────────────────────────────
// 2. Email Pembayaran Terkonfirmasi + Link E-Tiket
// ─────────────────────────────────────────

export async function sendTicketConfirmedEmail(params: {
  to: string;
  name: string;
  eventTitle: string;
  eventDate: string;
  eventLocation: string;
  amount: number;
  regId: number;
}): Promise<boolean> {
  const transporter = createTransporter();
  if (!transporter) return false;

  const formatPrice = (n: number) =>
    new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(n);

  const ticketUrl = `${BASE_URL}/ticket/${params.regId}`;

  const ticketCode = `TICKET:QRISRUN-REG-${params.regId}:EMAIL-${params.to}`;
  const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(ticketCode)}`;

  let formattedName = params.name;
  let participantListHtml = '';

  try {
    const arr = JSON.parse(params.name);
    if (Array.isArray(arr) && arr.length > 0) {
      formattedName = arr[0].name;

      participantListHtml = `
        <tr>
          <td colspan="2" class="mobile-block" style="padding-bottom: 15px; border-top: 1px dashed #334155; padding-top: 15px; margin-top: 5px;">
            <span style="display: block; font-size: 10px; color: #64748b; font-weight: 700; letter-spacing: 1px; text-transform: uppercase; margin-bottom: 8px;">Daftar Peserta & Jersey</span>
            <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
              ${arr.map((p: any) => `
                <tr>
                  <td style="padding: 4px 0; color: #f8fafc;">${p.name}</td>
                  <td style="padding: 4px 0; color: #22d3ee; text-align: right; font-weight: bold;">Size: ${p.ukuranJersey}</td>
                </tr>
              `).join('')}
            </table>
          </td>
        </tr>
      `;
    }
  } catch (e) { }

  const bodyHtml = `
    <div style="background-color: #0f172a; border-radius: 12px; overflow: hidden; border: 1px solid #1e293b; box-shadow: 0 10px 25px rgba(0,0,0,0.5);">
      
      <!-- Ticket Header -->
      <div style="background-color: #1e293b; padding: 15px 25px; border-bottom: 1px solid #334155; display: flex; justify-content: space-between; align-items: center;">
        <span style="color: #94a3b8; font-weight: 700; font-size: 14px; letter-spacing: 1px;">🎫 OFFICIAL E-TICKET</span>
        <span style="background-color: rgba(16, 185, 129, 0.1); color: #34d399; padding: 4px 10px; border-radius: 4px; font-size: 11px; font-weight: 700; letter-spacing: 1px;">CONFIRMED</span>
      </div>

      <!-- Event Title Banner -->
      <div style="background: linear-gradient(rgba(15, 23, 42, 0.7), rgba(15, 23, 42, 0.95)); padding: 40px 25px; text-align: center; border-bottom: 1px dashed #334155;">
        <h1 style="color: #f8fafc; font-size: 24px; font-weight: 800; margin: 0;">${params.eventTitle}</h1>
      </div>

      <!-- Ticket Details -->
      <div style="padding: 25px;">
        <table style="width: 100%; border-collapse: collapse;">
          <tr>
            <td class="mobile-block" style="padding-bottom: 15px; width: 50%;">
              <span style="display: block; font-size: 10px; color: #64748b; font-weight: 700; letter-spacing: 1px; text-transform: uppercase; margin-bottom: 5px;">Nama Lengkap</span>
              <strong style="color: #f8fafc; font-size: 15px; text-transform: capitalize;">${formattedName}</strong>
            </td>
            <td class="mobile-block" style="padding-bottom: 15px; width: 50%;">
              <span style="display: block; font-size: 10px; color: #64748b; font-weight: 700; letter-spacing: 1px; text-transform: uppercase; margin-bottom: 5px;">Status Pembayaran</span>
              <strong style="color: #10b981; font-size: 15px;">LUNAS</strong>
            </td>
          </tr>
          ${participantListHtml}
          <tr>
            <td class="mobile-block" style="padding-bottom: 15px;">
              <span style="display: block; font-size: 10px; color: #64748b; font-weight: 700; letter-spacing: 1px; text-transform: uppercase; margin-bottom: 5px;">Hari & Tanggal</span>
              <strong style="color: #f8fafc; font-size: 14px;">${params.eventDate}</strong>
            </td>
            <td class="mobile-block" style="padding-bottom: 15px;">
              <span style="display: block; font-size: 10px; color: #64748b; font-weight: 700; letter-spacing: 1px; text-transform: uppercase; margin-bottom: 5px;">Lokasi Acara</span>
              <strong style="color: #f8fafc; font-size: 14px;">${params.eventLocation}</strong>
            </td>
          </tr>
          <tr>
            <td colspan="2" class="mobile-block">
              <span style="display: block; font-size: 10px; color: #64748b; font-weight: 700; letter-spacing: 1px; text-transform: uppercase; margin-bottom: 5px;">ID Registrasi</span>
              <strong style="color: #94a3b8; font-size: 15px;">#REG-${params.regId}</strong>
            </td>
          </tr>
        </table>

        <!-- QR Code Section -->
        <div style="margin-top: 30px; background-color: #1e293b; border-radius: 12px; padding: 20px; text-align: left;">
          <table style="width: 100%; border-collapse: collapse;">
            <tr>
              <td class="qr-td" style="width: 140px; vertical-align: middle; padding-right: 20px;">
                <div class="qr-img-wrapper" style="background: white; padding: 10px; border-radius: 8px; display: inline-block;">
                  <img src="${qrCodeUrl}" alt="QR Check-in" style="width: 120px; height: 120px; display: block;" />
                </div>
              </td>
              <td class="qr-text-td" style="vertical-align: middle;">
                <h3 style="color: #f8fafc; margin: 0 0 8px 0; font-size: 16px;">Tunjukkan QR Code ini</h3>
                <p style="color: #94a3b8; margin: 0; font-size: 13px; line-height: 1.5;">Scan tiket ini kepada panitia di lokasi acara untuk proses check-in pendaftaran.</p>
              </td>
            </tr>
          </table>
        </div>
      </div>
    </div>
  `;

  try {
    await transporter.sendMail({
      from: `"${FROM_NAME}" <${process.env.EMAIL_USER || (import.meta as any).env?.EMAIL_USER}>`,
      to: params.to,
      subject: `[Syiar QRIS Run] ✅ Pembayaran Dikonfirmasi — E-Tiket ${params.eventTitle} Siap!`,
      html: wrapEmailTemplate('E-Tiket Siap', bodyHtml),
    });
    console.log(`[EMAIL] Sent ticket confirmation email to ${params.to}`);
    return true;
  } catch (err) {
    console.error('[EMAIL] Failed to send ticket confirmation email:', err);
    return false;
  }
}
