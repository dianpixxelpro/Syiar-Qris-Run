import type { APIRoute } from 'astro';
import { encryptText } from '../../../../lib/crypto';

export const POST: APIRoute = async ({ request }) => {
  try {
    const body = await request.json();
    const origin = new URL(request.url).origin;

    // Direct single item
    if (body.name && body.phone) {
      const name = String(body.name).trim();
      const phone = String(body.phone).trim();
      const payload = `${name}|${phone}`;
      const token = encryptText(payload);
      const url = `${origin}/refund-confirmation?token=${token}`;

      return new Response(
        JSON.stringify({
          success: true,
          token,
          url,
          name,
          phone,
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Batch items array
    if (Array.isArray(body.items)) {
      const results = body.items.map((item: any) => {
        const name = String(item.name || '').trim();
        const phone = String(item.phone || '').trim();
        const payload = `${name}|${phone}`;
        const token = encryptText(payload);
        const url = `${origin}/refund-confirmation?token=${token}`;
        return { name, phone, token, url };
      });

      return new Response(
        JSON.stringify({
          success: true,
          items: results,
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ success: false, message: 'Invalid payload. Expecting name and phone or items array.' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (err: any) {
    console.error('Error generating refund link:', err);
    return new Response(
      JSON.stringify({ success: false, message: err.message || 'Internal server error' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};
