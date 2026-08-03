import type { APIRoute } from 'astro';
import { getRegistrationWithEventById, checkInRegistration } from '../../../../lib/db';

function parseRegistrationId(rawInput: string): number | null {
  if (!rawInput) return null;
  const trimmed = rawInput.trim();
  
  if (trimmed.startsWith('TICKET:QRISRUN-REG-')) {
    const parts = trimmed.split(':');
    if (parts.length > 1) {
      const regIdPart = parts[1].replace('QRISRUN-REG-', '');
      const parsed = parseInt(regIdPart, 10);
      if (!isNaN(parsed)) return parsed;
    }
  }
  
  // Extract number from input like "#REG-123", "REG 123", "123"
  const match = trimmed.match(/\d+/);
  if (match) {
    const parsed = parseInt(match[0], 10);
    if (!isNaN(parsed)) return parsed;
  }
  
  return null;
}

export const GET: APIRoute = async ({ request, cookies }) => {
  const session = cookies.get('admin_session');
  if (session?.value !== 'authenticated') {
    return new Response(JSON.stringify({ success: false, message: 'Unauthorized' }), { status: 401 });
  }

  const url = new URL(request.url);
  const query = url.searchParams.get('query') || '';
  const regId = parseRegistrationId(query);

  if (!regId) {
    return new Response(JSON.stringify({ 
      success: false, 
      message: 'Format ID Registrasi tidak valid! Silakan masukkan ID seperti #REG-123 atau scan QR code.' 
    }), { 
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const registration = await getRegistrationWithEventById(regId);
  if (!registration) {
    return new Response(JSON.stringify({ 
      success: false, 
      message: `Data registrasi #${regId} tidak ditemukan di database.` 
    }), { 
      status: 404,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  let participants: { name: string; ukuranJersey?: string; kategori?: string; gender?: string }[] = [];
  let primaryName = registration.name;

  try {
    const parsed = JSON.parse(registration.name);
    if (Array.isArray(parsed) && parsed.length > 0) {
      participants = parsed;
      primaryName = parsed.map((p: any) => p.name).join(', ');
    } else {
      participants = [{ name: registration.name }];
    }
  } catch (e) {
    participants = [{ name: registration.name }];
  }

  return new Response(JSON.stringify({
    success: true,
    data: {
      id: registration.id,
      name: registration.name,
      primaryName,
      participants,
      email: registration.email,
      phone: registration.phone,
      status: registration.status,
      amount: registration.amount,
      checkedIn: registration.checkedIn,
      eventTitle: registration.eventTitle,
      eventDate: registration.eventDate,
      eventLocation: registration.eventLocation,
      createdAt: registration.createdAt
    }
  }), {
    headers: { 'Content-Type': 'application/json' }
  });
};

export const POST: APIRoute = async ({ request, cookies }) => {
  const session = cookies.get('admin_session');
  if (session?.value !== 'authenticated') {
    return new Response(JSON.stringify({ success: false, message: 'Unauthorized' }), { status: 401 });
  }

  try {
    const body = await request.json();
    const rawId = body.id || body.ticketId || '';
    const regId = typeof rawId === 'number' ? rawId : parseRegistrationId(String(rawId));

    if (!regId) {
      return new Response(JSON.stringify({ 
        success: false, 
        message: 'ID Registrasi tidak valid.' 
      }), { 
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const result = await checkInRegistration(regId);
    
    // Fetch updated data
    const updatedReg = await getRegistrationWithEventById(regId);

    let participants: any[] = [];
    if (updatedReg) {
      try {
        const parsed = JSON.parse(updatedReg.name);
        if (Array.isArray(parsed)) participants = parsed;
      } catch(e) {}
    }

    return new Response(JSON.stringify({
      success: result.success,
      message: result.message,
      data: updatedReg ? {
        id: updatedReg.id,
        name: updatedReg.name,
        participants,
        status: updatedReg.status,
        checkedIn: updatedReg.checkedIn,
        eventTitle: updatedReg.eventTitle
      } : null
    }), {
      status: result.success ? 200 : 400,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (err: any) {
    console.error('Error in checkin API POST:', err);
    return new Response(JSON.stringify({ 
      success: false, 
      message: 'Terjadi kesalahan server saat memproses check-in.' 
    }), { 
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
