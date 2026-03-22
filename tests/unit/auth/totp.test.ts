import { describe, it, expect } from 'vitest';
import { generateTOTPSecret, generateTOTP, verifyTOTP, base32Encode, base32Decode } from '../../../src/lib/auth/totp';

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
  });
});
