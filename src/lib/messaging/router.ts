import { isOnboardingEnabled } from '../auth/feature-flags';

export type RouteTarget = 'onboarding' | 'appointment' | 'disabled';

export interface RouteInput {
  channel: 'whatsapp' | 'telegram' | 'web';
  identifier: string;        // phone number or telegram_id
  isRegistered: boolean;
  command?: string;
  env: Record<string, string>;
}

export function routeMessage(input: RouteInput): RouteTarget {
  // Registered users always go to appointment bot
  if (input.isRegistered) return 'appointment';

  // /register or /start from unregistered user → check if onboarding is enabled
  if (input.command === '/register' || input.command === '/start') {
    if (isOnboardingEnabled(input.channel, input.env)) return 'onboarding';
    return 'disabled';
  }

  // Unknown command from unregistered user → try onboarding if enabled
  if (isOnboardingEnabled(input.channel, input.env)) return 'onboarding';
  return 'disabled';
}
