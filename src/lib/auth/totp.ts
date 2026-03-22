import QRCode from 'qrcode';

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
    if (index === -1) {
      throw new Error(`Invalid base32 character: '${char}'`);
    }
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

function constantTimeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

export async function verifyTOTP(secret: string, code: string): Promise<boolean> {
  const current = await generateTOTP(secret);
  if (constantTimeCompare(current, code)) return true;
  // Allow 1 period clock skew
  const before = await generateTOTP(secret, Date.now() - 30000);
  if (constantTimeCompare(before, code)) return true;
  const after = await generateTOTP(secret, Date.now() + 30000);
  if (constantTimeCompare(after, code)) return true;
  return false;
}

export function generateTOTPUri(secret: string, label: string, issuer: string): string {
  return `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(label)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;
}

export async function generateQRCode(uri: string): Promise<Uint8Array> {
  // Use QRCode.create() for matrix-only generation (no canvas needed)
  const qr = QRCode.create(uri, { errorCorrectionLevel: 'L' });
  const modules = qr.modules;
  const moduleCount = modules.size;
  const scale = 8; // 1 module = 8x8 pixels
  const margin = 2 * scale;
  const imageSize = moduleCount * scale + margin * 2;

  // Build grayscale pixel data (row by row, filter byte + pixels)
  const rowBytes = 1 + imageSize; // filter byte + pixel bytes
  const raw = new Uint8Array(rowBytes * imageSize);

  for (let y = 0; y < imageSize; y++) {
    const rowOffset = y * rowBytes;
    raw[rowOffset] = 0; // No filter
    for (let x = 0; x < imageSize; x++) {
      // Map pixel to module coordinate
      const mx = Math.floor((x - margin) / scale);
      const my = Math.floor((y - margin) / scale);
      const inBounds = mx >= 0 && mx < moduleCount && my >= 0 && my < moduleCount;
      const isDark = inBounds && modules.get(mx, my);
      raw[rowOffset + 1 + x] = isDark ? 0x00 : 0xff; // 0=black, 255=white
    }
  }

  // Encode as PNG
  return encodeGrayscalePNG(imageSize, imageSize, raw);
}

// Minimal PNG encoder — no canvas, no Buffer, works in Cloudflare Workers
async function encodeGrayscalePNG(width: number, height: number, rawPixels: Uint8Array): Promise<Uint8Array> {
  const crc32Table = buildCRC32Table();

  function writeChunk(type: string, data: Uint8Array): Uint8Array {
    const typeBytes = new TextEncoder().encode(type);
    const len = data.length;
    const chunk = new Uint8Array(4 + typeBytes.length + data.length + 4);
    // Length (big-endian)
    new DataView(chunk.buffer).setUint32(0, len);
    chunk.set(typeBytes, 4);
    chunk.set(data, 4 + typeBytes.length);
    // CRC32 of type + data
    const crcData = chunk.subarray(4, 4 + typeBytes.length + data.length);
    const crc = crc32(crc32Table, crcData);
    new DataView(chunk.buffer).setUint32(4 + typeBytes.length + data.length, crc);
    return chunk;
  }

  // IHDR
  const ihdr = new Uint8Array(13);
  const ihdrView = new DataView(ihdr.buffer);
  ihdrView.setUint32(0, width);
  ihdrView.setUint32(4, height);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 0;  // color type 0 = grayscale
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace

  // Compress pixel data using CompressionStream (deflate)
  const compressed = await deflate(rawPixels);

  // Build PNG file
  const signature = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdrChunk = writeChunk('IHDR', ihdr);
  const idatChunk = writeChunk('IDAT', compressed);
  const iendChunk = writeChunk('IEND', new Uint8Array(0));

  const totalLen = signature.length + ihdrChunk.length + idatChunk.length + iendChunk.length;
  const png = new Uint8Array(totalLen);
  let offset = 0;
  png.set(signature, offset); offset += signature.length;
  png.set(ihdrChunk, offset); offset += ihdrChunk.length;
  png.set(idatChunk, offset); offset += idatChunk.length;
  png.set(iendChunk, offset);
  return png;
}

async function deflate(data: Uint8Array): Promise<Uint8Array> {
  const cs = new CompressionStream('deflate');
  const writer = cs.writable.getWriter();
  writer.write(data);
  writer.close();
  const reader = cs.readable.getReader();
  const chunks: Uint8Array[] = [];
  let totalLen = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    totalLen += value.length;
  }
  const result = new Uint8Array(totalLen);
  let pos = 0;
  for (const chunk of chunks) {
    result.set(chunk, pos);
    pos += chunk.length;
  }
  return result;
}

function buildCRC32Table(): Uint32Array {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    }
    table[n] = c;
  }
  return table;
}

function crc32(table: Uint32Array, data: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i++) {
    crc = table[(crc ^ data[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
