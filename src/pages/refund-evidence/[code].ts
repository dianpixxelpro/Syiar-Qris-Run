import type { APIRoute } from 'astro';
import { getRefundByEvidenceToken } from '../../lib/db';

export const GET: APIRoute = async ({ params }) => {
  const code = params.code;

  if (!code) {
    return new Response('Tautan tidak valid.', { status: 400 });
  }

  const refund = await getRefundByEvidenceToken(code);

  if (!refund || !refund.proofImage) {
    return new Response('Berkas bukti transaksi tidak ditemukan atau tidak dapat diakses.', { status: 404 });
  }

  try {
    const rawData = refund.proofImage;
    
    // Process Data URL format: data:<mime>;base64,<data>
    const matches = rawData.match(/^data:(.+);base64,(.+)$/);

    if (!matches || matches.length !== 3) {
      return new Response('Format berkas bukti tidak valid.', { status: 400 });
    }

    const mimeType = matches[1];
    const base64Data = matches[2];
    const buffer = Buffer.from(base64Data, 'base64');

    return new Response(buffer, {
      status: 200,
      headers: {
        'Content-Type': mimeType,
        'Content-Length': buffer.length.toString(),
        'Cache-Control': 'private, max-age=86400, no-transform',
        'X-Content-Type-Options': 'nosniff',
        'Content-Disposition': mimeType.startsWith('image/') ? `inline; filename="bukti_${refund.refundCode}"` : `attachment; filename="bukti_${refund.refundCode}.pdf"`,
      },
    });
  } catch (err) {
    console.error('Error serving refund evidence:', err);
    return new Response('Terjadi kesalahan saat memproses berkas bukti.', { status: 500 });
  }
};
