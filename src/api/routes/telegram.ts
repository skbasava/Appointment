import { Context } from 'hono';
import { Env } from '../../db/types';
import { PluginManager } from '../../lib/messaging/plugin';
import { TelegramPlugin } from '../../lib/messaging/telegram-plugin';
import { OnboardingFlowHandler } from '../../lib/messaging/onboarding-flow';

// Global plugin manager
let pluginManager: PluginManager | null = null;
let onboardingHandler: OnboardingFlowHandler | null = null;

function getHandlers(env: Env) {
  if (!pluginManager) {
    pluginManager = new PluginManager();
    pluginManager.register(new TelegramPlugin(env.TELEGRAM_BOT_TOKEN));
  }
  if (!onboardingHandler) {
    onboardingHandler = new OnboardingFlowHandler(pluginManager, env.DB);
  }
  return { pluginManager, onboardingHandler };
}

export async function telegramWebhook(c: Context<{ Bindings: Env }>): Promise<Response> {
  try {
    const body = await c.req.json();
    const { pluginManager: pm, onboardingHandler: oh } = getHandlers(c.env);
    
    const telegram = pm.get('telegram')!;
    const message = telegram.parseWebhook(body);
    
    if (!message) {
      return c.json({ ok: true });
    }

    console.log('Telegram message:', message);
    await oh.handleMessage(message);
    
    return c.json({ ok: true });
  } catch (error) {
    console.error('Telegram webhook error:', error);
    return c.json({ ok: true });
  }
}
