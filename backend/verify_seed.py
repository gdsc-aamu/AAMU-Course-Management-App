"""
Verify that Supabase was seeded correctly.

Usage (run from project root):
    python backend/verify_seed.py

Prints counts per table and lists all seeded programs.
"""

import os
import sys

from dotenv import load_dotenv
from supabase import create_client

load_dotenv()


def main():
    url = os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_KEY")
    if not url or not key:
        print("Error: SUPABASE_URL and SUPABASE_SERVICE_KEY must be set in .env")
        sys.exit(1)

    client = create_client(url, key)

    print("\n=== SEEDED PROGRAMS ===")
    programs = client.table("programs").select("code, name, catalog_year, total_credit_hours").order("catalog_year").order("code").execute()
    if not programs.data:
        print("  No programs found — seeding may not have run yet.")
    else:
        print(f"{'CODE':<25} {'YEAR':<6} {'HOURS':<7} NAME")
        print("-" * 80)
        for p in programs.data:
            print(f"{p['code']:<25} {p['catalog_year']:<6} {p['total_credit_hours']:<7} {p['name']}")

    print("\n=== ROW COUNTS ===")
    tables = ["programs", "courses", "curriculum_slots", "elective_slot_eligible_courses", "concentrations", "concentration_slots"]
    for table in tables:
        result = client.table(table).select("id", count="exact").execute()
        count = result.count if result.count is not None else len(result.data)
        print(f"  {table:<40} {count:>6} rows")

    print()


if __name__ == "__main__":
    main()
