type Channel = 'whatsapp' | 'telegram' | 'web';

export function isOnboardingEnabled(
  channel: Channel,
  env: Record<string, string | boolean>
): boolean {
  if (channel === 'web') return true;
  const flagMap: Record<string, string> = {
    whatsapp: 'ENABLE_WHATSAPP_ONBOARDING',
    telegram: 'ENABLE_TELEGRAM_ONBOARDING',
  };
  const flag = flagMap[channel];
  return env[flag] === 'true' || env[flag] === true;
}

export function isTwilioOTPEnabled(env: Record<string, string | boolean>): boolean {
  return env['USE_TWILIO_OTP'] === 'true' || env['USE_TWILIO_OTP'] === true;
}
