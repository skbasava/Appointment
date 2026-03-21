import { OTPProviderRegistry } from '../registry';
import { TwilioProvider } from './twilio';

interface EnvConfig {
  OTP_PROVIDER_SMS?: string;
  OTP_PROVIDER_WHATSAPP?: string;
  TWILIO_ACCOUNT_SID?: string;
  TWILIO_AUTH_TOKEN?: string;
  TWILIO_PHONE_NUMBER?: string;
  TWILIO_WHATSAPP_NUMBER?: string;
}

export function createProviderRegistry(env: EnvConfig): OTPProviderRegistry {
  const registry = new OTPProviderRegistry();

  if (env.TWILIO_ACCOUNT_SID && env.TWILIO_AUTH_TOKEN && env.TWILIO_PHONE_NUMBER) {
    registry.register(new TwilioProvider({
      accountSid: env.TWILIO_ACCOUNT_SID,
      authToken: env.TWILIO_AUTH_TOKEN,
      smsFrom: env.TWILIO_PHONE_NUMBER,
      whatsappFrom: env.TWILIO_WHATSAPP_NUMBER || '',
    }));
  }

  if (env.OTP_PROVIDER_SMS) registry.setChannelProvider('sms', env.OTP_PROVIDER_SMS);
  if (env.OTP_PROVIDER_WHATSAPP) registry.setChannelProvider('whatsapp', env.OTP_PROVIDER_WHATSAPP);

  return registry;
}
