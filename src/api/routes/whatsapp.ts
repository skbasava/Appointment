import { Context } from 'hono';
import { Env } from '../../db/types';
import { PluginManager } from '../../lib/messaging/plugin';
import { WhatsAppPlugin } from '../../lib/messaging/whatsapp-plugin';
import { OnboardingFlowHandler } from '../../lib/messaging/onboarding-flow';
import { RateLimiter } from '../../lib/auth/rate-limiter';
import { routeMessage } from '../../lib/messaging/router';

// Global plugin manager
let pluginManager: PluginManager | null = null;
let onboardingHandler: OnboardingFlowHandler | null = null;
let rateLimiter: RateLimiter | null = null;

function getHandlers(env: Env) {
  if (!pluginManager) {
    pluginManager = new PluginManager();
    pluginManager.register(new WhatsAppPlugin(env.WHATSAPP_ACCESS_TOKEN, env.WHATSAPP_PHONE_NUMBER_ID));
  }
  if (!onboardingHandler) {
    onboardingHandler = new OnboardingFlowHandler(pluginManager, env.DB, env as unknown as Record<string, string>);
  }
  if (!rateLimiter) {
    rateLimiter = new RateLimiter({ windowMs: 60000, maxRequests: 15 });
  }
  return { pluginManager, onboardingHandler, rateLimiter };
}

async function verifyWhatsAppSignature(body: string, signature: string, appSecret: string): Promise<boolean> {
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(appSecret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const sigBuffer = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body));
  const expected = Array.from(new Uint8Array(sigBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
  return `sha256=${expected}` === signature;
}

export async function whatsappWebhook(c: Context<{ Bindings: Env }>): Promise<Response> {
  try {
    const rawBody = await c.req.text();

    // Signature verification
    if (c.env.WHATSAPP_APP_SECRET) {
      const signature = c.req.header('X-Hub-Signature-256');
      if (!signature) {
        return c.json({ ok: false, error: 'Missing signature' }, 401);
      }
      const valid = await verifyWhatsAppSignature(rawBody, signature, c.env.WHATSAPP_APP_SECRET);
      if (!valid) {
        return c.json({ ok: false, error: 'Invalid signature' }, 401);
      }
    }

    const body = JSON.parse(rawBody);
    const { pluginManager: pm, onboardingHandler: oh, rateLimiter: rl } = getHandlers(c.env);

    const whatsapp = pm.get('whatsapp')!;
    const message = whatsapp.parseWebhook(body);

    if (!message) {
      return c.json({ ok: true });
    }

    // Rate limiting
    if (!rl.isAllowed(message.phoneNumber || message.chatId)) {
      return c.json({ ok: false, error: 'Rate limited' }, 429);
    }

    // Check if user is registered
    const phoneNumber = message.phoneNumber || message.chatId;
    let isRegistered = false;
    try {
      const patient = await c.env.DB.prepare(
        'SELECT id FROM patient_auth WHERE phone = ?'
      ).bind(phoneNumber).first();
      const provider = await c.env.DB.prepare(
        'SELECT id FROM providers WHERE whatsapp_id = ? OR phone = ?'
      ).bind(message.chatId, phoneNumber).first();
      isRegistered = !!(patient || provider);
    } catch (e) {
      console.error('Registration lookup error:', e);
    }

    // Route the message
    const target = routeMessage({
      channel: 'whatsapp',
      identifier: phoneNumber,
      isRegistered,
      command: message.text?.startsWith('/') ? message.text.split(' ')[0] : undefined,
      env: c.env as unknown as Record<string, string>,
    });

    if (target === 'disabled') {
      return c.json({ ok: true });
    }

    console.log('WhatsApp message:', message, 'route:', target);
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
