import { Context, Next } from 'hono';
import { Env } from '../../db/types';

interface TelegramUser {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
}

export async function telegramAuthMiddleware(c: Context<{ Bindings: Env }>, next: Next): Promise<Response | void> {
  const telegramUserId = c.req.header('X-Telegram-User-Id');
  const telegramUsername = c.req.header('X-Telegram-Username');

  if (!telegramUserId) {
    return c.json({ error: 'Telegram authentication required' }, 401);
  }

  const userId = parseInt(telegramUserId, 10);
  if (isNaN(userId)) {
    return c.json({ error: 'Invalid Telegram user ID' }, 401);
  }

  // Store user info in context for use in handlers
  c.set('telegramUser', {
    id: userId,
    first_name: telegramUsername || 'User',
    username: telegramUsername,
  } as TelegramUser);

  await next();
}

export function getTelegramUser(c: Context): TelegramUser {
  return c.get('telegramUser');
}
