-- Migration 005: Platform columns for multi-channel support
ALTER TABLE providers ADD COLUMN platform TEXT;
ALTER TABLE providers ADD COLUMN platform_user_id TEXT;
