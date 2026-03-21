export interface Provider {
  id: string;
  type: 'doctor' | 'hospital';
  name: string;
  email: string;
  phone: string | null;
  firebase_uid: string;
  timezone: string;
  status: 'pending' | 'verified' | 'active' | 'suspended';
  created_at: number;
  updated_at: number;
}

export interface Service {
  id: string;
  provider_id: string;
  name: string;
  description: string | null;
  duration_minutes: number;
  is_active: number;
  created_at: number;
}

export interface AvailabilityWindow {
  id: string;
  provider_id: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  is_active: number;
}

export interface BlockedDate {
  id: string;
  provider_id: string;
  date: string;
  reason: string | null;
}

export interface Appointment {
  id: string;
  provider_id: string;
  service_id: string;
  customer_telegram_id: string;
  customer_name: string;
  start_time: number;
  end_time: number;
  status: 'pending' | 'confirmed' | 'cancelled' | 'rescheduled';
  google_event_id: string | null;
  created_at: number;
  updated_at: number;
}

export interface CalendarConnection {
  id: string;
  provider_id: string;
  google_calendar_id: string;
  access_token: string;
  refresh_token: string;
  token_expires_at: number;
  status: 'connected' | 'revoked' | 'expired';
  last_synced_at: number | null;
}

export interface Notification {
  id: string;
  appointment_id: string;
  channel: string;
  type: 'confirmation' | 'reminder' | 'update' | 'cancellation';
  status: 'pending' | 'sent' | 'failed';
  sent_at: number | null;
  created_at: number;
}

export interface Env {
  DB: D1Database;
  TELEGRAM_BOT_TOKEN: string;
  WHATSAPP_ACCESS_TOKEN: string;
  WHATSAPP_PHONE_NUMBER_ID: string;
  WHATSAPP_VERIFY_TOKEN: string;
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
  GOOGLE_REDIRECT_URI: string;
  OTP_PROVIDER_SMS: string;
  OTP_PROVIDER_WHATSAPP: string;
  OTP_PROVIDER_EMAIL: string;
  TWILIO_ACCOUNT_SID: string;
  TWILIO_AUTH_TOKEN: string;
  TWILIO_PHONE_NUMBER: string;
  TWILIO_WHATSAPP_NUMBER: string;
  JWT_SECRET: string;
  JWT_SECRET_PREVIOUS?: string;
  JWT_EXPIRY: string;
  DEFAULT_COUNTRY_CODE: string;
  ENABLE_WHATSAPP_ONBOARDING: string;
  ENABLE_TELEGRAM_ONBOARDING: string;
  WHATSAPP_APP_SECRET?: string;
  TELEGRAM_WEBHOOK_SECRET?: string;
}
