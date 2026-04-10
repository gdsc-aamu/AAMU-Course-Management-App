# Quick Seeding Guide

This guide walks you through seeding AAMU program curriculum data into Supabase.

## Prerequisites

✅ **Required setup (must be done first)**:
1. Python 3.8+ installed
2. Virtual environment activated:
   ```bash
   .venv\Scripts\Activate.ps1
   ```
3. Environment variables set in `.env`:
   ```
   SUPABASE_URL=<your-project-url>
   SUPABASE_SERVICE_KEY=<your-service-role-key>
   ```

## Step 1: Verify Environment

Run this in the root directory to confirm .env is loaded:

```bash
python -c "import os; from dotenv import load_dotenv; load_dotenv(); print(f'URL: {os.getenv(\"SUPABASE_URL\")}'); print(f'Key: {os.getenv(\"SUPABASE_SERVICE_KEY\")[:10]}...')"
```

If both values print correctly, you're ready. If blank or error, check your `.env` file.

## Step 2: Find Your Program JSON File

Look in the **root directory** for JSON files like:
- `biology_bs.json`
- `computer_science_bscs.json`
- `engineering_bsee.json`
- etc.

Note the **full file path**. Example: `computer_science_bscs.json`

## Step 3: Run the Seed Script

From the **root directory**, run:

```bash
python backend/seed.py <your-json-file>
```

**Example**:
```bash
python backend/seed.py biology_bs.json
```

## Step 4: Watch for Success

The script will print:
- ✅ `Inserted/updated X programs`
- ✅ `Inserted/updated Y concentrations`
- ✅ `Inserted/updated Z curriculum slots`
- ✅ `Inserted/updated N courses`

**If you see errors**, check:
1. File path is correct (exists in current directory)
2. `.env` variables are set (redo Step 1)
3. Supabase credentials have admin access

## Multiple Programs?

Repeat Step 3 for each program file:

```bash
python backend/seed.py biology_bs.json
python backend/seed.py computer_science_bscs.json
python backend/seed.py engineering_bsee.json
```

All data will be **combined without overwriting** existing programs.

## Verify in Supabase

After seeding, check the Supabase dashboard:

1. Go to **SQL Editor**
2. Run:
   ```sql
   SELECT code, catalog_year, name FROM programs ORDER BY code, catalog_year;
   ```
3. You should see all seeded programs with their catalog years (e.g., "2021-2022", "2023-2024")

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| `ModuleNotFoundError: supabase` | Run `pip install -r backend/requirements.txt` |
| `Invalid JSON` | Check the JSON file is valid (use a JSON validator) |
| `Permission denied` | Ensure SUPABASE_SERVICE_KEY has admin rights; use service role, not API key |
| `No such file or directory` | Run from **root directory**; use correct relative path |

---

## Questions?

- Check the seed script: `backend/seed.py`
- Check database schema: `backend/schema.sql`
- Contact: [Your team contact]
