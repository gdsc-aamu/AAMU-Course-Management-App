-- Migration 003: DegreeWorks structured data tables
-- Run this in the Supabase SQL Editor (Database → SQL Editor → New query)
-- These tables store data parsed from the student's uploaded DegreeWorks PDF.

-- Overall degree progress snapshot (one row per student)
create table if not exists student_degree_summary (
  user_id             uuid primary key references auth.users(id) on delete cascade,
  degree_progress_pct numeric,
  credits_required    numeric,
  credits_applied     numeric,
  credits_remaining   numeric generated always as (
    case
      when credits_required is not null and credits_applied is not null
      then greatest(0, credits_required - credits_applied)
      else null
    end
  ) stored,
  overall_gpa         numeric,
  catalog_year        text,
  concentration       text,
  audit_date          text,
  updated_at          timestamptz not null default now()
);

-- Per-block status (GenEd Requirements, Major in CS, Core Requirements, etc.)
create table if not exists student_requirement_blocks (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users(id) on delete cascade,
  block_name        text not null,
  status            text not null check (status in ('complete', 'in_progress', 'incomplete')),
  credits_required  numeric,
  credits_applied   numeric,
  credits_remaining numeric generated always as (
    case
      when credits_required is not null and credits_applied is not null
      then greatest(0, credits_required - credits_applied)
      else null
    end
  ) stored,
  unique (user_id, block_name)
);

-- "Still needed" line items per block (e.g. "Still needed: 1 Class in CS 4@@")
create table if not exists student_block_requirements (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  block_name  text not null,
  description text not null,
  is_met      boolean not null default false
);

-- Indexes
create index if not exists idx_student_degree_summary_user
  on student_degree_summary (user_id);

create index if not exists idx_student_requirement_blocks_user
  on student_requirement_blocks (user_id);

create index if not exists idx_student_block_requirements_user
  on student_block_requirements (user_id);

-- RLS: students can only see their own data
alter table student_degree_summary enable row level security;
alter table student_requirement_blocks enable row level security;
alter table student_block_requirements enable row level security;

create policy "Users can view own degree summary"
  on student_degree_summary for select using (auth.uid() = user_id);

create policy "Users can view own requirement blocks"
  on student_requirement_blocks for select using (auth.uid() = user_id);

create policy "Users can view own block requirements"
  on student_block_requirements for select using (auth.uid() = user_id);
