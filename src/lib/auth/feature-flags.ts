type Channel = 'whatsapp' | 'telegram' | 'web';

export function isOnboardingEnabled(
  channel: Channel,
  env: Record<string, string>
): boolean {
  if (channel === 'web') return true;
  const flagMap: Record<string, string> = {
    whatsapp: 'ENABLE_WHATSAPP_ONBOARDING',
    telegram: 'ENABLE_TELEGRAM_ONBOARDING',
  };
  const flag = flagMap[channel];
  return env[flag] === 'true';
}
