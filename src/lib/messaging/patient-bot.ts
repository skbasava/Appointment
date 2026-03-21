import type { MessagingPlugin } from './plugin';
import type { D1Database } from '@cloudflare/workers-types';

interface PatientBotState {
  step: 'phone' | 'otp' | 'name' | 'booking' | 'done';
  phone?: string;
  name?: string;
  data: Record<string, unknown>;
}

export class PatientBot {
  private plugin: MessagingPlugin;
  private db: D1Database;
  private states = new Map<string, PatientBotState>();
  private env: Record<string, string>;

  constructor(plugin: MessagingPlugin, db: D1Database, env: Record<string, string>) {
    this.plugin = plugin;
    this.db = db;
    this.env = env;
  }

  async handleMessage(message: { chatId: string; text?: string; type: string }): Promise<void> {
    const { chatId, text } = message;
    const state = this.states.get(chatId);

    if (!state) {
      // Check if already a patient
      const existing = await this.db.prepare(
        'SELECT * FROM patient_auth WHERE telegram_id = ? OR phone = ?'
      ).bind(chatId, chatId).first();

      if (existing) {
        this.plugin.send(chatId, { text: `Welcome back${(existing as Record<string, unknown>).name ? ', ' + (existing as Record<string, unknown>).name : ''}! Use /book to schedule an appointment.` });
        return;
      }

      // Start onboarding
      this.states.set(chatId, { step: 'phone', data: {} });
      this.plugin.send(chatId, { text: 'Welcome! What\'s your phone number? (with country code, e.g., +91XXXXXXXXXX)' });
      return;
    }

    if (state.step === 'phone') {
      // Normalize and send OTP
      const phone = (await import('../../lib/phone/normalize')).normalizePhone(text || '', this.env.DEFAULT_COUNTRY_CODE);
      state.phone = phone;
      state.step = 'otp';

      // Generate and send OTP
      const { generateOTPSession } = await import('../../lib/auth/phone-otp');
      const otp = await generateOTPSession(this.db, phone, 'whatsapp');
      const { createProviderRegistry } = await import('../../lib/otp/providers/index');
      const registry = createProviderRegistry(this.env as any);
      await registry.sendOTPWithFallback(phone, otp);

      this.plugin.send(chatId, { text: 'Code sent! Enter the 6-digit code:' });
    } else if (state.step === 'otp') {
      // Verify OTP
      try {
        const { verifyOTP } = await import('../../lib/auth/phone-otp');
        await verifyOTP(this.db, state.phone!, text || '');
        state.step = 'name';
        this.plugin.send(chatId, { text: 'Verified! What\'s your name?' });
      } catch (err) {
        this.plugin.send(chatId, { text: String(err) });
      }
    } else if (state.step === 'name') {
      state.name = text;
      // Save patient
      const { createPatient } = await import('../../db/queries/patient-auth');
      await createPatient(this.db, {
        phone: state.phone,
        name: state.name,
        telegram_id: chatId,
      });
      state.step = 'done';
      this.plugin.send(chatId, { text: `All set, ${state.name}! Use /book to schedule an appointment.` });
    } else if (state.step === 'done') {
      this.plugin.send(chatId, { text: 'Use /book to schedule an appointment.' });
    }
  }
}
