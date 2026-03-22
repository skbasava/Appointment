import { describe, it, expect, vi, beforeEach } from 'vitest';
import { sendFirebaseVerificationCode, verifyFirebaseCode } from '../../../src/lib/auth/firebase-phone';

const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('Firebase Phone Auth', () => {
  const env = { FIREBASE_API_KEY: 'test-api-key', FIREBASE_PROJECT_ID: 'test-project' } as any;

  beforeEach(() => {
    mockFetch.mockClear();
  });

  describe('sendFirebaseVerificationCode', () => {
    it('should call Firebase API with correct parameters', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ sessionInfo: 'session-123' }),
      });

      const sessionInfo = await sendFirebaseVerificationCode('+911234567890', env);

      expect(mockFetch).toHaveBeenCalledWith(
        'https://identitytoolkit.googleapis.com/v1/accounts:sendVerificationCode?key=test-api-key',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ phoneNumber: '+911234567890', recaptchaToken: 'skip' }),
        })
      );
      expect(sessionInfo).toBe('session-123');
    });

    it('should throw on API error', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: async () => ({ error: { message: 'INVALID_PHONE_NUMBER' } }),
      });

      await expect(sendFirebaseVerificationCode('+invalid', env))
        .rejects.toThrow('Firebase send verification failed');
    });

    it('should throw on network error', async () => {
      mockFetch.mockRejectedValueOnce(new Error('DNS resolution failed'));

      await expect(sendFirebaseVerificationCode('+911234567890', env))
        .rejects.toThrow('Firebase send verification failed: network error');
    });
  });

  describe('verifyFirebaseCode', () => {
    it('should return ID token on success', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ idToken: 'firebase-id-token-123' }),
      });

      const result = await verifyFirebaseCode('session-123', '123456', env);

      expect(result.idToken).toBe('firebase-id-token-123');
      expect(mockFetch).toHaveBeenCalledWith(
        'https://identitytoolkit.googleapis.com/v1/accounts:signInWithPhoneNumber?key=test-api-key',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ sessionInfo: 'session-123', code: '123456' }),
        })
      );
    });

    it('should throw on invalid code', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: async () => ({ error: { message: 'INVALID_CODE' } }),
      });

      await expect(verifyFirebaseCode('session-123', '000000', env))
        .rejects.toThrow('Firebase verification failed');
    });

    it('should throw on network error', async () => {
      mockFetch.mockRejectedValueOnce(new Error('DNS resolution failed'));

      await expect(verifyFirebaseCode('session-123', '123456', env))
        .rejects.toThrow('Firebase verification failed: network error');
    });
  });
});
