// Onboarding flow for doctors and patients
// Supports multi-platform messaging

import { MessagingPlatform, IncomingMessage, OutgoingMessage, MessageButton, PlatformType, UserContact } from './platform';

// User session state
export interface OnboardingSession {
  step: string;
  role: 'doctor' | 'patient' | null;
  data: Record<string, any>;
  platform: PlatformType;
  platformUserId: string;
  platformChatId: string;
}

// Onboarding steps
export const ONBOARDING_STEPS = {
  // Doctor onboarding
  DOCTOR_WELCOME: 'doctor_welcome',
  DOCTOR_NAME: 'doctor_name',
  DOCTOR_EMAIL: 'doctor_email',
  DOCTOR_PHONE: 'doctor_phone',
  DOCTOR_SPECIALTY: 'doctor_specialty',
  DOCTOR_TIMEZONE: 'doctor_timezone',
  DOCTOR_GOOGLE_CALENDAR: 'doctor_google_calendar',
  DOCTOR_CONFIRM: 'doctor_confirm',
  DOCTOR_COMPLETE: 'doctor_complete',

  // Patient onboarding
  PATIENT_WELCOME: 'patient_welcome',
  PATIENT_NAME: 'patient_name',
  PATIENT_PHONE: 'patient_phone',
  PATIENT_EMAIL: 'patient_email',
  PATIENT_CONFIRM: 'patient_confirm',
  PATIENT_COMPLETE: 'patient_complete',
};

// Onboarding handler
export class OnboardingHandler {
  private sessions: Map<string, OnboardingSession> = new Map();

  constructor(
    private platform: MessagingPlatform,
    private db: any // D1Database
  ) {}

  // Get or create session
  getSession(userId: string, chatId: string): OnboardingSession {
    const key = `${this.platform.platform}:${userId}`;
    if (!this.sessions.has(key)) {
      this.sessions.set(key, {
        step: 'start',
        role: null,
        data: {},
        platform: this.platform.platform,
        platformUserId: userId,
        platformChatId: chatId,
      });
    }
    return this.sessions.get(key)!;
  }

  // Handle incoming message
  async handleMessage(message: IncomingMessage): Promise<void> {
    const session = this.getSession(message.userId, message.chatId);

    // Handle commands
    if (message.text?.startsWith('/')) {
      await this.handleCommand(message, session);
      return;
    }

    // Handle callback data (button clicks)
    if (message.callbackData) {
      await this.handleCallback(message, session);
      return;
    }

    // Handle text input based on session step
    if (message.text) {
      await this.handleTextInput(message, session);
    }
  }

  // Handle commands
  private async handleCommand(message: IncomingMessage, session: OnboardingSession): Promise<void> {
    const command = message.text?.split(' ')[0];

    switch (command) {
      case '/start':
        await this.sendWelcome(message, session);
        break;
      case '/register_doctor':
        await this.startDoctorOnboarding(message, session);
        break;
      case '/register_patient':
        await this.startPatientOnboarding(message, session);
        break;
      case '/status':
        await this.sendStatus(message, session);
        break;
      case '/help':
        await this.sendHelp(message);
        break;
      default:
        await this.send(message.chatId, { text: 'Unknown command. Type /help for options.' });
    }
  }

  // Handle callback data
  private async handleCallback(message: IncomingMessage, session: OnboardingSession): Promise<void> {
    const data = message.callbackData!;

    if (data === 'role:doctor') {
      await this.startDoctorOnboarding(message, session);
    } else if (data === 'role:patient') {
      await this.startPatientOnboarding(message, session);
    } else if (data.startsWith('confirm:')) {
      await this.handleConfirmation(message, session, data);
    } else if (data.startsWith('timezone:')) {
      session.data.timezone = data.split(':')[1];
      session.step = ONBOARDING_STEPS.DOCTOR_GOOGLE_CALENDAR;
      await this.send(message.chatId, {
        text: '📅 Connect your Google Calendar for automatic scheduling.\n\nClick the link below to authorize:',
      });
      // Send calendar link
    }
  }

  // Handle text input
  private async handleTextInput(message: IncomingMessage, session: OnboardingSession): Promise<void> {
    switch (session.step) {
      case ONBOARDING_STEPS.DOCTOR_NAME:
        session.data.name = message.text;
        session.step = ONBOARDING_STEPS.DOCTOR_EMAIL;
        await this.send(message.chatId, { text: '📧 Enter your email address:' });
        break;

      case ONBOARDING_STEPS.DOCTOR_EMAIL:
        if (!this.isValidEmail(message.text!)) {
          await this.send(message.chatId, { text: '❌ Invalid email. Please enter a valid email:' });
          return;
        }
        session.data.email = message.text;
        session.step = ONBOARDING_STEPS.DOCTOR_PHONE;
        await this.send(message.chatId, { text: '📱 Enter your phone number:' });
        break;

      case ONBOARDING_STEPS.DOCTOR_PHONE:
        session.data.phone = message.text;
        session.step = ONBOARDING_STEPS.DOCTOR_SPECIALTY;
        await this.sendWithButtons(message.chatId, 
          '🏥 Select your specialty:',
          [
            [{ text: 'General Physician', callback_data: 'specialty:general' }],
            [{ text: 'Cardiologist', callback_data: 'specialty:cardiology' }],
            [{ text: 'Dermatologist', callback_data: 'specialty:dermatology' }],
            [{ text: 'Pediatrician', callback_data: 'specialty:pediatrics' }],
            [{ text: 'Other', callback_data: 'specialty:other' }],
          ]
        );
        break;

      case ONBOARDING_STEPS.PATIENT_NAME:
        session.data.name = message.text;
        session.step = ONBOARDING_STEPS.PATIENT_PHONE;
        await this.send(message.chatId, { text: '📱 Enter your phone number (optional, press skip):' });
        break;

      case ONBOARDING_STEPS.PATIENT_PHONE:
        session.data.phone = message.text !== '/skip' ? message.text : null;
        session.step = ONBOARDING_STEPS.PATIENT_EMAIL;
        await this.send(message.chatId, { text: '📧 Enter your email (optional, press skip):' });
        break;

      case ONBOARDING_STEPS.PATIENT_EMAIL:
        session.data.email = message.text !== '/skip' ? message.text : null;
        await this.showPatientConfirmation(message, session);
        break;

      default:
        await this.send(message.chatId, { text: 'I didn\'t understand. Type /help for options.' });
    }
  }

  // Send welcome message with role selection
  private async sendWelcome(message: IncomingMessage, session: OnboardingSession): Promise<void> {
    session.step = 'role_selection';
    
    await this.sendWithButtons(message.chatId,
      `👋 Welcome to Appoint!\n\n` +
      `I can help you book appointments with healthcare providers.\n\n` +
      `Are you a doctor or a patient?`,
      [
        [{ text: '👨‍⚕️ I\'m a Doctor', callback_data: 'role:doctor' }],
        [{ text: '👤 I\'m a Patient', callback_data: 'role:patient' }],
      ]
    );
  }

  // Start doctor onboarding
  private async startDoctorOnboarding(message: IncomingMessage, session: OnboardingSession): Promise<void> {
    session.role = 'doctor';
    session.step = ONBOARDING_STEPS.DOCTOR_NAME;
    session.data = {};

    await this.send(message.chatId, {
      text: `👨‍⚕️ <b>Doctor Registration</b>\n\nLet's set up your profile.\n\nEnter your full name:`,
    });
  }

  // Start patient onboarding
  private async startPatientOnboarding(message: IncomingMessage, session: OnboardingSession): Promise<void> {
    session.role = 'patient';
    session.step = ONBOARDING_STEPS.PATIENT_NAME;
    session.data = {};

    await this.send(message.chatId, {
      text: `👤 <b>Patient Registration</b>\n\nLet's set up your profile.\n\nEnter your full name:`,
    });
  }

  // Show patient confirmation
  private async showPatientConfirmation(message: IncomingMessage, session: OnboardingSession): Promise<void> {
    session.step = ONBOARDING_STEPS.PATIENT_CONFIRM;
    
    const { name, phone, email } = session.data;
    
    await this.sendWithButtons(message.chatId,
      `📋 <b>Confirm Your Details</b>\n\n` +
      `👤 Name: ${name}\n` +
      `📱 Phone: ${phone || 'Not provided'}\n` +
      `📧 Email: ${email || 'Not provided'}\n` +
      `💬 Platform: ${session.platform}`,
      [
        [{ text: '✅ Confirm', callback_data: 'confirm:patient' }],
        [{ text: '❌ Start Over', callback_data: 'confirm:restart' }],
      ]
    );
  }

  // Handle confirmation
  private async handleConfirmation(
    message: IncomingMessage,
    session: OnboardingSession,
    data: string
  ): Promise<void> {
    const action = data.split(':')[1];

    if (action === 'restart') {
      session.step = 'start';
      session.role = null;
      session.data = {};
      await this.sendWelcome(message, session);
      return;
    }

    if (action === 'patient') {
      // Save patient to database
      await this.savePatient(message, session);
    } else if (action === 'doctor') {
      // Save doctor to database
      await this.saveDoctor(message, session);
    }
  }

  // Save patient to database
  private async savePatient(message: IncomingMessage, session: OnboardingSession): Promise<void> {
    try {
      // Create patient record
      const patientId = crypto.randomUUID();
      
      // In production, use actual D1 queries
      console.log('Saving patient:', {
        id: patientId,
        name: session.data.name,
        phone: session.data.phone,
        email: session.data.email,
        platform: session.platform,
        platform_user_id: session.platformUserId,
        platform_chat_id: session.platformChatId,
      });

      session.step = ONBOARDING_STEPS.PATIENT_COMPLETE;
      
      await this.send(message.chatId, {
        text: `✅ <b>Registration Complete!</b>\n\n` +
              `Welcome ${session.data.name}!\n\n` +
              `You can now book appointments using:\n` +
              `/book - Book an appointment\n` +
              `/appointments - View your appointments\n` +
              `/help - See all commands`,
      });
    } catch (error) {
      console.error('Failed to save patient:', error);
      await this.send(message.chatId, { text: '❌ Registration failed. Please try again.' });
    }
  }

  // Save doctor to database
  private async saveDoctor(message: IncomingMessage, session: OnboardingSession): Promise<void> {
    try {
      const doctorId = crypto.randomUUID();
      
      console.log('Saving doctor:', {
        id: doctorId,
        name: session.data.name,
        email: session.data.email,
        phone: session.data.phone,
        specialty: session.data.specialty,
        timezone: session.data.timezone || 'UTC',
        platform: session.platform,
        platform_user_id: session.platformUserId,
        platform_chat_id: session.platformChatId,
      });

      session.step = ONBOARDING_STEPS.DOCTOR_COMPLETE;
      
      await this.send(message.chatId, {
        text: `✅ <b>Doctor Registration Complete!</b>\n\n` +
              `Welcome Dr. ${session.data.name}!\n\n` +
              `Your profile is set up. Patients can now book appointments with you.\n\n` +
              `Next steps:\n` +
              `- Set your availability: /availability\n` +
              `- Connect Google Calendar: /calendar\n` +
              `- View appointments: /appointments`,
      });
    } catch (error) {
      console.error('Failed to save doctor:', error);
      await this.send(message.chatId, { text: '❌ Registration failed. Please try again.' });
    }
  }

  // Send status
  private async sendStatus(message: IncomingMessage, session: OnboardingSession): Promise<void> {
    await this.send(message.chatId, {
      text: `📊 <b>Your Status</b>\n\n` +
            `Role: ${session.role || 'Not set'}\n` +
            `Step: ${session.step}\n` +
            `Platform: ${session.platform}\n` +
            `User ID: ${session.platformUserId}`,
    });
  }

  // Send help
  private async sendHelp(message: IncomingMessage): Promise<void> {
    await this.send(message.chatId, {
      text: `📋 <b>Available Commands</b>\n\n` +
            `/start - Start or restart\n` +
            `/register_doctor - Register as a doctor\n` +
            `/register_patient - Register as a patient\n` +
            `/book - Book an appointment\n` +
            `/appointments - View appointments\n` +
            `/status - Check your status\n` +
            `/help - Show this help`,
    });
  }

  // Helper methods
  private async send(chatId: string, message: OutgoingMessage): Promise<void> {
    await this.platform.sendMessage(chatId, message);
  }

  private async sendWithButtons(
    chatId: string,
    text: string,
    buttons: MessageButton[][]
  ): Promise<void> {
    await this.platform.sendWithButtons(chatId, text, buttons);
  }

  private isValidEmail(email: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }
}
