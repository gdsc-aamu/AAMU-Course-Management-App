# AAMU 2025 Program Seeding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Seed all 39 AAMU 2025 program JSON files from `backend/aamu_course_plans_2025_all_programs/` into Supabase using the existing `backend/seed.py` script.

**Architecture:** Run `python backend/seed.py <json-path>` once per JSON file from the project root directory. The script upserts programs, courses, curriculum slots, elective options, and concentrations — safe to re-run without duplication.

**Tech Stack:** Python 3.8+, python-dotenv, supabase-py, Supabase (PostgreSQL)

---

## Pre-flight Checklist

Before running any tasks, confirm:
- [ ] You are in the **root directory**: `/Users/kingsolomon/Desktop/Projects/CouseManagement`
- [ ] `.env` file exists at root with `SUPABASE_URL` and `SUPABASE_SERVICE_KEY` set
- [ ] Python virtual environment is available

---

### Task 1: Environment Setup

**Files:**
- Read: `backend/requirements.txt`
- Read: `.env` (root)

- [ ] **Step 1: Activate virtual environment**

```bash
# On Mac/Linux:
source .venv/bin/activate

# On Windows (PowerShell):
.venv\Scripts\Activate.ps1
```

- [ ] **Step 2: Install dependencies**

```bash
pip install -r backend/requirements.txt
```

- [ ] **Step 3: Verify environment variables load correctly**

```bash
python -c "import os; from dotenv import load_dotenv; load_dotenv(); print(f'URL: {os.getenv(\"SUPABASE_URL\")}'); print(f'Key: {os.getenv(\"SUPABASE_SERVICE_KEY\")[:10]}...')"
```

Expected: Both URL and Key print non-empty values. If blank, fix `.env` before proceeding.

---

### Task 2: Seed All 39 JSON Files

**Files:**
- Script: `backend/seed.py`
- Data: `backend/aamu_course_plans_2025_all_programs/*.json`

Run each command from the **root directory**. Each prints success output when done.

- [ ] **Step 1: accounting_bs**
```bash
python backend/seed.py backend/aamu_course_plans_2025_all_programs/accounting_bs.json
```

- [ ] **Step 2: animal_biohealth_sciences_bs**
```bash
python backend/seed.py backend/aamu_course_plans_2025_all_programs/animal_biohealth_sciences_bs.json
```

- [ ] **Step 3: biology_bs**
```bash
python backend/seed.py backend/aamu_course_plans_2025_all_programs/biology_bs.json
```

- [ ] **Step 4: business_administration_bs**
```bash
python backend/seed.py backend/aamu_course_plans_2025_all_programs/business_administration_bs.json
```

- [ ] **Step 5: chemistry_bs**
```bash
python backend/seed.py backend/aamu_course_plans_2025_all_programs/chemistry_bs.json
```

- [ ] **Step 6: civil_engineering_bsce**
```bash
python backend/seed.py backend/aamu_course_plans_2025_all_programs/civil_engineering_bsce.json
```

- [ ] **Step 7: communications_media_ba**
```bash
python backend/seed.py backend/aamu_course_plans_2025_all_programs/communications_media_ba.json
```

- [ ] **Step 8: communicative_sciences_disorders_bs**
```bash
python backend/seed.py backend/aamu_course_plans_2025_all_programs/communicative_sciences_disorders_bs.json
```

- [ ] **Step 9: computer_science_bscs**
```bash
python backend/seed.py backend/aamu_course_plans_2025_all_programs/computer_science_bscs.json
```

- [ ] **Step 10: construction_management_bs**
```bash
python backend/seed.py backend/aamu_course_plans_2025_all_programs/construction_management_bs.json
```

- [ ] **Step 11: criminal_justice_bs**
```bash
python backend/seed.py backend/aamu_course_plans_2025_all_programs/criminal_justice_bs.json
```

- [ ] **Step 12: early_childhood_education_p3_bs**
```bash
python backend/seed.py backend/aamu_course_plans_2025_all_programs/early_childhood_education_p3_bs.json
```

- [ ] **Step 13: electrical_engineering_bsee**
```bash
python backend/seed.py backend/aamu_course_plans_2025_all_programs/electrical_engineering_bsee.json
```

- [ ] **Step 14: elementary_education_k6_bs**
```bash
python backend/seed.py backend/aamu_course_plans_2025_all_programs/elementary_education_k6_bs.json
```

- [ ] **Step 15: english_ba**
```bash
python backend/seed.py backend/aamu_course_plans_2025_all_programs/english_ba.json
```

- [ ] **Step 16: entrepreneurship_bs**
```bash
python backend/seed.py backend/aamu_course_plans_2025_all_programs/entrepreneurship_bs.json
```

- [ ] **Step 17: environmental_science_bs**
```bash
python backend/seed.py backend/aamu_course_plans_2025_all_programs/environmental_science_bs.json
```

- [ ] **Step 18: family_consumer_sciences_bs**
```bash
python backend/seed.py backend/aamu_course_plans_2025_all_programs/family_consumer_sciences_bs.json
```

- [ ] **Step 19: finance_bs**
```bash
python backend/seed.py backend/aamu_course_plans_2025_all_programs/finance_bs.json
```

- [ ] **Step 20: food_science_bs**
```bash
python backend/seed.py backend/aamu_course_plans_2025_all_programs/food_science_bs.json
```

- [ ] **Step 21: forestry_bs**
```bash
python backend/seed.py backend/aamu_course_plans_2025_all_programs/forestry_bs.json
```

- [ ] **Step 22: liberal_studies_bs**
```bash
python backend/seed.py backend/aamu_course_plans_2025_all_programs/liberal_studies_bs.json
```

- [ ] **Step 23: logistics_supply_chain_management_bs**
```bash
python backend/seed.py backend/aamu_course_plans_2025_all_programs/logistics_supply_chain_management_bs.json
```

- [ ] **Step 24: management_bs**
```bash
python backend/seed.py backend/aamu_course_plans_2025_all_programs/management_bs.json
```

- [ ] **Step 25: marketing_bs**
```bash
python backend/seed.py backend/aamu_course_plans_2025_all_programs/marketing_bs.json
```

- [ ] **Step 26: mathematics_bs**
```bash
python backend/seed.py backend/aamu_course_plans_2025_all_programs/mathematics_bs.json
```

- [ ] **Step 27: mechanical_engineering_bsme**
```bash
python backend/seed.py backend/aamu_course_plans_2025_all_programs/mechanical_engineering_bsme.json
```

- [ ] **Step 28: music_ba**
```bash
python backend/seed.py backend/aamu_course_plans_2025_all_programs/music_ba.json
```

- [ ] **Step 29: physical_education_teacher_p12_bs**
```bash
python backend/seed.py backend/aamu_course_plans_2025_all_programs/physical_education_teacher_p12_bs.json
```

- [ ] **Step 30: physics_bs**
```bash
python backend/seed.py backend/aamu_course_plans_2025_all_programs/physics_bs.json
```

- [ ] **Step 31: political_science_bs**
```bash
python backend/seed.py backend/aamu_course_plans_2025_all_programs/political_science_bs.json
```

- [ ] **Step 32: psychology_bs**
```bash
python backend/seed.py backend/aamu_course_plans_2025_all_programs/psychology_bs.json
```

- [ ] **Step 33: social_work_bsw**
```bash
python backend/seed.py backend/aamu_course_plans_2025_all_programs/social_work_bsw.json
```

- [ ] **Step 34: sociology_bs**
```bash
python backend/seed.py backend/aamu_course_plans_2025_all_programs/sociology_bs.json
```

- [ ] **Step 35: special_education_6_12_bs**
```bash
python backend/seed.py backend/aamu_course_plans_2025_all_programs/special_education_6_12_bs.json
```

- [ ] **Step 36: special_education_k6_bs**
```bash
python backend/seed.py backend/aamu_course_plans_2025_all_programs/special_education_k6_bs.json
```

- [ ] **Step 37: sport_management_bs**
```bash
python backend/seed.py backend/aamu_course_plans_2025_all_programs/sport_management_bs.json
```

- [ ] **Step 38: urban_regional_planning_bs**
```bash
python backend/seed.py backend/aamu_course_plans_2025_all_programs/urban_regional_planning_bs.json
```

- [ ] **Step 39: visual_art_ba**
```bash
python backend/seed.py backend/aamu_course_plans_2025_all_programs/visual_art_ba.json
```

**Expected output per file:**
```
Upserting program...
  program_id: <uuid> (code: <DEPT-DEGREE>, catalog_year: 2025)

Upserting courses...
  X courses upserted

Inserting curriculum slots...
  Y slots inserted

Upserting elective slot eligible courses...
  Z elective options upserted

Upserting concentrations and minors...
  <Concentration Name>: N slots inserted

Done. Database seeded successfully.
```

---

### Task 3: Verify in Supabase

- [ ] **Step 1: Open Supabase SQL Editor and run the verification query**

```sql
SELECT code, catalog_year, name FROM programs ORDER BY code, catalog_year;
```

Expected: 39 rows — one per program, all with `catalog_year = 2025`.

- [ ] **Step 2: Spot-check a program's curriculum slots**

```sql
SELECT p.name, cs.slot_label, cs.semester_number, cs.credit_hours
FROM curriculum_slots cs
JOIN programs p ON p.id = cs.program_id
WHERE p.code = 'BSCS-BSCS'   -- adjust code as needed
ORDER BY cs.semester_number, cs.slot_order;
```

Expected: 8 semesters of slots for that program.

---

## Troubleshooting

| Error | Fix |
|-------|-----|
| `ModuleNotFoundError: supabase` | Run `pip install -r backend/requirements.txt` |
| `Invalid JSON` | Validate the specific file with `python -c "import json; json.load(open('<file>'))"`|
| `SUPABASE_URL / KEY not set` | Re-check `.env` and re-run the verify step in Task 1 |
| `No such file or directory` | Ensure you are running from the project **root**, not from `backend/` |
| Slots already exist warning | Safe to ignore — script skips duplicate slots by design |
