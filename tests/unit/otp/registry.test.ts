import { describe, it, expect, beforeEach } from 'vitest';
import { OTPProviderRegistry } from '../../../src/lib/otp/registry';
import type { OTPDeliveryProvider, DeliveryResult } from '../../../src/lib/otp/provider';

const mockProvider: OTPDeliveryProvider = {
  name: 'mock',
  isAvailable: (ch) => ch === 'sms',
  sendSMS: async () => ({ success: true, provider: 'mock' }),
  sendWhatsApp: async () => ({ success: false, error: 'not available', provider: 'mock' }),
  sendEmail: async () => ({ success: false, error: 'not available', provider: 'mock' }),
};

describe('OTPProviderRegistry', () => {
  let registry: OTPProviderRegistry;
  beforeEach(() => {
    registry = new OTPProviderRegistry();
    registry.register(mockProvider);
    registry.setChannelProvider('sms', 'mock');
  });

  it('should return provider for available channel', () => {
    const p = registry.getProvider('sms');
    expect(p.name).toBe('mock');
  });

  it('should throw for unavailable channel', () => {
    expect(() => registry.getProvider('email')).toThrow();
  });

  it('should send OTP via SMS', async () => {
    const result = await registry.sendOTP('sms', '+911234567890', '123456');
    expect(result.success).toBe(true);
  });

  it('should fallback from whatsapp to sms', async () => {
    // Register a whatsapp provider that fails
    const whatsappProvider: OTPDeliveryProvider = {
      name: 'whatsapp-fail',
      isAvailable: (ch) => ch === 'whatsapp',
      sendSMS: async () => ({ success: false, error: 'fail', provider: 'whatsapp-fail' }),
      sendWhatsApp: async () => ({ success: false, error: 'fail', provider: 'whatsapp-fail' }),
      sendEmail: async () => ({ success: false, error: 'not available', provider: 'whatsapp-fail' }),
    };
    registry.register(whatsappProvider);
    registry.setChannelProvider('whatsapp', 'whatsapp-fail');
    registry.setChannelProvider('sms', 'mock');
    const result = await registry.sendOTPWithFallback('+911234567890', '123456');
    expect(result.provider).toBe('mock');
  });
});
