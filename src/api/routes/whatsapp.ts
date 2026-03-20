import { Context } from 'hono';
import { Env } from '../../db/types';
import { PluginManager } from '../../lib/messaging/plugin';
import { WhatsAppPlugin } from '../../lib/messaging/whatsapp-plugin';
import { OnboardingFlowHandler } from '../../lib/messaging/onboarding-flow';

// Global plugin manager
let pluginManager: PluginManager | null = null;
let onboardingHandler: OnboardingFlowHandler | null = null;

function getHandlers(env: Env) {
  if (!pluginManager) {
    pluginManager = new PluginManager();
    pluginManager.register(new WhatsAppPlugin(env.WHATSAPP_ACCESS_TOKEN, env.WHATSAPP_PHONE_NUMBER_ID));
  }
  if (!onboardingHandler) {
    onboardingHandler = new OnboardingFlowHandler(pluginManager, env.DB);
  }
  return { pluginManager, onboardingHandler };
}

export async function whatsappWebhook(c: Context<{ Bindings: Env }>): Promise<Response> {
  try {
    const body = await c.req.json();
    const { pluginManager: pm, onboardingHandler: oh } = getHandlers(c.env);
    
    const whatsapp = pm.get('whatsapp')!;
    const message = whatsapp.parseWebhook(body);
    
    if (!message) {
      return c.json({ ok: true });
    }

    console.log('WhatsApp message:', message);
    await oh.handleMessage(message);
    
    return c.json({ ok: true });
  } catch (error) {
    console.error('WhatsApp webhook error:', error);
    return c.json({ ok: true });
  }
}

export async function whatsappVerify(c: Context<{ Bindings: Env }>): Promise<Response> {
  const mode = c.req.query('hub.mode');
  const token = c.req.query('hub.verify_token');
  const challenge = c.req.query('hub.challenge');
  
  if (mode === 'subscribe' && token === c.env.WHATSAPP_VERIFY_TOKEN) {
    return c.text(challenge || '');
  }
  
  return c.text('Forbidden', 403);
}
