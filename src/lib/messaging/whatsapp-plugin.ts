import { MessagingPlugin, IncomingMessage, OutgoingMessage, MessageButton, PlatformType } from './plugin';

export class WhatsAppPlugin implements MessagingPlugin {
  readonly platform: PlatformType = 'whatsapp';
  private accessToken: string;
  private phoneNumberId: string;

  constructor(accessToken: string, phoneNumberId: string) {
    this.accessToken = accessToken;
    this.phoneNumberId = phoneNumberId;
  }

  async send(chatId: string, message: OutgoingMessage): Promise<boolean> {
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
      return response.ok;
    } catch (error) {
      console.error('WhatsApp send error:', error);
      return false;
    }
  }

  async sendWithButtons(chatId: string, text: string, buttons: MessageButton[][]): Promise<boolean> {
    try {
      const flatButtons = buttons.flat().slice(0, 3);
      
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
                buttons: flatButtons.map(btn => ({
                  type: 'reply',
                  reply: { id: btn.callbackData, title: btn.text.substring(0, 20) },
                })),
              },
            },
          }),
        }
      );
      return response.ok;
    } catch (error) {
      console.error('WhatsApp send buttons error:', error);
      return false;
    }
  }

  async sendImage(chatId: string, imageUrl: string, caption?: string): Promise<boolean> {
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
            type: 'image',
            image: { link: imageUrl, caption },
          }),
        }
      );
      return response.ok;
    } catch (error) {
      console.error('WhatsApp send image error:', error);
      return false;
    }
  }

  parseWebhook(body: any): IncomingMessage | null {
    if (body.entry?.[0]?.changes?.[0]?.value?.messages?.[0]) {
      const message = body.entry[0].changes[0].value.messages[0];
      const contact = body.entry[0].changes[0].value.contacts?.[0];
      
      return {
        platform: 'whatsapp',
        userId: message.from,
        chatId: message.from,
        text: message.text?.body,
        callbackData: message.button?.payload,
        firstName: contact?.profile?.name,
        phoneNumber: message.from,
        imageUrl: message.image?.id,
      };
    }
    return null;
  }
}
