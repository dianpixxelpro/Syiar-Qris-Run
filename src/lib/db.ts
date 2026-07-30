import { supabase } from './supabase';

export interface Event {
  id: number;
  title: string;
  date: string;
  location: string;
  category: string;
  imageUrl: string;
  status: 'UPCOMING' | 'FINISHED';
  description: string;
  price: number;
  slots: number;
  registered: number;
}

export interface Registration {
  id: number;
  eventId: number;
  name: string;
  email: string;
  phone: string;
  status: 'PENDING' | 'PAID' | 'EXPIRED';
  amount: number;
  paymentMethod: string;
  checkedIn: boolean;
  paymentProof?: string;
  transactionId?: string;
  transactionTime?: string;
  createdAt: string;
}

// Helpers to map DB models to TS Interfaces
function mapEvent(dbEvent: any): Event {
  return {
    id: dbEvent.id,
    title: dbEvent.title ? dbEvent.title.replace(/Fun Run/gi, 'Syiar QRIS Run') : '',
    date: '2026-08-16T12:00:00+07:00', // Override DB date to Minggu, 16 Agustus 2026
    location: 'Kediri Town Square, Jawa Timur', // Override DB location
    category: dbEvent.category,
    imageUrl: dbEvent.image_url,
    status: dbEvent.status,
    description: dbEvent.description,
    price: dbEvent.price,
    slots: dbEvent.slots,
    registered: dbEvent.registered,
  };
}

function mapRegistration(dbReg: any): Registration {
  return {
    id: dbReg.id,
    eventId: dbReg.event_id,
    name: dbReg.name,
    email: dbReg.email,
    phone: dbReg.phone,
    status: dbReg.status,
    amount: dbReg.amount,
    paymentMethod: dbReg.payment_method,
    checkedIn: dbReg.checked_in || false,
    paymentProof: dbReg.payment_proof || undefined,
    transactionId: dbReg.transaction_id || undefined,
    transactionTime: dbReg.transaction_time || undefined,
    createdAt: dbReg.created_at,
  };
}

/* --- Queries Event --- */

export async function getAllEvents(): Promise<Event[]> {
  const { data, error } = await supabase
    .from('events')
    .select('*')
    .order('date', { ascending: true });

  if (error) {
    console.error('Error fetching all events:', error);
    return [];
  }
  return (data || []).map(mapEvent);
}

export async function getUpcomingEvents(): Promise<Event[]> {
  const { data, error } = await supabase
    .from('events')
    .select('*')
    .eq('status', 'UPCOMING')
    .order('date', { ascending: true });

  if (error) {
    console.error('Error fetching upcoming events:', error);
    return [];
  }
  return (data || []).map(mapEvent);
}

export async function getFinishedEvents(): Promise<Event[]> {
  const { data, error } = await supabase
    .from('events')
    .select('*')
    .eq('status', 'FINISHED')
    .order('date', { ascending: false });

  if (error) {
    console.error('Error fetching finished events:', error);
    return [];
  }
  return (data || []).map(mapEvent);
}

export async function getEventById(id: number): Promise<Event | undefined> {
  const { data, error } = await supabase
    .from('events')
    .select('*')
    .eq('id', id)
    .single();

  if (error) {
    console.error(`Error fetching event with ID ${id}:`, error);
    return undefined;
  }
  return data ? mapEvent(data) : undefined;
}

export async function createEvent(event: Omit<Event, 'id'>): Promise<number | null> {
  const { data, error } = await supabase
    .from('events')
    .insert({
      title: event.title,
      date: event.date,
      location: event.location,
      category: event.category,
      image_url: event.imageUrl,
      status: event.status,
      description: event.description,
      price: event.price,
      slots: event.slots,
      registered: event.registered,
    })
    .select('id')
    .single();

  if (error) {
    console.error('Error creating event:', error);
    return null;
  }
  return data ? data.id : null;
}

export async function updateEvent(id: number, event: Partial<Omit<Event, 'id'>>): Promise<boolean> {
  const updateData: any = {};
  if (event.title !== undefined) updateData.title = event.title;
  if (event.date !== undefined) updateData.date = event.date;
  if (event.location !== undefined) updateData.location = event.location;
  if (event.category !== undefined) updateData.category = event.category;
  if (event.imageUrl !== undefined) updateData.image_url = event.imageUrl;
  if (event.status !== undefined) updateData.status = event.status;
  if (event.description !== undefined) updateData.description = event.description;
  if (event.price !== undefined) updateData.price = event.price;
  if (event.slots !== undefined) updateData.slots = event.slots;
  if (event.registered !== undefined) updateData.registered = event.registered;

  const { error } = await supabase
    .from('events')
    .update(updateData)
    .eq('id', id);

  if (error) {
    console.error(`Error updating event ${id}:`, error);
    return false;
  }
  return true;
}

export async function deleteEvent(id: number): Promise<boolean> {
  const { error } = await supabase
    .from('events')
    .delete()
    .eq('id', id);

  if (error) {
    console.error(`Error deleting event ${id}:`, error);
    return false;
  }
  return true;
}

/* --- Queries Registrasi --- */

export async function createRegistration(reg: Omit<Registration, 'id' | 'createdAt'>): Promise<number | null> {
  const { data, error } = await supabase
    .from('registrations')
    .insert({
      event_id: reg.eventId,
      name: reg.name,
      email: reg.email,
      phone: reg.phone,
      status: reg.status,
      amount: reg.amount,
      payment_method: reg.paymentMethod,
    })
    .select('id')
    .single();

  if (error) {
    console.error('Error creating registration:', error);
    return null;
  }
  return data ? data.id : null;
}

export async function getRegistrationById(id: number): Promise<Registration | undefined> {
  const { data, error } = await supabase
    .from('registrations')
    .select('*')
    .eq('id', id)
    .single();

  if (error) {
    console.error(`Error fetching registration ${id}:`, error);
    return undefined;
  }
  return data ? mapRegistration(data) : undefined;
}

export async function getAllRegistrations(): Promise<(Registration & { eventTitle: string })[]> {
  // Auto-cleanup dinonaktifkan agar data EXPIRED tetap muncul di admin

  const { data, error } = await supabase
    .from('registrations')
    .select(`
      *,
      events (
        title
      )
    `)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching all registrations:', error);
    return [];
  }

  return (data || []).reduce((acc: any[], dbReg: any) => {
    const reg = mapRegistration(dbReg);
    
    // Dynamic Expiration Check
    const limitTime = new Date(reg.createdAt).getTime() + (30 * 60 * 1000); // 30 menit
    if (reg.status === 'PENDING' && !reg.paymentProof && Date.now() > limitTime) {
      reg.status = 'EXPIRED';
    }

    acc.push({
      ...reg,
      eventTitle: (dbReg.events?.title || 'Unknown Event').replace(/Fun Run/gi, 'Syiar QRIS Run'),
    });
    
    return acc;
  }, []);
}

export async function getRegistrationWithEventById(id: number): Promise<(Registration & { eventTitle: string; eventDate: string; eventLocation: string; eventImageUrl: string }) | undefined> {
  const { data, error } = await supabase
    .from('registrations')
    .select(`
      *,
      events (
        title,
        date,
        location,
        image_url
      )
    `)
    .eq('id', id)
    .single();

  if (error) {
    console.error(`Error fetching registration with event details ${id}:`, error);
    return undefined;
  }

  if (!data) return undefined;

  const reg = mapRegistration(data);

  // Check TTL Expiration (30 Menit)
  const limitTime = new Date(reg.createdAt).getTime() + (30 * 60 * 1000);
  if (reg.status === 'PENDING' && !reg.paymentProof && Date.now() > limitTime) {
    const { error: updateError } = await supabase
      .from('registrations')
      .update({ status: 'EXPIRED' })
      .eq('id', id);
    
    if (!updateError) {
      reg.status = 'EXPIRED';
    } else {
      console.error(`Error marking registration ${id} as EXPIRED:`, updateError);
    }
  }

  return {
    ...reg,
    eventTitle: (data.events?.title || 'Unknown Event').replace(/Fun Run/gi, 'Syiar QRIS Run'),
    eventDate: '2026-08-16T12:00:00+07:00', // Override DB date
    eventLocation: 'Kediri Town Square, Jawa Timur', // Override DB location
    eventImageUrl: data.events?.image_url || '',
  };
}

export async function updateRegistrationStatus(id: number, status: 'PENDING' | 'PAID' | 'EXPIRED'): Promise<boolean> {
  const currentReg = await getRegistrationById(id);
  if (!currentReg) return false;

  // Jika status berubah dari PENDING/EXPIRED ke PAID
  if ((currentReg.status === 'PENDING' || currentReg.status === 'EXPIRED') && status === 'PAID') {
    // Jalankan update berurutan (di Supabase kita lakukan step by step karena tidak ada block transaction langsung lewat client)
    const { error: regError } = await supabase
      .from('registrations')
      .update({ status: 'PAID' })
      .eq('id', id);

    if (regError) {
      console.error(`Error updating status for registration ${id}:`, regError);
      return false;
    }

    // Ambil detail event saat ini untuk meningkatkan registered count
    const event = await getEventById(currentReg.eventId);
    if (event) {
      let participantCount = 1;
      try {
        const parsed = JSON.parse(currentReg.name);
        if (Array.isArray(parsed)) {
          participantCount = parsed.length;
        }
      } catch (e) {
        // Fallback to 1 if not JSON
      }

      const { error: eventError } = await supabase
        .from('events')
        .update({ registered: event.registered + participantCount })
        .eq('id', currentReg.eventId);

      if (eventError) {
        console.error(`Error incrementing registered count for event ${currentReg.eventId}:`, eventError);
      }
    }
    return true;
  }

  // Update status biasa (tanpa increment)
  const { error } = await supabase
    .from('registrations')
    .update({ status })
    .eq('id', id);

  if (error) {
    console.error(`Error updating status for registration ${id}:`, error);
    return false;
  }
  return true;
}

export async function updateRegistrationAmount(id: number, amount: number): Promise<boolean> {
  const { error } = await supabase
    .from('registrations')
    .update({ amount })
    .eq('id', id);

  if (error) {
    console.error(`Error updating amount for registration ${id}:`, error);
    return false;
  }
  return true;
}

export async function updateRegistration(id: number, data: any): Promise<boolean> {
  const updateData: any = {};
  if (data.name !== undefined) updateData.name = data.name;
  if (data.email !== undefined) updateData.email = data.email;
  if (data.phone !== undefined) updateData.phone = data.phone;

  if (Object.keys(updateData).length === 0) return true;

  const { error } = await supabase
    .from('registrations')
    .update(updateData)
    .eq('id', id);

  if (error) {
    console.error(`Error updating registration ${id}:`, error);
    return false;
  }
  return true;
}

export async function checkInRegistration(id: number): Promise<{ success: boolean; message: string; name?: string; eventTitle?: string }> {
  const reg = await getRegistrationWithEventById(id);
  if (!reg) {
    return { success: false, message: 'Tiket tidak ditemukan di database.' };
  }

  if (reg.status === 'PENDING') {
    return { 
      success: false, 
      message: 'Tiket belum lunas! Silakan selesaikan pembayaran terlebih dahulu.',
      name: reg.name,
      eventTitle: reg.eventTitle
    };
  }

  if (reg.checkedIn) {
    return { 
      success: false, 
      message: 'Tiket sudah pernah digunakan / check-in sebelumnya.',
      name: reg.name,
      eventTitle: reg.eventTitle
    };
  }

  // Update status checked_in = true
  const { error } = await supabase
    .from('registrations')
    .update({ checked_in: true })
    .eq('id', id);

  if (error) {
    console.error(`Error checking in registration ${id}:`, error);
    return { success: false, message: 'Terjadi kesalahan sistem saat memproses check-in.' };
  }

  return {
    success: true,
    message: 'Berhasil mengambil Race Pack! Selamat mengikuti event.',
    name: reg.name,
    eventTitle: reg.eventTitle
  };
}

export async function uploadPaymentProof(id: number, base64Image: string, transactionTime: string): Promise<{ success: boolean; message: string }> {
  // Cek duplikasi dihapus atas permintaan pengguna

  // Update bukti transfer dan nomor transaksi
  const { error } = await supabase
    .from('registrations')
    .update({ 
      payment_proof: base64Image,
      transaction_time: transactionTime
    })
    .eq('id', id);

  if (error) {
    console.error(`Error uploading payment proof for registration ${id}:`, error);
    return { success: false, message: 'Gagal mengunggah bukti transfer ke database.' };
  }
  return { success: true, message: 'Bukti transfer berhasil dikirim!' };
}

export async function deleteRegistration(id: number): Promise<boolean> {
  const { error } = await supabase
    .from('registrations')
    .delete()
    .eq('id', id);

  if (error) {
    console.error(`Error deleting registration ${id}:`, error);
    return false;
  }
  return true;
}

export async function getRegistrationByEmailAndName(email: string, name: string): Promise<Registration | undefined> {
  const { data, error } = await supabase
    .from('registrations')
    .select('*')
    .eq('email', email)
    .order('created_at', { ascending: false });

  if (error) {
    console.error(`Error fetching registration for email ${email} and name ${name}:`, error);
    return undefined;
  }
  
  if (!data || data.length === 0) return undefined;

  const targetName = name.trim().toLowerCase();
  
  for (const row of data) {
    let rowNames: string[] = [];
    try {
      const parsed = JSON.parse(row.name);
      if (Array.isArray(parsed)) {
        rowNames = parsed.map(p => String(p.name || '').trim().toLowerCase());
      } else {
        rowNames = [String(row.name || '').trim().toLowerCase()];
      }
    } catch (e) {
      rowNames = [String(row.name || '').trim().toLowerCase()];
    }
    
    if (rowNames.includes(targetName)) {
      return mapRegistration(row);
    }
  }
  
  return undefined;
}
