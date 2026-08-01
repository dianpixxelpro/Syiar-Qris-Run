// @ts-ignore
if (typeof import.meta.env === 'undefined') { (import.meta as any).env = process.env; }

import { createClient } from '@supabase/supabase-js';
import { sendTicketConfirmedEmail } from './src/lib/email';
import fs from 'fs';

const envText = fs.readFileSync('.env', 'utf8');
envText.split('\n').forEach(line => {
  const match = line.match(/^([^=]+)=(.*)$/);
  if (match) process.env[match[1].trim()] = match[2].trim();
});

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!);

async function run() {
  console.log('Fetching registrations 1151 to 1398...');
  
  // Ambil event "Syiar QRIS Run" (hanya ada 1 event biasanya, kita ambil saja)
  const { data: eventData } = await supabase.from('events').select('*').limit(1).single();
  
  if (!eventData) {
    console.error('Event not found');
    return;
  }
  
  const { data: registrations, error } = await supabase
    .from('registrations')
    .select('*')
    .in('id', [1113, 1120, 1136])
    .order('id', { ascending: true });
    
  if (error) {
    console.error('Error fetching registrations:', error);
    return;
  }
  
  console.log(`Found ${registrations.length} PAID registrations to process.`);
  
  let successCount = 0;
  let failCount = 0;

  for (const reg of registrations) {
    console.log(`Sending email for REG-${reg.id} to ${reg.email}...`);
    try {
      const success = await sendTicketConfirmedEmail({
        to: reg.email,
        name: reg.name,
        eventTitle: eventData.title.replace(/Fun Run/gi, 'Syiar QRIS Run'),
        eventDate: new Date(eventData.date).toLocaleDateString('id-ID', {
          weekday: 'long',
          year: 'numeric',
          month: 'long',
          day: 'numeric'
        }),
        eventLocation: eventData.location,
        amount: reg.amount,
        regId: reg.id
      });
      
      if (success) {
        successCount++;
        console.log(`✅ Success REG-${reg.id}`);
      } else {
        failCount++;
        console.error(`❌ Failed REG-${reg.id}`);
      }
      
      // Delay to avoid spamming / rate limiting SMTP
      await new Promise(r => setTimeout(r, 2000));
    } catch (e) {
      console.error(`❌ Exception REG-${reg.id}:`, e);
      failCount++;
    }
  }
  
  console.log('--- DONE ---');
  console.log(`Total Success: ${successCount}`);
  console.log(`Total Failed: ${failCount}`);
}

run();
