import { describe, it, expect } from 'vitest';
import { isOnboardingEnabled } from '../../../src/lib/auth/feature-flags';

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
