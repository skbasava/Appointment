import { Hono } from 'hono';
import type { Context } from 'hono';
import { PluginManager } from '../../lib/messaging/plugin';
import { TelegramPlugin } from '../../lib/messaging/telegram-plugin';
import { DoctorBot } from '../../lib/messaging/doctor-bot';
import type { Env } from '../../db/types';

let pluginManager: PluginManager | null = null;
let doctorBot: DoctorBot | null = null;

function getHandlers(env: Env) {
  if (!pluginManager) {
    pluginManager = new PluginManager();
    pluginManager.register(new TelegramPlugin(env.DOCTOR_TELEGRAM_BOT_TOKEN));
  }
  if (!doctorBot) {
    const telegram = pluginManager.get('telegram')!;
    doctorBot = new DoctorBot(telegram, env.DB, env);
  }
  return { pluginManager, doctorBot };
}

const doctorTelegram = new Hono();

doctorTelegram.post('/webhook', async (c: Context<{ Bindings: Env }>) => {
  const secret = c.req.header('X-Telegram-Bot-Api-Secret-Token');
  if (secret !== c.env.DOCTOR_WEBHOOK_SECRET) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const body = await c.req.json();
  const { pluginManager: pm, doctorBot: db } = getHandlers(c.env);
  const telegram = pm.get('telegram')!;
  const message = telegram.parseWebhook(body);

  if (!message) return c.json({ ok: true });

  try {
    await db.handleMessage({
      chatId: message.chatId,
      userId: message.userId,
      text: message.text,
      callbackData: message.callbackData,
      type: message.callbackData ? 'callback' : 'message',
    });
  } catch (e) {
    console.error('Doctor bot error:', e);
  }

  return c.json({ ok: true });
});

export default doctorTelegram;
