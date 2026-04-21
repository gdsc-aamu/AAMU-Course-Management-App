-- Add grade and term to user_completed_courses
-- Run in Supabase SQL Editor

alter table user_completed_courses
  add column if not exists grade text,
  add column if not exists term  text;
