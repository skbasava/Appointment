// Abstract messaging platform interface
// Supports: Telegram, WhatsApp, Snapchat, Arattai, SMS

export type PlatformType = 'telegram' | 'whatsapp' | 'snapchat' | 'arattai' | 'sms';

export interface MessageButton {
  text: string;
  callback_data: string;
}

export interface IncomingMessage {
  platform: PlatformType;
  userId: string;        // Platform-specific user ID
  chatId: string;        // Platform-specific chat ID
  text?: string;
  callbackData?: string; // For button clicks
  firstName?: string;
  lastName?: string;
  username?: string;
  phoneNumber?: string;
}

export interface OutgoingMessage {
  text: string;
  buttons?: MessageButton[][];
  parseMode?: 'HTML' | 'Markdown';
}

// Abstract messaging platform interface
export interface MessagingPlatform {
  platform: PlatformType;
  
  // Send a text message
  sendMessage(chatId: string, message: OutgoingMessage): Promise<boolean>;
  
  // Send a message with inline buttons
  sendWithButtons(chatId: string, text: string, buttons: MessageButton[][]): Promise<boolean>;
  
  // Answer a callback query (button click)
  answerCallbackQuery(callbackId: string, text?: string): Promise<boolean>;
  
  // Parse incoming webhook payload
  parseWebhook(body: any): IncomingMessage | null;
  
  // Get user info from platform
  getUserInfo(userId: string): Promise<{ name: string; phone?: string } | null>;
}

// Platform registry for multi-platform support
export class PlatformRegistry {
  private platforms: Map<PlatformType, MessagingPlatform> = new Map();

  register(platform: MessagingPlatform): void {
    this.platforms.set(platform.platform, platform);
  }

  get(type: PlatformType): MessagingPlatform | undefined {
    return this.platforms.get(type);
  }

  getAll(): MessagingPlatform[] {
    return Array.from(this.platforms.values());
  }
}

// Unified message sender that works across all platforms
export class UnifiedMessenger {
  constructor(private registry: PlatformRegistry) {}

  async send(
    platform: PlatformType,
    chatId: string,
    message: OutgoingMessage
  ): Promise<boolean> {
    const adapter = this.registry.get(platform);
    if (!adapter) {
      console.error(`Platform ${platform} not registered`);
      return false;
    }
    return adapter.sendMessage(chatId, message);
  }

  async sendWithButtons(
    platform: PlatformType,
    chatId: string,
    text: string,
    buttons: MessageButton[][]
  ): Promise<boolean> {
    const adapter = this.registry.get(platform);
    if (!adapter) {
      console.error(`Platform ${platform} not registered`);
      return false;
    }
    return adapter.sendWithButtons(chatId, text, buttons);
  }

  async sendToAll(
    chatIds: Array<{ platform: PlatformType; chatId: string }>,
    message: OutgoingMessage
  ): Promise<void> {
    await Promise.all(
      chatIds.map(({ platform, chatId }) => this.send(platform, chatId, message))
    );
  }
}

// User contact info with multi-platform support
export interface UserContact {
  userId: string;
  name: string;
  phone?: string;
  email?: string;
  platforms: Array<{
    platform: PlatformType;
    platformUserId: string;
    platformChatId: string;
    isPrimary: boolean;
    verifiedAt?: number;
  }>;
}
