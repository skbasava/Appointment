-- Migration 008: Clinics and doctor-clinic mapping
CREATE TABLE IF NOT EXISTS clinics (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  address TEXT,
  phone TEXT,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS doctor_clinics (
  id TEXT PRIMARY KEY,
  doctor_id TEXT NOT NULL,
  clinic_id TEXT NOT NULL,
  is_primary INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY (doctor_id) REFERENCES providers(id) ON DELETE CASCADE,
  FOREIGN KEY (clinic_id) REFERENCES clinics(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_doctor_clinics_doctor ON doctor_clinics(doctor_id);
CREATE INDEX IF NOT EXISTS idx_doctor_clinics_clinic ON doctor_clinics(clinic_id);
