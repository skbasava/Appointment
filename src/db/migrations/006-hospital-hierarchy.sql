-- 006-hospital-hierarchy.sql
ALTER TABLE providers ADD COLUMN hospital_id TEXT;
ALTER TABLE providers ADD COLUMN specialty TEXT;
