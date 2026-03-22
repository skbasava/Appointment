import { describe, it, expect } from 'vitest';
import { generateTOTPSecret, generateTOTP, verifyTOTP, base32Encode, base32Decode, generateTOTPUri, generateQRCode } from '../../../src/lib/auth/totp';

describe('TOTP', () => {
  describe('base32Encode/base32Decode', () => {
    it('should encode and decode round-trip', () => {
      const bytes = new Uint8Array([0x48, 0x65, 0x6c, 0x6c, 0x6f]); // "Hello"
      const encoded = base32Encode(bytes);
      const decoded = base32Decode(encoded);
      expect(decoded).toEqual(bytes);
    });

    it('should produce known base32 output', () => {
      const bytes = new Uint8Array([0x48, 0x65, 0x6c, 0x6c, 0x6f]);
      expect(base32Encode(bytes)).toBe('JBSWY3DP');
    });

    it('should throw on invalid base32 characters', () => {
      expect(() => base32Decode('INVALID!')).toThrow('Invalid base32 character');
      expect(() => base32Decode('JBSWY3DP ')).toThrow('Invalid base32 character');
      expect(() => base32Decode('hello8')).toThrow('Invalid base32 character');
    });
  });

  describe('generateTOTPSecret', () => {
    it('should generate a base32-encoded secret', () => {
      const secret = generateTOTPSecret();
      expect(secret).toMatch(/^[A-Z2-7]+$/);
      expect(secret.length).toBeGreaterThanOrEqual(16);
    });
  });

  describe('generateTOTP', () => {
    it('should generate a 6-digit code', async () => {
      const code = await generateTOTP('JBSWY3DPEHPK3PXP');
      expect(code).toMatch(/^\d{6}$/);
    });

    it('should produce consistent codes for same time', async () => {
      const time = 1000000;
      const code1 = await generateTOTP('JBSWY3DPEHPK3PXP', time);
      const code2 = await generateTOTP('JBSWY3DPEHPK3PXP', time);
      expect(code1).toBe(code2);
    });
  });

  describe('verifyTOTP', () => {
    it('should verify a correct TOTP code', async () => {
      const secret = 'JBSWY3DPEHPK3PXP';
      const code = await generateTOTP(secret);
      const result = await verifyTOTP(secret, code);
      expect(result).toBe(true);
    });

    it('should reject an incorrect code', async () => {
      const result = await verifyTOTP('JBSWY3DPEHPK3PXP', '000000');
      expect(result).toBe(false);
    });

    it('should verify code from previous time period (clock skew backward)', async () => {
      const secret = 'JBSWY3DPEHPK3PXP';
      const pastTime = Date.now() - 30000;
      const code = await generateTOTP(secret, pastTime);
      const result = await verifyTOTP(secret, code);
      expect(result).toBe(true);
    });

    it('should verify code from next time period (clock skew forward)', async () => {
      const secret = 'JBSWY3DPEHPK3PXP';
      const futureTime = Date.now() + 30000;
      const code = await generateTOTP(secret, futureTime);
      const result = await verifyTOTP(secret, code);
      expect(result).toBe(true);
    });

    it('should reject code from 2 periods in the past', async () => {
      const secret = 'JBSWY3DPEHPK3PXP';
      const farPast = Date.now() - 60000;
      const code = await generateTOTP(secret, farPast);
      const result = await verifyTOTP(secret, code);
      expect(result).toBe(false);
    });

    it('should reject code from 2 periods in the future', async () => {
      const secret = 'JBSWY3DPEHPK3PXP';
      const farFuture = Date.now() + 60000;
      const code = await generateTOTP(secret, farFuture);
      const result = await verifyTOTP(secret, code);
      expect(result).toBe(false);
    });
  });

  describe('generateTOTPUri', () => {
    it('should generate a valid otpauth URI', () => {
      const uri = generateTOTPUri('JBSWY3DPEHPK3PXP', 'Dr. Smith', 'Appoint');
      expect(uri).toContain('otpauth://totp/');
      expect(uri).toContain('secret=JBSWY3DPEHPK3PXP');
      expect(uri).toContain('issuer=Appoint');
      expect(uri).toContain('algorithm=SHA1');
      expect(uri).toContain('digits=6');
      expect(uri).toContain('period=30');
    });

    it('should encode special characters in label and issuer', () => {
      const uri = generateTOTPUri('SECRET', 'Dr. John Doe', 'My App');
      expect(uri).toContain('Dr.%20John%20Doe');
      expect(uri).toContain('My%20App');
    });
  });

  describe('generateQRCode', () => {
    it('should return PNG bytes', async () => {
      const uri = 'otpauth://totp/Appoint:Dr.Test?secret=JBSWY3DPEHPK3PXP&issuer=Appoint';
      const png = await generateQRCode(uri);
      expect(png[0]).toBe(137);
      expect(png[1]).toBe(80);
      expect(png[2]).toBe(78);
      expect(png[3]).toBe(71);
    });
  });
});
