import { MessagingPlugin, IncomingMessage, OutgoingMessage, MessageButton, PlatformType } from './plugin';

export class TelegramPlugin implements MessagingPlugin {
  readonly platform: PlatformType = 'telegram';
  private token: string;

  constructor(token: string) {
    this.token = token;
  }

  async send(chatId: string, message: OutgoingMessage): Promise<boolean> {
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
      return response.ok;
    } catch (error) {
      console.error('Telegram send error:', error);
      return false;
    }
  }

  async sendWithButtons(chatId: string, text: string, buttons: MessageButton[][]): Promise<boolean> {
    try {
      const inlineButtons = buttons.map(row =>
        row.map(btn => ({ text: btn.text, callback_data: btn.callbackData }))
      );
      
      console.log('TelegramPlugin.sendWithButtons:', { chatId, text: text.substring(0, 50), tokenLen: this.token.length });
      const response = await fetch(`https://api.telegram.org/bot${this.token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text,
          parse_mode: 'HTML',
          reply_markup: { inline_keyboard: inlineButtons },
        }),
      });
      const data = await response.json() as any;
      console.log('TelegramPlugin.sendWithButtons response:', { ok: response.ok, status: response.status, description: data?.description });
      return response.ok;
    } catch (error) {
      console.error('Telegram send buttons error:', error);
      return false;
    }
  }

  async sendImage(chatId: string, imageUrl: string, caption?: string): Promise<boolean> {
    try {
      const response = await fetch(`https://api.telegram.org/bot${this.token}/sendPhoto`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          photo: imageUrl,
          caption,
          parse_mode: 'HTML',
        }),
      });
      return response.ok;
    } catch (error) {
      console.error('Telegram send image error:', error);
      return false;
    }
  }

  async sendImageBuffer(chatId: string, pngBytes: Uint8Array, caption?: string): Promise<boolean> {
    try {
      const formData = new FormData();
      formData.append('chat_id', chatId);
      formData.append('photo', new Blob([pngBytes], { type: 'image/png' }), 'qrcode.png');
      if (caption) formData.append('caption', caption);
      formData.append('parse_mode', 'HTML');

      const response = await fetch(`https://api.telegram.org/bot${this.token}/sendPhoto`, {
        method: 'POST',
        body: formData,
      });
      return response.ok;
    } catch (error) {
      console.error('Telegram send image buffer error:', error);
      return false;
    }
  }

  parseWebhook(body: any): IncomingMessage | null {
    // Handle text message
    if (body.message) {
      return {
        platform: 'telegram',
        userId: String(body.message.from.id),
        chatId: String(body.message.chat.id),
        text: body.message.text,
        firstName: body.message.from.first_name,
        lastName: body.message.from.last_name,
        username: body.message.from.username,
        imageUrl: body.message.photo ? body.message.photo[body.message.photo.length - 1].file_id : undefined,
        documentUrl: body.message.document?.file_id,
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

  async answerCallback(callbackId: string, text?: string): Promise<boolean> {
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
      console.error('Telegram answer callback error:', error);
      return false;
    }
  }
}
