import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TwilioProvider } from '../../../../src/lib/otp/providers/twilio';

describe('TwilioProvider', () => {
  let provider: TwilioProvider;
  const mockFetch = vi.fn();

  beforeEach(() => {
    mockFetch.mockClear();
    global.fetch = mockFetch;
    provider = new TwilioProvider({
      accountSid: 'ACtest',
      authToken: 'testtoken',
      smsFrom: '+1234567890',
      whatsappFrom: 'whatsapp:+1234567890',
    });
  });

  it('should send SMS successfully', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ sid: 'SM123' }),
    });
    const result = await provider.sendSMS('+911234567890', 'test code');
    expect(result.success).toBe(true);
    expect(result.messageId).toBe('SM123');
    expect(result.provider).toBe('twilio');
  });

  it('should send WhatsApp successfully', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ sid: 'SM456' }),
    });
    const result = await provider.sendWhatsApp('+911234567890', 'test code');
    expect(result.success).toBe(true);
  });

  it('should handle send failure', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      json: () => Promise.resolve({ message: 'Invalid number' }),
    });
    const result = await provider.sendSMS('+910000000000', 'test');
    expect(result.success).toBe(false);
    expect(result.error).toBe('Invalid number');
  });

  it('should report availability correctly', () => {
    expect(provider.isAvailable('sms')).toBe(true);
    expect(provider.isAvailable('whatsapp')).toBe(true);
    expect(provider.isAvailable('email')).toBe(false);
  });

  it('should report email not supported', async () => {
    const result = await provider.sendEmail('test@example.com', 'subject', 'body');
    expect(result.success).toBe(false);
  });
});
