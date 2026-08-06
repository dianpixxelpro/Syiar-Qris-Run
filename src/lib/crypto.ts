import crypto from 'node:crypto';

// Kunci rahasia untuk enkripsi. Sebaiknya ditaruh di .env, tapi kita fallback ke string ini (harus 32 karakter).
const ENCRYPTION_KEY = process.env.URL_SECRET_KEY || 'SyiarQrisRun2026SecretKey1234567'; 
const IV_LENGTH = 16;

/**
 * Mengenkripsi ID integer menjadi string hex acak untuk URL
 */
export function encryptId(id: number): string {
  try {
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY), iv);
    let encrypted = cipher.update(id.toString());
    encrypted = Buffer.concat([encrypted, cipher.final()]);
    // Return format: ivHex-encryptedHex (menggunakan dash agar aman di URL)
    return iv.toString('hex') + '-' + encrypted.toString('hex');
  } catch (error) {
    console.error('Error encrypting ID:', error);
    // Fallback obfuscation sederhana jika crypto gagal
    return Buffer.from(`fallback_${id}`).toString('base64').replace(/=/g, '');
  }
}

export function encryptText(text: string): string {
  try {
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY), iv);
    let encrypted = cipher.update(text, 'utf8');
    encrypted = Buffer.concat([encrypted, cipher.final()]);
    return iv.toString('hex') + '-' + encrypted.toString('hex');
  } catch (error) {
    console.error('Error encrypting text:', error);
    return Buffer.from(`fallback_${text}`).toString('base64').replace(/=/g, '');
  }
}

export function decryptText(hash: string): string | null {
  try {
    if (!hash.includes('-')) {
      const decoded = Buffer.from(hash, 'base64').toString('utf8');
      if (decoded.startsWith('fallback_')) {
        return decoded.slice(9);
      }
      return null;
    }

    const textParts = hash.split('-');
    if (textParts.length !== 2) return null;

    const iv = Buffer.from(textParts[0], 'hex');
    const encryptedText = Buffer.from(textParts[1], 'hex');
    const decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY), iv);
    
    let decrypted = decipher.update(encryptedText);
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    
    return decrypted.toString('utf8');
  } catch (error) {
    return null;
  }
}

/**
 * Mendekripsi string hex dari URL kembali menjadi ID integer
 */
export function decryptId(hash: string): number | null {
  try {
    const text = decryptText(hash);
    if (!text) return null;
    const id = parseInt(text, 10);
    return isNaN(id) ? null : id;
  } catch (error) {
    return null; // Return null jika format tidak valid atau diubah manual
  }
}
