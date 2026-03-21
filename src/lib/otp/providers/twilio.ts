import type { OTPDeliveryProvider, DeliveryResult } from '../provider';

interface TwilioConfig {
  accountSid: string;
  authToken: string;
  smsFrom: string;
  whatsappFrom: string;
}

export class TwilioProvider implements OTPDeliveryProvider {
  name = 'twilio';
  private config: TwilioConfig;

  constructor(config: TwilioConfig) {
    this.config = config;
  }

  isAvailable(channel: 'sms' | 'whatsapp' | 'email'): boolean {
    return channel === 'sms' || channel === 'whatsapp';
  }

  async sendSMS(phone: string, message: string): Promise<DeliveryResult> {
    return this.send(phone, message, this.config.smsFrom);
  }

  async sendWhatsApp(phone: string, message: string): Promise<DeliveryResult> {
    return this.send(`whatsapp:${phone}`, message, this.config.whatsappFrom);
  }

  async sendEmail(): Promise<DeliveryResult> {
    return { success: false, error: 'Email not supported by Twilio provider', provider: this.name };
  }

  private async send(to: string, body: string, from: string): Promise<DeliveryResult> {
    const url = `https://api.twilio.com/2010-04-01/Accounts/${this.config.accountSid}/Messages.json`;
    const auth = btoa(`${this.config.accountSid}:${this.config.authToken}`);

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${auth}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({ To: to, From: from, Body: body }),
      });

      const data = await res.json() as { sid?: string; message?: string };
      if (!res.ok) {
        return { success: false, error: data.message || 'Unknown error', provider: this.name };
      }
      return { success: true, messageId: data.sid, provider: this.name };
    } catch (err) {
      return { success: false, error: String(err), provider: this.name };
    }
  }
}
