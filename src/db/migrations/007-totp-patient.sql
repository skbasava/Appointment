-- 007-totp-patient.sql
ALTER TABLE patient_auth ADD COLUMN totp_secret TEXT;
