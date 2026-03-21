-- Migration 003: Phone-based authentication
-- Adds phone auth columns and tables to replace Firebase auth

-- Add phone_verified column to providers (phone column already exists in schema.sql)
ALTER TABLE providers ADD COLUMN phone_verified INTEGER DEFAULT 0;
CREATE UNIQUE INDEX IF NOT EXISTS idx_providers_phone ON providers(phone) WHERE phone IS NOT NULL;

-- OTP sessions table
CREATE TABLE IF NOT EXISTS otp_sessions (
  id TEXT PRIMARY KEY,
  phone TEXT NOT NULL,
  otp_hash TEXT NOT NULL,
  otp_salt TEXT NOT NULL,
  channel TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  attempts INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_otp_phone ON otp_sessions(phone);

-- Patient auth table
CREATE TABLE IF NOT EXISTS patient_auth (
  id TEXT PRIMARY KEY,
  phone TEXT UNIQUE,
  phone_verified INTEGER DEFAULT 0,
  name TEXT,
  telegram_id TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_patient_telegram ON patient_auth(telegram_id);
