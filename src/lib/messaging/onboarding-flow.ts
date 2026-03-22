// Comprehensive Onboarding Flow Handler
// Supports Doctor and Patient registration with full data collection

import { PluginManager, MessagingPlugin, IncomingMessage, MessageButton, PlatformType, OnboardingState } from './plugin';
import { generateOTPSession, verifyOTP } from '../../lib/auth/phone-otp';
import { generateTOTPSecret, verifyTOTP } from '../../lib/auth/totp';
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
  PHONE_VERIFY: 'patient_phone_verify',
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
    } else if (data.startsWith('specialty:')) {
      session.data.specialty = data.split(':')[1];
      session.step = DOCTOR_STEPS.CLINIC_NAME;
      await plugin.send(message.chatId, { text: '🏥 Enter your clinic name:' });
    } else if (data.startsWith('apt:approve:')) {
      const aptId = data.split(':')[2];
      await this.handleAppointmentAction(message, session, plugin, aptId, 'confirmed');
    } else if (data.startsWith('apt:reject:')) {
      const aptId = data.split(':')[2];
      await this.handleAppointmentAction(message, session, plugin, aptId, 'cancelled');
    } else if (data.startsWith('apt:reschedule:')) {
      const aptId = data.split(':')[2];
      await this.showRescheduleOptions(message, session, plugin, aptId);
    } else if (data.startsWith('book:doctor:')) {
      const doctorId = data.split(':')[2];
      await this.showDoctorServices(message, session, plugin, doctorId);
    } else if (data.startsWith('book:service:')) {
      const serviceId = data.split(':')[2];
      await this.showAvailableDates(message, session, plugin, serviceId);
    } else if (data.startsWith('book:slot:')) {
      const [, , serviceId, epoch] = data.split(':');
      await this.createBooking(message, session, plugin, serviceId, parseInt(epoch));
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
        // Generate TOTP secret for doctor
        const totpSecret = generateTOTPSecret();
        session.data.totpSecret = totpSecret;
        session.step = DOCTOR_STEPS.PHONE_VERIFY;
        await plugin.send(message.chatId, {
          text: `🔐 <b>Set up your Authenticator app</b>\n\n` +
                `Secret key: <code>${totpSecret}</code>\n\n` +
                `Steps:\n` +
                `1. Open Google/Microsoft Authenticator\n` +
                `2. Tap '+' → 'Enter a setup key'\n` +
                `3. Account: Appoint-Dr.${session.data.name || 'Doctor'}\n` +
                `4. Key: <code>${totpSecret}</code>\n` +
                `5. Tap 'Add'\n\n` +
                `Then enter the 6-digit code from your authenticator:`,
        });
        break;

      case DOCTOR_STEPS.PHONE_VERIFY:
        const doctorTotpSecret = session.data.totpSecret;
        if (!doctorTotpSecret) {
          await plugin.send(message.chatId, { text: '❌ Session error. Please start over with /register_doctor' });
          return;
        }
        try {
          const valid = await verifyTOTP(doctorTotpSecret, text.trim());
          if (!valid) {
            await plugin.send(message.chatId, { text: '❌ Incorrect code. Try again:' });
            return;
          }
        } catch (e: any) {
          await plugin.send(message.chatId, { text: `❌ Verification error. Try again:` });
          return;
        }
        session.data.phone_verified = 1;
        session.data.totp_enabled = 1;
        session.step = DOCTOR_STEPS.SPECIALTY;
        await plugin.sendWithButtons(message.chatId, '✅ Authenticator verified!\n\n🏥 Select your specialty:', [
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
        session.step = PATIENT_STEPS.PHONE_VERIFY;
        await plugin.send(message.chatId, { text: '🔐 We sent a verification code to your phone. Enter the code:' });
        break;

      case PATIENT_STEPS.PHONE_VERIFY:
        try {
          if (this.otpRegistry) {
            await verifyOTP(this.db, session.data.phone, text.trim());
          }
        } catch (e: any) {
          await plugin.send(message.chatId, { text: `❌ ${e.message} Try again:` });
          return;
        }
        session.data.phone_verified = 1;
        session.step = PATIENT_STEPS.CONFIRM;
        await plugin.send(message.chatId, { text: '✅ Phone verified!' });
        await this.showPatientConfirmation(message, session, plugin);
        break;

      default:
        await plugin.send(message.chatId, { text: 'Type /help for available commands.' });
    }
  }

  // Show welcome message
  private async showWelcome(message: IncomingMessage, session: OnboardingState, plugin: MessagingPlugin): Promise<void> {
    session.step = 'role_select';
    console.log('showWelcome: sending buttons to', message.chatId);
    const result = await plugin.sendWithButtons(message.chatId,
      `Welcome to Appoint!\n\n` +
      `Book appointments with healthcare providers easily.\n\n` +
      `Are you a doctor or a patient?`,
      [
        [{ text: 'I\'m a Doctor', callbackData: 'role:doctor' }],
        [{ text: 'I\'m a Patient', callbackData: 'role:patient' }],
      ]
    );
    console.log('showWelcome: sendWithButtons result:', result);
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
        `INSERT INTO providers (id, type, name, email, phone, totp_secret, totp_enabled, platform, platform_user_id, timezone, status, created_at, updated_at)
         VALUES (?, 'doctor', ?, ?, ?, ?, ?, ?, ?, 'UTC', 'active', ?, ?)`
      ).bind(
        doctorId, name, session.data.email || null, phone,
        session.data.totpSecret || null, session.data.totp_enabled || 0,
        session.platform || null, session.platformUserId || null,
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

      await this.db.prepare(
        `INSERT OR REPLACE INTO patient_auth (id, name, phone, phone_verified, firebase_uid, telegram_id, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      ).bind(
        patientId, name, phone,
        session.data.phone_verified || 0,
        session.data.firebase_uid || null,
        session.platform === 'telegram' ? session.platformUserId : null,
        Math.floor(Date.now() / 1000)
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
    const doctors = await this.db.prepare(
      'SELECT id, name, phone FROM providers WHERE type = ? AND status = ? ORDER BY name ASC LIMIT 10'
    ).bind('doctor', 'active').all();

    if (!doctors.results || doctors.results.length === 0) {
      await plugin.send(message.chatId, { text: '📅 No doctors available right now.' });
      return;
    }

    const buttons = (doctors.results as any[]).map(doc => [
      { text: `👨‍⚕️ ${doc.name}`, callbackData: `book:doctor:${doc.id}` },
    ]);
    await plugin.sendWithButtons(message.chatId, '📅 <b>Select a doctor:</b>', buttons);
  }

  private async showDoctorServices(
    message: IncomingMessage, session: OnboardingState, plugin: MessagingPlugin, doctorId: string
  ): Promise<void> {
    const doctor = await this.db.prepare('SELECT name FROM providers WHERE id = ?').bind(doctorId).first() as any;
    if (!doctor) { await plugin.send(message.chatId, { text: '❌ Doctor not found.' }); return; }

    const services = await this.db.prepare(
      'SELECT id, name, duration_minutes FROM services WHERE provider_id = ? AND is_active = 1'
    ).bind(doctorId).all();

    if (!services.results || services.results.length === 0) {
      await plugin.send(message.chatId, { text: `📅 ${doctor.name} has no services.` }); return;
    }

    session.data.bookDoctorId = doctorId;
    const buttons = (services.results as any[]).map(svc => [
      { text: `${svc.name} (${svc.duration_minutes}min)`, callbackData: `book:service:${svc.id}` },
    ]);
    await plugin.sendWithButtons(message.chatId, `📅 <b>${doctor.name}</b>\nSelect a service:`, buttons);
  }

  private async showAvailableDates(
    message: IncomingMessage, session: OnboardingState, plugin: MessagingPlugin, serviceId: string
  ): Promise<void> {
    const doctorId = session.data.bookDoctorId;
    const windows = await this.db.prepare(
      'SELECT day_of_week, start_time, end_time FROM availability_windows WHERE provider_id = ? AND is_active = 1'
    ).bind(doctorId).all();

    if (!windows.results || windows.results.length === 0) {
      await plugin.send(message.chatId, { text: '📅 No availability set.' }); return;
    }

    const buttons: MessageButton[][] = [];
    const now = new Date();
    for (let d = 0; d < 7; d++) {
      const date = new Date(now);
      date.setDate(date.getDate() + d);
      const dayOfWeek = date.getDay();
      const matchingWindows = (windows.results as any[]).filter(w => w.day_of_week === dayOfWeek);
      if (matchingWindows.length === 0) continue;

      for (const w of matchingWindows) {
        const [startH, startM] = w.start_time.split(':').map(Number);
        const [endH, endM] = w.end_time.split(':').map(Number);
        for (let h = startH; h < endH; h++) {
          for (let m = 0; m < 60; m += 30) {
            if (h === startH && m < startM) continue;
            if (h === endH && m >= endM) continue;
            const dateStr = date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
            const timeStr = `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`;
            const epoch = Math.floor(new Date(date.getFullYear(), date.getMonth(), date.getDate(), h, m).getTime() / 1000);
            buttons.push([{ text: `${dateStr} ${timeStr}`, callbackData: `book:slot:${serviceId}:${epoch}` }]);
          }
        }
      }
    }

    if (buttons.length === 0) {
      await plugin.send(message.chatId, { text: '📅 No slots available in the next 7 days.' }); return;
    }

    session.data.bookServiceId = serviceId;
    await plugin.sendWithButtons(message.chatId, '📅 <b>Pick a time slot:</b>', buttons.slice(0, 20));
  }

  private async createBooking(
    message: IncomingMessage, session: OnboardingState, plugin: MessagingPlugin,
    serviceId: string, startTime: number
  ): Promise<void> {
    const doctorId = session.data.bookDoctorId;
    const customerName = session.data.name || 'Patient';

    const service = await this.db.prepare(
      'SELECT name, duration_minutes FROM services WHERE id = ?'
    ).bind(serviceId).first() as any;

    if (!service) { await plugin.send(message.chatId, { text: '❌ Service not found.' }); return; }

    const endTime = startTime + service.duration_minutes * 60;

    const conflicts = await this.db.prepare(
      'SELECT id FROM appointments WHERE provider_id = ? AND status != ? AND start_time < ? AND end_time > ?'
    ).bind(doctorId, 'cancelled', endTime, startTime).all();

    if (conflicts.results && conflicts.results.length > 0) {
      await plugin.send(message.chatId, { text: '❌ That slot is no longer available. Please pick another.' }); return;
    }

    const dateStr = new Date(startTime * 1000).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
    const timeStr = new Date(startTime * 1000).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });

    // Handle reschedule
    if (session.data.rescheduleAptId) {
      const rescheduleAptId = session.data.rescheduleAptId;

      const oldApt = await this.db.prepare(
        'SELECT customer_telegram_id, customer_name FROM appointments WHERE id = ?'
      ).bind(rescheduleAptId).first() as any;

      await this.db.prepare(
        'UPDATE appointments SET start_time = ?, end_time = ?, status = ?, updated_at = ? WHERE id = ?'
      ).bind(startTime, endTime, 'confirmed', Math.floor(Date.now() / 1000), rescheduleAptId).run();

      await plugin.send(message.chatId, {
        text: `✅ Appointment rescheduled!\n\n📅 ${dateStr} ${timeStr}\n👤 ${oldApt?.customer_name || customerName}`,
      });

      // Notify patient of reschedule
      if (oldApt?.customer_telegram_id) {
        const patientMsg = `🔄 Your appointment has been rescheduled!\n📅 New time: ${dateStr} ${timeStr}`;
        await plugin.send(String(oldApt.customer_telegram_id), { text: patientMsg });
      }

      delete session.data.rescheduleAptId;
      return;
    }

    // Normal booking flow
    const aptId = crypto.randomUUID();
    await this.db.prepare(
      `INSERT INTO appointments (id, provider_id, service_id, customer_name, customer_telegram_id, start_time, end_time, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)`
    ).bind(aptId, doctorId, serviceId, customerName, session.platformUserId, startTime, endTime,
      Math.floor(Date.now() / 1000), Math.floor(Date.now() / 1000)).run();

    await plugin.send(message.chatId, {
      text: `✅ Booking requested!\n\n📅 ${dateStr} ${timeStr}\n👨‍⚕️ ${service.name}\n\nWaiting for doctor confirmation...`,
    });

    const doctor = await this.db.prepare(
      'SELECT platform, platform_user_id FROM providers WHERE id = ?'
    ).bind(doctorId).first() as any;

    if (doctor?.platform && doctor?.platform_user_id) {
      const doctorPlugin = this.pluginManager.get(doctor.platform as PlatformType);
      if (doctorPlugin) {
        await doctorPlugin.sendWithButtons(doctor.platform_user_id,
          `📋 <b>New Booking Request</b>\n\n👤 ${customerName}\n🏥 ${service.name}\n📅 ${dateStr} ${timeStr}`,
          [
            [{ text: '✅ Approve', callbackData: `apt:approve:${aptId}` }],
            [{ text: '❌ Reject', callbackData: `apt:reject:${aptId}` }],
            [{ text: '🔄 Reschedule', callbackData: `apt:reschedule:${aptId}` }],
          ]
        );
      }
    }
  }

  // Show appointments
  private async showAppointments(message: IncomingMessage, session: OnboardingState, plugin: MessagingPlugin): Promise<void> {
    // Check if this user is a doctor
    const doctor = await this.db.prepare(
      'SELECT id, name FROM providers WHERE id IN (SELECT id FROM providers) AND id = ?'
    ).bind(message.userId).first() as any;

    // Try to find doctor by telegram_id
    const doctorByTg = await this.db.prepare(
      'SELECT id, name FROM providers WHERE id = ?'
    ).bind(session.platformUserId).first() as { id: string; name: string } | null;

    if (doctorByTg) {
      // Doctor view - show their appointments
      const appointments = await this.db.prepare(
        `SELECT a.id, a.customer_name, a.start_time, a.end_time, a.status, s.name as service_name
         FROM appointments a
         JOIN services s ON a.service_id = s.id
         WHERE a.provider_id = ?
         ORDER BY a.start_time DESC
         LIMIT 10`
      ).bind(doctorByTg.id).all() as any;

      if (!appointments.results || appointments.results.length === 0) {
        await plugin.send(message.chatId, { text: '📋 No appointments yet. Patients will book with you once your profile is active.' });
        return;
      }

      let text = `📋 <b>Your Appointments</b>\n\n`;
      for (const apt of appointments.results) {
        const date = new Date(apt.start_time * 1000);
        const dateStr = date.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
        const timeStr = date.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
        const statusEmoji = apt.status === 'confirmed' ? '✅' : apt.status === 'pending' ? '⏳' : apt.status === 'cancelled' ? '❌' : '🔄';
        text += `${statusEmoji} <b>${apt.customer_name}</b>\n`;
        text += `   ${apt.service_name} — ${dateStr} ${timeStr}\n`;
        text += `   Status: ${apt.status}\n\n`;
      }

      // Show buttons for pending appointments
      const pendingApts = appointments.results.filter((a: any) => a.status === 'pending');
      if (pendingApts.length > 0) {
        const buttons = pendingApts.map((apt: any) => [
          { text: `✅ Approve ${apt.customer_name}`, callbackData: `apt:approve:${apt.id}` },
          { text: `❌ Reject`, callbackData: `apt:reject:${apt.id}` },
        ]);
        await plugin.sendWithButtons(message.chatId, text, buttons);
      } else {
        await plugin.send(message.chatId, { text });
      }
    } else {
      // Patient view - show link
      await plugin.send(message.chatId, {
        text: '📋 Appointments\n\nView your appointments at:\nhttps://appoint.satish-aradhya.workers.dev/appointments',
      });
    }
  }

  // Handle appointment approve/reject
  private async handleAppointmentAction(
    message: IncomingMessage, session: OnboardingState, plugin: MessagingPlugin,
    appointmentId: string, newStatus: 'confirmed' | 'cancelled'
  ): Promise<void> {
    // Verify doctor owns this appointment
    const doctor = await this.db.prepare(
      'SELECT id FROM providers WHERE id = ?'
    ).bind(session.platformUserId).first() as { id: string } | null;

    if (!doctor) {
      await plugin.send(message.chatId, { text: '❌ Doctor profile not found.' });
      return;
    }

    const appointment = await this.db.prepare(
      'SELECT * FROM appointments WHERE id = ? AND provider_id = ?'
    ).bind(appointmentId, doctor.id).first() as any;

    if (!appointment) {
      await plugin.send(message.chatId, { text: '❌ Appointment not found.' });
      return;
    }

    if (appointment.status !== 'pending') {
      await plugin.send(message.chatId, { text: `ℹ️ Appointment already ${appointment.status}.` });
      return;
    }

    await this.db.prepare('UPDATE appointments SET status = ?, updated_at = ? WHERE id = ?')
      .bind(newStatus, Math.floor(Date.now() / 1000), appointmentId).run();

    const emoji = newStatus === 'confirmed' ? '✅' : '❌';
    const action = newStatus === 'confirmed' ? 'approved' : 'rejected';
    await plugin.send(message.chatId, { text: `${emoji} Appointment ${action} for ${appointment.customer_name}.` });

    // Notify patient
    if (appointment.customer_telegram_id) {
      const dateStr = new Date(appointment.start_time * 1000).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
      const timeStr = new Date(appointment.start_time * 1000).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
      const msg = newStatus === 'confirmed'
        ? `✅ Your appointment is confirmed!\n📅 ${dateStr} ${timeStr}`
        : `❌ Your appointment was declined.\n📅 ${dateStr} ${timeStr}\nPlease book another slot.`;
      await plugin.send(String(appointment.customer_telegram_id), { text: msg });
    }
  }

  // Show reschedule options
  private async showRescheduleOptions(
    message: IncomingMessage, session: OnboardingState, plugin: MessagingPlugin, aptId: string
  ): Promise<void> {
    const appointment = await this.db.prepare(
      'SELECT provider_id, service_id, customer_name, customer_telegram_id FROM appointments WHERE id = ?'
    ).bind(aptId).first() as any;

    if (!appointment) {
      await plugin.send(message.chatId, { text: '❌ Appointment not found.' });
      return;
    }

    // Verify doctor owns this appointment
    const doctor = await this.db.prepare(
      'SELECT id FROM providers WHERE platform_user_id = ?'
    ).bind(session.platformUserId).first() as any;

    if (!doctor || doctor.id !== appointment.provider_id) {
      await plugin.send(message.chatId, { text: '❌ Not authorized.' });
      return;
    }

    session.data.rescheduleAptId = aptId;
    session.data.bookDoctorId = appointment.provider_id;
    await this.showAvailableDates(message, session, plugin, appointment.service_id);
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
