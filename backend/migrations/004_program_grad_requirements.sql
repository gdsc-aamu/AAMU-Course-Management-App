-- Migration 004: Program graduation requirements + student concentration tracking

-- Add graduation requirements and capstone rule to programs table
alter table programs
  add column if not exists graduation_requirements text[] not null default '{}',
  add column if not exists capstone_rule text;

-- Track which concentration/minor a student is pursuing
alter table user_academic_profiles
  add column if not exists concentration_code text;
