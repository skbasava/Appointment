-- Migration 004: TOTP authentication for doctors
-- Adds TOTP columns to providers table for authenticator-based verification

ALTER TABLE providers ADD COLUMN totp_secret TEXT;
ALTER TABLE providers ADD COLUMN totp_enabled INTEGER DEFAULT 0;

-- Add firebase_uid to patient_auth table for patient Firebase auth
ALTER TABLE patient_auth ADD COLUMN firebase_uid TEXT;
