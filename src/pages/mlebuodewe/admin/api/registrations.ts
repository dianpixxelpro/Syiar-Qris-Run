import type { APIRoute } from 'astro';
import { supabase } from '../../../../lib/supabase';

export const GET: APIRoute = async ({ request, cookies }) => {
  // Auth check (middleware also handles this)
  const session = cookies.get('admin_session');
  if (session?.value !== 'authenticated') {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  const url = new URL(request.url);
  const page = parseInt(url.searchParams.get('page') || '1');
  const pageSize = Math.min(parseInt(url.searchParams.get('pageSize') || '200'), 200);

  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  // Temporary hardcode to see what causes timeout
  const totalCount = 2200;
  const countError = null;

  if (countError) {
    console.error('Count error:', countError);
  }

  // 2. Fetch events separately to avoid slow JOIN on large pagination offset
  const { data: eventsData } = await supabase.from('events').select('id, title');
  const eventsMap = new Map();
  if (eventsData) {
    eventsData.forEach(ev => eventsMap.set(ev.id, ev.title));
  }

  // 3. Get paginated data (NO JOIN to avoid Statement Timeout)
  const { data, error } = await supabase
    .from('registrations')
    .select(`
      id,
      event_id,
      name,
      email,
      phone,
      status,
      amount,
      payment_method,
      checked_in,
      transaction_id,
      transaction_time,
      created_at
    `)
    .order('id', { ascending: false })
    .range(from, to);

  if (error) {
    console.error('Data fetch error:', error);
    return new Response(JSON.stringify({ error: error.message, details: error.details }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const total = totalCount ?? 0;
  const totalPages = Math.ceil(total / pageSize);

  const registrations = (data || []).map((dbReg: any) => {
    const limitTime = new Date(dbReg.created_at).getTime() + (30 * 60 * 1000);
    const hasProof = !!dbReg.transaction_time;
    const isExpired = dbReg.status === 'PENDING' && !hasProof && Date.now() > limitTime;
    const eventTitle = eventsMap.get(dbReg.event_id) || 'Unknown Event';

    return {
      id: dbReg.id,
      eventId: dbReg.event_id,
      name: dbReg.name || '',
      email: dbReg.email || '',
      phone: dbReg.phone || '',
      status: isExpired ? 'EXPIRED' : (dbReg.status || 'PENDING'),
      amount: dbReg.amount || 0,
      paymentMethod: dbReg.payment_method || '',
      checkedIn: dbReg.checked_in || false,
      paymentProof: hasProof ? `/mlebuodewe/admin/api/proof?id=${dbReg.id}` : null,
      transactionId: dbReg.transaction_id || null,
      transactionTime: dbReg.transaction_time || null,
      createdAt: dbReg.created_at,
      eventTitle: eventTitle.replace(/Fun Run/gi, 'Syiar QRIS Run'),
    };
  });

  return new Response(JSON.stringify({
    data: registrations,
    total,
    page,
    pageSize,
    totalPages
  }), {
    headers: { 'Content-Type': 'application/json' }
  });
};
