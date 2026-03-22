import { describe, it, expect } from 'vitest';
import { isOnboardingEnabled, isTwilioOTPEnabled } from '../../../src/lib/auth/feature-flags';

describe('isOnboardingEnabled', () => {
  it('should return true when flag is "true"', () => {
    expect(isOnboardingEnabled('whatsapp', { ENABLE_WHATSAPP_ONBOARDING: 'true' })).toBe(true);
  });
  it('should return false when flag is "false"', () => {
    expect(isOnboardingEnabled('whatsapp', { ENABLE_WHATSAPP_ONBOARDING: 'false' })).toBe(false);
  });
  it('should return false when flag is missing', () => {
    expect(isOnboardingEnabled('whatsapp', {})).toBe(false);
  });
  it('should return true for web channel always', () => {
    expect(isOnboardingEnabled('web', {})).toBe(true);
  });
});

describe('isTwilioOTPEnabled', () => {
  it('should return true when USE_TWILIO_OTP is "true"', () => {
    expect(isTwilioOTPEnabled({ USE_TWILIO_OTP: 'true' })).toBe(true);
  });

  it('should return false when not set', () => {
    expect(isTwilioOTPEnabled({})).toBe(false);
  });

  it('should return false when set to "false"', () => {
    expect(isTwilioOTPEnabled({ USE_TWILIO_OTP: 'false' })).toBe(false);
  });
});
