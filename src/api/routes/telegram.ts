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
    appointmentBot = new AppointmentBot(telegram, env.DB);
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
        text: message.text,
        callbackData: message.callbackData,
        type: message.callbackData ? 'callback' : 'message',
      });
    } else {
      await oh.handleMessage(message);
    }

    return c.json({ ok: true });
  } catch (error) {
    console.error('Telegram webhook error:', error);
    return c.json({ ok: true });
  }
}
