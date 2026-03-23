import { Context } from 'hono';
import { Env } from '../../db/types';
import { PluginManager } from '../../lib/messaging/plugin';
import { TelegramPlugin } from '../../lib/messaging/telegram-plugin';
import { OnboardingFlowHandler } from '../../lib/messaging/onboarding-flow';
import { AppointmentBot } from '../../lib/messaging/appointment-bot';
import { RateLimiter } from '../../lib/auth/rate-limiter';
import { routeMessage } from '../../lib/messaging/router';
import { getPatientByTelegramId } from '../../db/queries/patient-auth';

// Global handlers
let pluginManager: PluginManager | null = null;
let onboardingHandler: OnboardingFlowHandler | null = null;
let appointmentBot: AppointmentBot | null = null;

const rateLimiter = new RateLimiter({ windowMs: 60000, maxRequests: 15 });

function verifyTelegramSecret(c: Context, secret: string): boolean {
  const token = c.req.header('X-Telegram-Bot-Api-Secret-Token');
  return token === secret;
}

function getHandlers(env: Env) {
  if (!pluginManager) {
    pluginManager = new PluginManager();
    pluginManager.register(new TelegramPlugin(env.TELEGRAM_BOT_TOKEN));
  }
  if (!onboardingHandler) {
    onboardingHandler = new OnboardingFlowHandler(pluginManager, env.DB, env as unknown as Record<string, string>);
  }
  if (!appointmentBot) {
    const telegram = pluginManager.get('telegram')!;
    appointmentBot = new AppointmentBot(telegram, env.DB, env);
  }
  return { pluginManager, onboardingHandler, appointmentBot };
}

export async function telegramWebhook(c: Context<{ Bindings: Env }>): Promise<Response> {
  try {
    // Verify secret token
    if (c.env.TELEGRAM_WEBHOOK_SECRET) {
      if (!verifyTelegramSecret(c, c.env.TELEGRAM_WEBHOOK_SECRET)) {
        return c.json({ error: 'Forbidden' }, 403);
      }
    }

    const body = await c.req.json();
    const { pluginManager: pm, onboardingHandler: oh, appointmentBot: ab } = getHandlers(c.env);

    const telegram = pm.get('telegram')!;
    const message = telegram.parseWebhook(body);

    if (!message) {
      return c.json({ ok: true });
    }

    // Rate limiting by telegram user ID
    if (!rateLimiter.isAllowed(message.userId)) {
      return c.json({ error: 'Rate limit exceeded' }, 429);
    }

    // Check if user is registered
    const patient = await getPatientByTelegramId(c.env.DB, message.userId);
    const isRegistered = !!patient;

    // Route the message
    const command = message.text?.split(' ')[0];

    // Registration commands and /help always go to onboarding handler
    const onboardingCommands = ['/register_doctor', '/register_patient', '/register_hospital', '/help', '/start'];
    const isOnboardingCommand = onboardingCommands.includes(command || '');

    // Check if user has an active onboarding session (in the middle of registration)
    // Check regardless of isRegistered — doctors register via providers table, not patient_auth
    let hasActiveSession = false;
    if (!isOnboardingCommand) {
      try {
        const session = await oh.getSession(message.platform, message.userId, message.chatId);
        const terminalSteps = ['start', 'doctor_complete', 'patient_complete'];
        hasActiveSession = !terminalSteps.includes(session.step);
        if (hasActiveSession) {
          console.log('Active session found:', session.step, 'for user:', message.userId);
        }
      } catch { /* no session */ }
    }

    if (isOnboardingCommand || hasActiveSession) {
      console.log('Calling onboarding handler for:', message.userId, hasActiveSession ? '(active session)' : '');
      const result = await oh.handleMessage(message);
      console.log('Onboarding handler result:', result);
    } else {
      const route = routeMessage({
        channel: 'telegram',
        identifier: message.userId,
        isRegistered,
        command,
        env: c.env as unknown as Record<string, string>,
      });

      console.log('Telegram message:', message, 'route:', route);

      if (route === 'disabled') {
        return c.json({ ok: true });
      }

      if (route === 'appointment') {
        await ab.handleMessage({
          chatId: message.chatId,
          userId: message.userId,
          text: message.text,
          callbackData: message.callbackData,
          type: message.callbackData ? 'callback' : 'message',
        });
      } else {
        console.log('Calling onboarding handler for:', message.userId);
        const result = await oh.handleMessage(message);
        console.log('Onboarding handler result:', result);
      }
    }

    return c.json({ ok: true });
  } catch (error) {
    console.error('Telegram webhook error:', error);
    return c.json({ ok: true });
  }
}
