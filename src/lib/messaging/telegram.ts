import { MessagingPlatform, IncomingMessage, OutgoingMessage, MessageButton, PlatformType } from './platform';

export class TelegramAdapter implements MessagingPlatform {
  platform: PlatformType = 'telegram';
  private token: string;

  constructor(token: string) {
    this.token = token;
  }

  async sendMessage(chatId: string, message: OutgoingMessage): Promise<boolean> {
    try {
      const response = await fetch(`https://api.telegram.org/bot${this.token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text: message.text,
          parse_mode: message.parseMode || 'HTML',
        }),
      });
      
      if (!response.ok) {
        console.error('Telegram send error:', await response.text());
      }
      return response.ok;
    } catch (error) {
      console.error('Telegram send error:', error);
      return false;
    }
  }

  async sendWithButtons(chatId: string, text: string, buttons: MessageButton[][]): Promise<boolean> {
    try {
      const response = await fetch(`https://api.telegram.org/bot${this.token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text,
          parse_mode: 'HTML',
          reply_markup: { inline_keyboard: buttons },
        }),
      });
      
      if (!response.ok) {
        console.error('Telegram send keyboard error:', await response.text());
      }
      return response.ok;
    } catch (error) {
      console.error('Telegram send keyboard error:', error);
      return false;
    }
  }

  async answerCallbackQuery(callbackId: string, text?: string): Promise<boolean> {
    try {
      const response = await fetch(`https://api.telegram.org/bot${this.token}/answerCallbackQuery`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          callback_query_id: callbackId,
          text: text || 'Processing...',
        }),
      });
      return response.ok;
    } catch (error) {
      console.error('Telegram callback answer error:', error);
      return false;
    }
  }

  parseWebhook(body: any): IncomingMessage | null {
    // Handle regular message
    if (body.message) {
      return {
        platform: 'telegram',
        userId: String(body.message.from.id),
        chatId: String(body.message.chat.id),
        text: body.message.text,
        firstName: body.message.from.first_name,
        lastName: body.message.from.last_name,
        username: body.message.from.username,
      };
    }

    // Handle callback query (button click)
    if (body.callback_query) {
      return {
        platform: 'telegram',
        userId: String(body.callback_query.from.id),
        chatId: String(body.callback_query.message?.chat.id || ''),
        callbackData: body.callback_query.data,
        firstName: body.callback_query.from.first_name,
      };
    }

    return null;
  }

  async getUserInfo(userId: string): Promise<{ name: string; phone?: string } | null> {
    // Telegram doesn't provide phone via API without user consent
    return null;
  }
}
