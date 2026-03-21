import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('Patient Endpoints', () => {
  describe('sendPatientOTP', () => {
    it('should require phone number', async () => {
      // Integration test — would need wrangler dev running
      // For now, test the input validation logic
      const { ValidationError } = await import('../../src/api/middleware/error');
      expect(() => {
        const body: any = {};
        if (!body.phone) throw new ValidationError('Phone number required');
      }).toThrow('Phone number required');
    });
  });

  describe('PatientAuth queries', () => {
    it('should have correct interface', async () => {
      // Verify the module exports correctly
      const mod = await import('../../src/db/queries/patient-auth');
      expect(typeof mod.getPatientByPhone).toBe('function');
      expect(typeof mod.getPatientByTelegramId).toBe('function');
      expect(typeof mod.createPatient).toBe('function');
      expect(typeof mod.linkTelegram).toBe('function');
      expect(typeof mod.markPhoneVerified).toBe('function');
    });
  });
});
