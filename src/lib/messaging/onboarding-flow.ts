// Comprehensive Onboarding Flow Handler
// Supports Doctor and Patient registration with full data collection

import { PluginManager, MessagingPlugin, IncomingMessage, MessageButton, PlatformType, OnboardingState } from './plugin';
import { generateOTPSession, verifyOTP } from '../../lib/auth/phone-otp';
import { normalizePhone } from '../../lib/phone/normalize';
import { createProviderRegistry } from '../../lib/otp/providers/index';

// Onboarding Steps
export const DOCTOR_STEPS = {
  ROLE_SELECT: 'role_select',
  NAME: 'doctor_name',
  LICENSE: 'doctor_license',
  PHONE: 'doctor_phone',
  PHONE_VERIFY: 'doctor_phone_verify',
  SPECIALTY: 'doctor_specialty',
  CLINIC_NAME: 'clinic_name',
  CLINIC_ADDRESS: 'clinic_address',
  CLINIC_PHONE: 'clinic_phone',
  MORE_CLINICS: 'more_clinics',
  CONFIRM: 'doctor_confirm',
  COMPLETE: 'doctor_complete',
};

export const PATIENT_STEPS = {
  ROLE_SELECT: 'role_select',
  NAME: 'patient_name',
  AGE: 'patient_age',
  SEX: 'patient_sex',
  ADDRESS: 'patient_address',
  PHONE: 'patient_phone',
  CONFIRM: 'patient_confirm',
  COMPLETE: 'patient_complete',
};

export class OnboardingFlowHandler {
  private sessions: Map<string, OnboardingState> = new Map();
  private _registry: ReturnType<typeof createProviderRegistry> | null = null;
  private baseUrl: string;

  constructor(
    private pluginManager: PluginManager,
    private db: any,
    private env?: Record<string, string>
  ) {
    this.baseUrl = env?.BASE_URL || 'https://appoint.satish-aradhya.workers.dev';
  }

  private get otpRegistry() {
    if (!this._registry && this.env) {
      this._registry = createProviderRegistry(this.env);
    }
    return this._registry;
  }

  // Get session key
  private getSessionKey(platform: PlatformType, userId: string): string {
    return `${platform}:${userId}`;
  }

  // Get or create session
  getSession(platform: PlatformType, userId: string, chatId: string): OnboardingState {
    const key = this.getSessionKey(platform, userId);
    if (!this.sessions.has(key)) {
      this.sessions.set(key, {
        step: 'start',
        role: null,
        data: {},
        platform,
        platformUserId: userId,
        platformChatId: chatId,
        startedAt: Date.now(),
      });
    }
    return this.sessions.get(key)!;
  }

  // Handle incoming message
  async handleMessage(message: IncomingMessage): Promise<void> {
    const plugin = this.pluginManager.get(message.platform);
    if (!plugin) return;

    const session = this.getSession(message.platform, message.userId, message.chatId);

    // Handle commands
    if (message.text?.startsWith('/')) {
      await this.handleCommand(message, session, plugin);
      return;
    }

    // Handle callback data
    if (message.callbackData) {
      await this.handleCallback(message, session, plugin);
      return;
    }

    // Handle text input
    if (message.text) {
      await this.handleTextInput(message, session, plugin);
    }
  }

  // Handle commands
  private async handleCommand(message: IncomingMessage, session: OnboardingState, plugin: MessagingPlugin): Promise<void> {
    const command = message.text?.split(' ')[0];

    switch (command) {
      case '/start':
        await this.showWelcome(message, session, plugin);
        break;
      case '/register_doctor':
        await this.startDoctorRegistration(message, session, plugin);
        break;
      case '/register_patient':
        await this.startPatientRegistration(message, session, plugin);
        break;
      case '/book':
        await this.showBooking(message, session, plugin);
        break;
      case '/appointments':
        await this.showAppointments(message, session, plugin);
        break;
      case '/help':
        await this.showHelp(message, plugin);
        break;
      default:
        await plugin.send(message.chatId, { text: 'Unknown command. Type /help for options.' });
    }
  }

  // Handle callback data
  private async handleCallback(message: IncomingMessage, session: OnboardingState, plugin: MessagingPlugin): Promise<void> {
    const data = message.callbackData!;

    if (data === 'role:doctor') {
      await this.startDoctorRegistration(message, session, plugin);
    } else if (data === 'role:patient') {
      await this.startPatientRegistration(message, session, plugin);
    } else if (data === 'sex:male' || data === 'sex:female' || data === 'sex:other') {
      session.data.sex = data.split(':')[1];
      session.step = PATIENT_STEPS.ADDRESS;
      await plugin.send(message.chatId, { text: '📍 Enter your address:' });
    } else if (data === 'confirm:doctor') {
      await this.saveDoctor(message, session, plugin);
    } else if (data === 'confirm:patient') {
      await this.savePatient(message, session, plugin);
    } else if (data === 'clinic:more') {
      session.step = DOCTOR_STEPS.CLINIC_NAME;
      await plugin.send(message.chatId, { text: '🏥 Enter clinic name:' });
    } else if (data === 'clinic:done') {
      await this.showDoctorConfirmation(message, session, plugin);
    }
  }

  // Handle text input
  private async handleTextInput(message: IncomingMessage, session: OnboardingState, plugin: MessagingPlugin): Promise<void> {
    const text = message.text!;

    switch (session.step) {
      // Doctor registration
      case DOCTOR_STEPS.NAME:
        session.data.name = text;
        session.step = DOCTOR_STEPS.LICENSE;
        await plugin.send(message.chatId, { text: '🆔 Enter your medical license number:' });
        break;

      case DOCTOR_STEPS.LICENSE:
        session.data.licenseNumber = text;
        session.step = DOCTOR_STEPS.PHONE;
        await plugin.send(message.chatId, { text: '📱 Enter your WhatsApp/Mobile number:' });
        break;

      case DOCTOR_STEPS.PHONE:
        try {
          session.data.phone = normalizePhone(text);
        } catch (e: any) {
          await plugin.send(message.chatId, { text: `❌ Invalid phone number. Please enter a valid number:` });
          return;
        }
        try {
          if (this.otpRegistry) {
            const otp = await generateOTPSession(this.db, session.data.phone, 'sms');
            await this.otpRegistry.sendOTPWithFallback(session.data.phone, otp);
          }
        } catch (e: any) {
          console.error('OTP send error:', e);
        }
        session.step = DOCTOR_STEPS.PHONE_VERIFY;
        await plugin.send(message.chatId, { text: '🔐 We sent a verification code to your phone. Enter the code:' });
        break;

      case DOCTOR_STEPS.PHONE_VERIFY:
        try {
          if (this.otpRegistry) {
            await verifyOTP(this.db, session.data.phone, text.trim());
          }
        } catch (e: any) {
          await plugin.send(message.chatId, { text: `❌ ${e.message} Try again:` });
          return;
        }
        session.data.phone_verified = 1;
        session.step = DOCTOR_STEPS.SPECIALTY;
        await plugin.sendWithButtons(message.chatId, '✅ Phone verified!\n\n🏥 Select your specialty:', [
          [{ text: 'General Physician', callbackData: 'specialty:general' }],
          [{ text: 'Cardiologist', callbackData: 'specialty:cardiology' }],
          [{ text: 'Dermatologist', callbackData: 'specialty:dermatology' }],
          [{ text: 'Pediatrician', callbackData: 'specialty:pediatrics' }],
          [{ text: 'Orthopedic', callbackData: 'specialty:orthopedic' }],
          [{ text: 'Other', callbackData: 'specialty:other' }],
        ]);
        break;

      case DOCTOR_STEPS.CLINIC_NAME:
        if (!session.data.clinics) session.data.clinics = [];
        session.data.currentClinic = { name: text };
        session.step = DOCTOR_STEPS.CLINIC_ADDRESS;
        await plugin.send(message.chatId, { text: '📍 Enter clinic address:' });
        break;

      case DOCTOR_STEPS.CLINIC_ADDRESS:
        session.data.currentClinic.address = text;
        session.step = DOCTOR_STEPS.CLINIC_PHONE;
        await plugin.send(message.chatId, { text: '📞 Enter clinic phone number:' });
        break;

      case DOCTOR_STEPS.CLINIC_PHONE:
        session.data.currentClinic.phone = text;
        session.data.clinics.push(session.data.currentClinic);
        session.step = DOCTOR_STEPS.MORE_CLINICS;
        await plugin.sendWithButtons(message.chatId,
          `✅ Clinic added: ${session.data.currentClinic.name}\n\nDo you work at more clinics?`,
          [
            [{ text: '➕ Add Another Clinic', callbackData: 'clinic:more' }],
            [{ text: '✅ Done', callbackData: 'clinic:done' }],
          ]
        );
        break;

      // Patient registration
      case PATIENT_STEPS.NAME:
        session.data.name = text;
        session.step = PATIENT_STEPS.AGE;
        await plugin.send(message.chatId, { text: '🎂 Enter your age:' });
        break;

      case PATIENT_STEPS.AGE:
        const age = parseInt(text);
        if (isNaN(age) || age < 1 || age > 150) {
          await plugin.send(message.chatId, { text: '❌ Invalid age. Please enter a valid number:' });
          return;
        }
        session.data.age = age;
        session.step = PATIENT_STEPS.SEX;
        await plugin.sendWithButtons(message.chatId, '👤 Select your sex:', [
          [{ text: '👨 Male', callbackData: 'sex:male' }],
          [{ text: '👩 Female', callbackData: 'sex:female' }],
          [{ text: '⚧ Other', callbackData: 'sex:other' }],
        ]);
        break;

      case PATIENT_STEPS.ADDRESS:
        session.data.address = text;
        session.step = PATIENT_STEPS.PHONE;
        await plugin.send(message.chatId, { text: '📱 Enter your phone number (or /skip):' });
        break;

      case PATIENT_STEPS.PHONE:
        if (text !== '/skip') {
          try {
            session.data.phone = normalizePhone(text);
          } catch (e: any) {
            await plugin.send(message.chatId, { text: `❌ Invalid phone number. Please enter a valid number (or /skip):` });
            return;
          }
        } else {
          session.data.phone = null;
        }
        await this.showPatientConfirmation(message, session, plugin);
        break;

      default:
        await plugin.send(message.chatId, { text: 'Type /help for available commands.' });
    }
  }

  // Show welcome message
  private async showWelcome(message: IncomingMessage, session: OnboardingState, plugin: MessagingPlugin): Promise<void> {
    session.step = 'role_select';
    await plugin.sendWithButtons(message.chatId,
      `👋 Welcome to Appoint!\n\n` +
      `Book appointments with healthcare providers easily.\n\n` +
      `Are you a doctor or a patient?`,
      [
        [{ text: '👨‍⚕️ I\'m a Doctor', callbackData: 'role:doctor' }],
        [{ text: '👤 I\'m a Patient', callbackData: 'role:patient' }],
      ]
    );
  }

  // Start doctor registration
  private async startDoctorRegistration(message: IncomingMessage, session: OnboardingState, plugin: MessagingPlugin): Promise<void> {
    session.role = 'doctor';
    session.step = DOCTOR_STEPS.NAME;
    session.data = {};
    await plugin.send(message.chatId, {
      text: `👨‍⚕️ <b>Doctor Registration</b>\n\nLet's set up your profile.\n\nEnter your full name (e.g., Dr. John Smith):`,
    });
  }

  // Start patient registration
  private async startPatientRegistration(message: IncomingMessage, session: OnboardingState, plugin: MessagingPlugin): Promise<void> {
    session.role = 'patient';
    session.step = PATIENT_STEPS.NAME;
    session.data = {};
    await plugin.send(message.chatId, {
      text: `👤 <b>Patient Registration</b>\n\nLet's set up your profile.\n\nEnter your full name:`,
    });
  }

  // Show doctor confirmation
  private async showDoctorConfirmation(message: IncomingMessage, session: OnboardingState, plugin: MessagingPlugin): Promise<void> {
    const { name, licenseNumber, phone, clinics } = session.data;
    
    let clinicsText = '';
    if (clinics && clinics.length > 0) {
      clinicsText = '\n\n🏥 <b>Clinics:</b>\n';
      clinics.forEach((c: any, i: number) => {
        clinicsText += `  ${i + 1}. ${c.name}\n     📍 ${c.address}\n     📞 ${c.phone}\n`;
      });
    }

    await plugin.sendWithButtons(message.chatId,
      `📋 <b>Confirm Doctor Details</b>\n\n` +
      `👨‍⚕️ Name: ${name}\n` +
      `🆔 License: ${licenseNumber}\n` +
      `📱 Phone: ${phone}\n` +
      `💬 Platform: ${session.platform}` +
      clinicsText,
      [
        [{ text: '✅ Confirm & Register', callbackData: 'confirm:doctor' }],
        [{ text: '❌ Cancel', callbackData: 'confirm:cancel' }],
      ]
    );
  }

  // Show patient confirmation
  private async showPatientConfirmation(message: IncomingMessage, session: OnboardingState, plugin: MessagingPlugin): Promise<void> {
    const { name, age, sex, address, phone } = session.data;

    await plugin.sendWithButtons(message.chatId,
      `📋 <b>Confirm Patient Details</b>\n\n` +
      `👤 Name: ${name}\n` +
      `🎂 Age: ${age}\n` +
      `⚧ Sex: ${sex}\n` +
      `📍 Address: ${address}\n` +
      `📱 Phone: ${phone || 'Not provided'}\n` +
      `💬 Platform: ${session.platform}`,
      [
        [{ text: '✅ Confirm & Register', callbackData: 'confirm:patient' }],
        [{ text: '❌ Cancel', callbackData: 'confirm:cancel' }],
      ]
    );
  }

  // Save doctor to database
  private async saveDoctor(message: IncomingMessage, session: OnboardingState, plugin: MessagingPlugin): Promise<void> {
    try {
      const doctorId = crypto.randomUUID();
      const { name, licenseNumber, phone, clinics } = session.data;

      // Insert doctor
      await this.db.prepare(
        `INSERT INTO providers (id, type, name, license_number, mobile_number, telegram_id, whatsapp_id, timezone, status, created_at, updated_at)
         VALUES (?, 'doctor', ?, ?, ?, ?, ?, 'UTC', 'active', ?, ?)`
      ).bind(
        doctorId, name, licenseNumber, phone,
        session.platform === 'telegram' ? session.platformUserId : null,
        session.platform === 'whatsapp' ? session.platformUserId : null,
        Math.floor(Date.now() / 1000), Math.floor(Date.now() / 1000)
      ).run();

      // Insert clinics
      if (clinics) {
        for (const clinic of clinics) {
          const clinicId = crypto.randomUUID();
          await this.db.prepare(
            'INSERT INTO clinics (id, name, address, phone, created_at) VALUES (?, ?, ?, ?, ?)'
          ).bind(clinicId, clinic.name, clinic.address, clinic.phone, Math.floor(Date.now() / 1000)).run();

          await this.db.prepare(
            'INSERT INTO doctor_clinics (id, doctor_id, clinic_id, is_primary) VALUES (?, ?, ?, ?)'
          ).bind(crypto.randomUUID(), doctorId, clinicId, clinics.indexOf(clinic) === 0 ? 1 : 0).run();
        }
      }

      // Create default service
      await this.db.prepare(
        'INSERT INTO services (id, provider_id, name, duration_minutes, is_active, created_at) VALUES (?, ?, ?, 30, 1, ?)'
      ).bind(crypto.randomUUID(), doctorId, 'General Consultation', Math.floor(Date.now() / 1000)).run();

      // Create default availability (Mon-Fri 9-17)
      for (let day = 1; day <= 5; day++) {
        await this.db.prepare(
          'INSERT INTO availability_windows (id, provider_id, day_of_week, start_time, end_time, is_active) VALUES (?, ?, ?, ?, ?, 1)'
        ).bind(crypto.randomUUID(), doctorId, day, '09:00', '17:00').run();
      }

      session.step = DOCTOR_STEPS.COMPLETE;
      const calendarUrl = `${this.baseUrl}/api/providers/${doctorId}/calendar/oauth-url`;
      await plugin.send(message.chatId, {
        text: `✅ <b>Doctor Registration Complete!</b>\n\n` +
              `Welcome Dr. ${name}!\n\n` +
              `Your profile is set up. Patients can now book with you.\n\n` +
              `Default: Mon-Fri 9AM-5PM, 30min consultations\n\n` +
              `Connect Google Calendar: ${calendarUrl}\n\n` +
              `Commands:\n` +
              `/appointments - View bookings\n` +
              `/availability - Update schedule`,
      });
    } catch (error) {
      console.error('Save doctor error:', error);
      await plugin.send(message.chatId, { text: '❌ Registration failed. Please try again.' });
    }
  }

  // Save patient to database
  private async savePatient(message: IncomingMessage, session: OnboardingState, plugin: MessagingPlugin): Promise<void> {
    try {
      const patientId = crypto.randomUUID();
      const { name, age, sex, address, phone } = session.data;

      await this.db.prepare(
        `INSERT INTO users (id, name, age, sex, address, phone, telegram_id, whatsapp_id, platform, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(
        patientId, name, age, sex, address, phone,
        session.platform === 'telegram' ? session.platformUserId : null,
        session.platform === 'whatsapp' ? session.platformUserId : null,
        session.platform, Math.floor(Date.now() / 1000)
      ).run();

      session.step = PATIENT_STEPS.COMPLETE;
      await plugin.send(message.chatId, {
        text: `✅ <b>Registration Complete!</b>\n\n` +
              `Welcome ${name}!\n\n` +
              `You can now book appointments:\n` +
              `/book - Book appointment\n` +
              `/appointments - View your appointments\n` +
              `/help - See all commands`,
      });
    } catch (error) {
      console.error('Save patient error:', error);
      await plugin.send(message.chatId, { text: '❌ Registration failed. Please try again.' });
    }
  }

  // Show booking
  private async showBooking(message: IncomingMessage, session: OnboardingState, plugin: MessagingPlugin): Promise<void> {
    await plugin.send(message.chatId, {
      text: '📅 Booking\n\nTo book an appointment, please visit:\nhttps://appoint.satish-aradhya.workers.dev/booking',
    });
  }

  // Show appointments
  private async showAppointments(message: IncomingMessage, session: OnboardingState, plugin: MessagingPlugin): Promise<void> {
    await plugin.send(message.chatId, {
      text: '📋 Appointments\n\nView your appointments at:\nhttps://appoint.satish-aradhya.workers.dev/appointments',
    });
  }

  // Show help
  private async showHelp(message: IncomingMessage, plugin: MessagingPlugin): Promise<void> {
    await plugin.send(message.chatId, {
      text: `📋 <b>Available Commands</b>\n\n` +
            `/start - Start or restart\n` +
            `/register_doctor - Register as doctor\n` +
            `/register_patient - Register as patient\n` +
            `/book - Book appointment\n` +
            `/appointments - View appointments\n` +
            `/help - Show this help`,
    });
  }
}
