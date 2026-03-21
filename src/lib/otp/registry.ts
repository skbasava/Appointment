import type { OTPDeliveryProvider, DeliveryResult } from './provider';

export class OTPProviderRegistry {
  private providers = new Map<string, OTPDeliveryProvider>();
  private channelMap = new Map<string, string>();

  register(provider: OTPDeliveryProvider): void {
    this.providers.set(provider.name, provider);
  }

  setChannelProvider(channel: 'sms' | 'whatsapp' | 'email', providerName: string): void {
    this.channelMap.set(channel, providerName);
  }

  getProvider(channel: 'sms' | 'whatsapp' | 'email'): OTPDeliveryProvider {
    const name = this.channelMap.get(channel);
    if (!name) throw new Error(`No provider configured for channel: ${channel}`);
    const provider = this.providers.get(name);
    if (!provider) throw new Error(`Provider not found: ${name}`);
    if (!provider.isAvailable(channel)) throw new Error(`Provider ${name} not available for ${channel}`);
    return provider;
  }

  async sendOTP(channel: 'sms' | 'whatsapp', phone: string, code: string): Promise<DeliveryResult> {
    const provider = this.getProvider(channel);
    const message = `Your verification code is: ${code}`;
    if (channel === 'sms') return provider.sendSMS(phone, message);
    return provider.sendWhatsApp(phone, message);
  }

  async sendOTPWithFallback(phone: string, code: string): Promise<DeliveryResult> {
    try {
      const result = await this.sendOTP('whatsapp', phone, code);
      if (result.success) return result;
    } catch {
      // whatsapp not configured or unavailable, fall through
    }
    return this.sendOTP('sms', phone, code);
  }
}
