CREATE TABLE IF NOT EXISTS booking_sessions (
  id TEXT PRIMARY KEY,
  chat_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  step TEXT NOT NULL DEFAULT 'idle',
  doctor_id TEXT,
  service_id TEXT,
  slot_start INTEGER,
  slot_end INTEGER,
  appointment_id TEXT,
  data TEXT DEFAULT '{}',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_booking_session_user ON booking_sessions(chat_id, user_id);
CREATE INDEX IF NOT EXISTS idx_booking_session_step ON booking_sessions(step);

CREATE TABLE IF NOT EXISTS callback_keys (
  key TEXT PRIMARY KEY,
  callback_type TEXT NOT NULL,
  payload TEXT NOT NULL,
  chat_id TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_callback_expires ON callback_keys(expires_at);
