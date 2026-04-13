"""
Batch seed all JSON files in a directory into Supabase.

Usage (run from project root):
    python backend/seed_all.py backend/aamu_course_plans_2025_all_programs/

Prints a summary of successes and failures at the end.
"""

import glob
import json
import os
import sys

from dotenv import load_dotenv
from supabase import create_client

# seed.py lives in the same directory — add it to path
sys.path.insert(0, os.path.dirname(__file__))
from seed import seed  # noqa: E402

load_dotenv()


def main():
    if len(sys.argv) < 2:
        print("Usage: python backend/seed_all.py <directory>")
        sys.exit(1)

    directory = sys.argv[1]
    json_files = sorted(glob.glob(os.path.join(directory, "*.json")))

    if not json_files:
        print(f"No JSON files found in: {directory}")
        sys.exit(1)

    url = os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_KEY")
    if not url or not key:
        print("Error: SUPABASE_URL and SUPABASE_SERVICE_KEY must be set in .env")
        sys.exit(1)

    client = create_client(url, key)

    success, failed = [], []

    for path in json_files:
        name = os.path.basename(path)
        print(f"\n{'=' * 60}")
        print(f"Seeding: {name}")
        print("=" * 60)
        try:
            with open(path) as f:
                data = json.load(f)
            seed(client, data, path)
            success.append(name)
        except Exception as e:
            print(f"  ERROR: {e}")
            failed.append((name, str(e)))

    print(f"\n{'=' * 60}")
    print(f"SUMMARY: {len(success)}/{len(json_files)} files seeded successfully.")
    if failed:
        print(f"\nFailed ({len(failed)}):")
        for name, err in failed:
            print(f"  - {name}: {err}")
    else:
        print("All files seeded with no errors.")
    print("=" * 60)


if __name__ == "__main__":
    main()
