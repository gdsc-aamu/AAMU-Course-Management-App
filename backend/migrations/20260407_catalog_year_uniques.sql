-- One-time migration for catalog-year versioned programs/concentrations.
-- Run in Supabase SQL editor before seeding additional catalog years.

-- 1) Programs: allow one row per (code, catalog_year).
alter table programs
  drop constraint if exists programs_code_key;

alter table programs
  drop constraint if exists programs_code_catalog_year_key;

alter table programs
  add constraint programs_code_catalog_year_key unique (code, catalog_year);

-- 2) Concentrations: scope concentration code uniqueness to each program row.
alter table concentrations
  drop constraint if exists concentrations_code_key;

alter table concentrations
  drop constraint if exists concentrations_program_id_code_key;

alter table concentrations
  add constraint concentrations_program_id_code_key unique (program_id, code);
