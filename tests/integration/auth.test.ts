import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock fetch for Twilio API calls
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('OTP Auth Flow', () => {
  beforeEach(() => {
    mockFetch.mockClear();
  });

  describe('generateOTPSession', () => {
    it('should generate a 6-digit code', async () => {
      // The function returns the plain OTP for sending
      // We test it indirectly through the module
      const { generateOTPSession } = await import('../../src/lib/auth/phone-otp');
      // This needs a mock D1 database
      const mockDb = {
        prepare: vi.fn().mockReturnValue({
          bind: vi.fn().mockReturnValue({
            run: vi.fn().mockResolvedValue({}),
          }),
        }),
      };
      const otp = await generateOTPSession(mockDb as any, '+911234567890', 'sms');
      expect(otp).toMatch(/^\d{6}$/);
    });
  });

  describe('issueJWT', () => {
    it('should issue a valid JWT', async () => {
      const { issueJWT } = await import('../../src/lib/auth/phone-otp');
      const token = await issueJWT(
        { sub: 'patient-123', role: 'patient', phone: '+911234567890' },
        'test-secret-at-least-32-chars-long',
        '7d'
      );
      expect(token).toMatch(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
      // Decode payload to verify
      const parts = token.split('.');
      const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
      expect(payload.sub).toBe('patient-123');
      expect(payload.role).toBe('patient');
      expect(payload.exp).toBeGreaterThan(Math.floor(Date.now() / 1000));
    });
  });

  describe('normalizePhone', () => {
    it('should normalize various formats', async () => {
      const { normalizePhone } = await import('../../src/lib/phone/normalize');
      expect(normalizePhone('+91 98765 43210')).toBe('+919876543210');
      expect(normalizePhone('9876543210', '+91')).toBe('+919876543210');
      expect(normalizePhone('09876543210', '+91')).toBe('+919876543210');
    });
  });
});
