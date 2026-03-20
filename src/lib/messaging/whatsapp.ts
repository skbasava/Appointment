import { MessagingPlatform, IncomingMessage, OutgoingMessage, MessageButton, PlatformType } from './platform';

// WhatsApp Business API adapter
export class WhatsAppAdapter implements MessagingPlatform {
  platform: PlatformType = 'whatsapp';
  private accessToken: string;
  private phoneNumberId: string;

  constructor(accessToken: string, phoneNumberId: string) {
    this.accessToken = accessToken;
    this.phoneNumberId = phoneNumberId;
  }

  async sendMessage(chatId: string, message: OutgoingMessage): Promise<boolean> {
    try {
      const response = await fetch(
        `https://graph.facebook.com/v17.0/${this.phoneNumberId}/messages`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${this.accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            messaging_product: 'whatsapp',
            to: chatId,
            type: 'text',
            text: { body: message.text },
          }),
        }
      );
      
      if (!response.ok) {
        console.error('WhatsApp send error:', await response.text());
      }
      return response.ok;
    } catch (error) {
      console.error('WhatsApp send error:', error);
      return false;
    }
  }

  async sendWithButtons(chatId: string, text: string, buttons: MessageButton[][]): Promise<boolean> {
    try {
      // WhatsApp has different button format - flatten for simple list
      const flatButtons = buttons.flat().slice(0, 3); // WhatsApp limit: 3 buttons
      
      const response = await fetch(
        `https://graph.facebook.com/v17.0/${this.phoneNumberId}/messages`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${this.accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            messaging_product: 'whatsapp',
            to: chatId,
            type: 'interactive',
            interactive: {
              type: 'button',
              body: { text },
              action: {
                buttons: flatButtons.map((btn, i) => ({
                  type: 'reply',
                  reply: {
                    id: btn.callback_data,
                    title: btn.text.substring(0, 20), // WhatsApp limit
                  },
                })),
              },
            },
          }),
        }
      );
      
      if (!response.ok) {
        console.error('WhatsApp send buttons error:', await response.text());
      }
      return response.ok;
    } catch (error) {
      console.error('WhatsApp send buttons error:', error);
      return false;
    }
  }

  async answerCallbackQuery(callbackId: string, text?: string): Promise<boolean> {
    // WhatsApp doesn't have callback queries like Telegram
    return true;
  }

  parseWebhook(body: any): IncomingMessage | null {
    // WhatsApp webhook format
    if (body.entry?.[0]?.changes?.[0]?.value?.messages?.[0]) {
      const message = body.entry[0].changes[0].value.messages[0];
      const contact = body.entry[0].changes[0].value.contacts?.[0];
      
      return {
        platform: 'whatsapp',
        userId: message.from,
        chatId: message.from,
        text: message.text?.body,
        callbackData: message.button?.payload || message.interactive?.list_reply?.id,
        firstName: contact?.profile?.name,
        phoneNumber: message.from,
      };
    }
    return null;
  }

  async getUserInfo(userId: string): Promise<{ name: string; phone?: string } | null> {
    return {
      name: 'WhatsApp User',
      phone: userId,
    };
  }
}
