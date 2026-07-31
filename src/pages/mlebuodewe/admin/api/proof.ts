import type { APIRoute } from 'astro';
import { supabase } from '../../../../lib/supabase';

export const GET: APIRoute = async ({ request, cookies }) => {
  // Auth check
  const session = cookies.get('admin_session');
  if (session?.value !== 'authenticated') {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  const url = new URL(request.url);
  const id = url.searchParams.get('id');

  if (!id) {
    return new Response(JSON.stringify({ error: 'Missing ID' }), { status: 400 });
  }

  const { data, error } = await supabase
    .from('registrations')
    .select('payment_proof')
    .eq('id', id)
    .single();

  if (error || !data || !data.payment_proof) {
    return new Response(JSON.stringify({ error: 'Proof not found' }), { status: 404 });
  }

  // Return as JSON so the frontend script can parse and use it
  return new Response(JSON.stringify({ proof: data.payment_proof }), {
    headers: { 'Content-Type': 'application/json' }
  });
};
