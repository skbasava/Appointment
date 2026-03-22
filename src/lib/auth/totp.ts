const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function base32Encode(bytes: Uint8Array): string {
  let bits = '';
  for (const byte of bytes) {
    bits += byte.toString(2).padStart(8, '0');
  }
  let result = '';
  for (let i = 0; i < bits.length; i += 5) {
    const chunk = bits.slice(i, i + 5).padEnd(5, '0');
    result += ALPHABET[parseInt(chunk, 2)];
  }
  return result;
}

export function base32Decode(str: string): Uint8Array {
  let bits = '';
  for (const char of str.toUpperCase()) {
    const index = ALPHABET.indexOf(char);
    if (index === -1) continue;
    bits += index.toString(2).padStart(5, '0');
  }
  const bytes = new Uint8Array(Math.floor(bits.length / 8));
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(bits.slice(i * 8, i * 8 + 8), 2);
  }
  return bytes;
}

export function generateTOTPSecret(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(20));
  return base32Encode(bytes);
}

export async function generateTOTP(secret: string, time?: number): Promise<string> {
  const timeStep = Math.floor((time ?? Date.now()) / 1000 / 30);
  const timeBytes = new ArrayBuffer(8);
  new DataView(timeBytes).setUint32(4, timeStep, false);
  const keyBytes = base32Decode(secret);
  const key = await crypto.subtle.importKey(
    'raw', keyBytes, { name: 'HMAC', hash: 'SHA-1' }, false, ['sign']
  );
  const sigBuffer = await crypto.subtle.sign('HMAC', key, timeBytes);
  const hmac = new Uint8Array(sigBuffer);
  const offset = hmac[hmac.length - 1] & 0x0f;
  const code = (
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff)
  ) % 1000000;
  return code.toString().padStart(6, '0');
}

export async function verifyTOTP(secret: string, code: string): Promise<boolean> {
  const current = await generateTOTP(secret);
  if (current === code) return true;
  // Allow 1 period clock skew
  const before = await generateTOTP(secret, Date.now() - 30000);
  if (before === code) return true;
  const after = await generateTOTP(secret, Date.now() + 30000);
  if (after === code) return true;
  return false;
}
