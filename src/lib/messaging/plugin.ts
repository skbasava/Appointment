// Messaging Plugin Interface
// Supports: Telegram, WhatsApp, Snapchat, Arattai, SMS, etc.

export type PlatformType = 'telegram' | 'whatsapp' | 'snapchat' | 'arattai' | 'sms';

// Incoming message from any platform
export interface IncomingMessage {
  platform: PlatformType;
  userId: string;
  chatId: string;
  text?: string;
  callbackData?: string;
  firstName?: string;
  lastName?: string;
  username?: string;
  phoneNumber?: string;
  imageUrl?: string;
  documentUrl?: string;
}

// Outgoing message to any platform
export interface OutgoingMessage {
  text: string;
  parseMode?: 'HTML' | 'Markdown';
  imageUrl?: string;
  documentUrl?: string;
}

// Button for interactive messages
export interface MessageButton {
  text: string;
  callbackData: string;
}

// Plugin interface - all platforms must implement this
export interface MessagingPlugin {
  // Platform identifier
  readonly platform: PlatformType;

  // Send a text message
  send(chatId: string, message: OutgoingMessage): Promise<boolean>;

  // Send a message with buttons
  sendWithButtons(chatId: string, text: string, buttons: MessageButton[][]): Promise<boolean>;

  // Send an image
  sendImage(chatId: string, imageUrl: string, caption?: string): Promise<boolean>;

  // Parse incoming webhook
  parseWebhook(body: any): IncomingMessage | null;

  // Answer callback (button click)
  answerCallback?(callbackId: string, text?: string): Promise<boolean>;
}

// Plugin Manager - manages all messaging plugins
export class PluginManager {
  private plugins: Map<PlatformType, MessagingPlugin> = new Map();

  // Register a plugin
  register(plugin: MessagingPlugin): void {
    this.plugins.set(plugin.platform, plugin);
    console.log(`Plugin registered: ${plugin.platform}`);
  }

  // Get a plugin by platform
  get(platform: PlatformType): MessagingPlugin | undefined {
    return this.plugins.get(platform);
  }

  // Get all registered plugins
  getAll(): MessagingPlugin[] {
    return Array.from(this.plugins.values());
  }

  // Send message via specific platform
  async send(platform: PlatformType, chatId: string, message: OutgoingMessage): Promise<boolean> {
    const plugin = this.plugins.get(platform);
    if (!plugin) {
      console.error(`Platform not found: ${platform}`);
      return false;
    }
    return plugin.send(chatId, message);
  }

  // Send message with buttons via specific platform
  async sendWithButtons(
    platform: PlatformType,
    chatId: string,
    text: string,
    buttons: MessageButton[][]
  ): Promise<boolean> {
    const plugin = this.plugins.get(platform);
    if (!plugin) {
      console.error(`Platform not found: ${platform}`);
      return false;
    }
    return plugin.sendWithButtons(chatId, text, buttons);
  }

  // Broadcast to multiple platforms
  async broadcast(
    recipients: Array<{ platform: PlatformType; chatId: string }>,
    message: OutgoingMessage
  ): Promise<void> {
    await Promise.all(
      recipients.map(({ platform, chatId }) => this.send(platform, chatId, message))
    );
  }
}

// User contact with multi-platform support
export interface UserContact {
  id: string;
  name: string;
  phone?: string;
  email?: string;
  platforms: Array<{
    platform: PlatformType;
    platformUserId: string;
    platformChatId: string;
    isPrimary: boolean;
  }>;
}

// Session state for onboarding
export interface OnboardingState {
  step: string;
  role: 'doctor' | 'patient' | null;
  data: Record<string, any>;
  platform: PlatformType;
  platformUserId: string;
  platformChatId: string;
  startedAt: number;
}
