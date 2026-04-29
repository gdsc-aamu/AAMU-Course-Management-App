-- Add athlete flag and hours-worked-per-week to user academic profiles
ALTER TABLE user_academic_profiles
  ADD COLUMN IF NOT EXISTS is_athlete BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS hours_worked_per_week INTEGER;
