#!/usr/bin/env python3
"""
AAMU Advisor Regression Smoke Test
Runs 45 student-like questions against localhost:3000/api/chat/query.
Usage:
  python backend/tests/smoke_test.py
  python backend/tests/smoke_test.py --verbose
"""

import json
import re
import sys
import time
import urllib.request
import urllib.error

BASE_URL = "http://localhost:3000"
SID = "4be7027e-4b4f-4baa-b850-26b86a4d85e6"
DEFAULT_SESSION = {
    "programCode": "BIO-BS",
    "bulletinYear": "2025-2026",
    "classification": "Freshman",
    "isInternational": False,
    "scholarshipType": None,
}

VERBOSE = "--verbose" in sys.argv or "-v" in sys.argv

TESTS = [
    # ── Chitchat / affirmative guards ────────────────────────────────────
    {
        "label": "chitchat-hi",
        "q": "hi",
        "expect_not": ["eligible", "Suggested Schedule", "credits required"],
    },
    {
        "label": "chitchat-bare-courses",
        "q": "courses",
        "expect_not": ["Suggested Schedule", "eligible"],
    },
    {
        "label": "chitchat-ok-no-history",
        "q": "ok",
        "expect": ["AAMU", "can help"],
    },
    {
        "label": "chitchat-thanks",
        "q": "thanks",
        "expect_not": ["eligible", "Suggested Schedule"],
    },

    # ── Completed courses ─────────────────────────────────────────────────
    {
        "label": "completed-typo",
        "q": "what couses have i took",
        "expect": ["BIO"],
    },
    {
        "label": "completed-transcript",
        "q": "show my transcript",
        "expect": ["BIO"],
    },
    {
        "label": "completed-finished",
        "q": "what have i already finished",
        "expect": ["completed"],
    },

    # ── NEXT_COURSES — schedule building ──────────────────────────────────
    {
        "label": "next-register",
        "q": "what can I register for next semester",
        "expect": ["BIO", "credits"],
    },
    {
        "label": "next-12cr-target",
        "q": "I need 12 credits",
        "expect": ["12", "credits"],
    },
    {
        "label": "next-15cr-target",
        "q": "give me a 15 credit schedule",
        "expect": ["15", "credits"],
    },
    {
        "label": "next-5x3cr-no-4cr",
        "q": "give me 5 courses that are 3 credits each",
        "expect": ["3 cr"],
        "expect_not_pattern": r"\(4 cr\)",
    },
    {
        "label": "next-semester-year-not-catalog",
        "q": "what can I take for fall 2026",
        "expect": ["BIO", "credits"],
        "expect_not": ["couldn't find", "no program"],
    },
    {
        "label": "catalog-alias-2024",
        "q": "what courses can I take",
        "session_extra": {"bulletinYear": "2024-2025"},
        "expect": ["BIO", "credits"],
        "expect_not": ["couldn't find", "no program"],
    },

    # ── SAVE_PLAN misrouting guard ────────────────────────────────────────
    {
        "label": "save-plan-build-schedule",
        "q": "build my schedule",
        "expect_not": ["Suggested Schedule for Next Semester"],
    },
    {
        "label": "save-plan-create",
        "q": "create a schedule for me",
        "expect_not": ["Suggested Schedule for Next Semester"],
    },

    # ── Graduation gap / GPA ──────────────────────────────────────────────
    {
        "label": "gpa-question",
        "q": "what is my GPA",
        "expect": ["GPA"],
    },
    {
        "label": "grad-gap",
        "q": "what do I need to graduate",
        "expect": ["credits"],
    },
    {
        "label": "grad-close",
        "q": "how close am i to graduating",
        "expect": ["credits"],
    },

    # ── International / F-1 ───────────────────────────────────────────────
    {
        "label": "intl-min-credits",
        "q": "im international how many credits min",
        "session_extra": {"isInternational": True},
        "expect": ["12", "9", "in-person"],
    },
    {
        "label": "intl-min-credits-2",
        "q": "what is the minimum credits for international students",
        "expect": ["12"],
    },
    {
        "label": "intl-schedule-min",
        "q": "what courses can I take",
        "session_extra": {"isInternational": True},
        "expect": ["12"],
    },

    # ── Scholarship ───────────────────────────────────────────────────────
    {
        "label": "scholarship-presidential-gpa",
        "q": "what GPA do I need for my scholarship",
        "session_extra": {"scholarshipType": "AAMU Presidential Scholarship"},
        "expect": ["3.50", "30"],
    },
    {
        "label": "scholarship-merit-credits",
        "q": "how many credits per year for my scholarship",
        "session_extra": {"scholarshipType": "AAMU Merit Scholarship"},
        "expect": ["30", "3.10"],
    },
    {
        "label": "scholarship-list-all",
        "q": "what are the scholarship requirements for AAMU",
        "expect": ["Presidential", "Merit", "30"],
    },
    {
        "label": "scholarship-lose",
        "q": "will I lose my scholarship if my GPA drops",
        "session_extra": {"scholarshipType": "AAMU Heritage Gold Scholarship"},
        "expect": ["2.80"],
    },

    # ── Prerequisites ─────────────────────────────────────────────────────
    {
        "label": "prereq-bio",
        "q": "what are the prereqs for BIO 305",
        "expect": ["BIO"],
    },
    {
        "label": "prereq-before",
        "q": "what do I need before BIO 202",
        "expect": ["BIO 101"],
    },

    # ── GE / free electives ───────────────────────────────────────────────
    {
        "label": "ge-humanities",
        "q": "what humanities courses can I take next semester",
        "expect": ["humanities"],
    },
    {
        "label": "ge-GED-acronym",
        "q": "what GED courses are available",
        "expect": ["General Education", "credit"],
    },
    {
        "label": "ge-fine-arts",
        "q": "what fine arts courses count for my degree",
        "expect": ["credit"],
    },
    {
        "label": "ge-free-elective",
        "q": "I need a free elective",
        "expect": ["credit"],
    },
    {
        "label": "ge-pe-golf",
        "q": "can I take golf",
        "expect": ["PE", "credit"],
    },

    # ── Concentration/minor ───────────────────────────────────────────────
    {
        "label": "minor-no-conc-declared",
        "q": "what are the minor requirements",
        "expect": ["concentration", "minor"],
    },

    # ── Simulation ───────────────────────────────────────────────────────
    {
        "label": "simulate-unlock",
        "q": "if I take BIO 101 what opens up",
        "expect": ["BIO"],
    },

    # ── Bulletin policy ───────────────────────────────────────────────────
    {
        "label": "policy-min-gpa",
        "q": "what is the minimum GPA to graduate",
        "expect": ["2.0", "GPA"],
    },

    # ── Advisor escalation ────────────────────────────────────────────────
    {
        "label": "escalate-transfer",
        "q": "how do I transfer credits from community college",
        "expect": ["advisor"],
    },

    # ── General curriculum ────────────────────────────────────────────────
    {
        "label": "curriculum-course-info",
        "q": "what is BIO 101",
        "expect": ["credit"],
    },

    # ── Classification-aware scheduling ──────────────────────────────────
    {
        "label": "classification-sophomore-override",
        "q": "as a sophomore what should I take",
        "session_extra": {"classification": "Freshman"},
        "expect": ["BIO", "credits"],
    },

    # ── Electives ─────────────────────────────────────────────────────────
    {
        "label": "elective-basic",
        "q": "what electives can I take",
        "expect": ["credit"],
    },

    # ── Incremental scheduling ────────────────────────────────────────────
    {
        "label": "incremental-add-one",
        "q": "add one more course to make it 15 credits",
        "conversation_history": [
            {"role": "user", "content": "give me a 12 credit schedule"},
            {"role": "assistant", "content": "Here is your 12-credit schedule:\n- BIO 201: Genetics (3 cr)\n- BIO 210: Ecology (3 cr)\n- CHE 111: General Chemistry (4 cr)\n- MTH 115: Pre-Calculus (3 cr)\nTotal: 12 credits."},
        ],
        "expect": ["credits"],
        "expect_not": ["BIO 201", "BIO 210"],  # should not re-list history courses
    },
]


def call_api(question: str, session_extra: dict = None, conversation_history: list = None) -> dict:
    session = {**DEFAULT_SESSION, **(session_extra or {})}
    payload = json.dumps({
        "question": question,
        "studentId": SID,
        "session": session,
        "conversationHistory": conversation_history or [],
    }).encode("utf-8")

    req = urllib.request.Request(
        f"{BASE_URL}/api/chat/query",
        data=payload,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.loads(resp.read().decode("utf-8"))


def run_tests() -> bool:
    passed = failed = errors = 0

    print(f"AAMU Advisor Smoke Test — {len(TESTS)} cases against {BASE_URL}")
    print("=" * 70)

    for t in TESTS:
        label = t["label"]
        try:
            result = call_api(
                t["q"],
                t.get("session_extra"),
                t.get("conversation_history"),
            )
            answer = result.get("answer") or ""
            if not isinstance(answer, str):
                answer = json.dumps(answer)
            answer_lower = answer.lower()

            ok = True
            fail_reason = ""

            for must in t.get("expect", []):
                if must.lower() not in answer_lower:
                    ok = False
                    fail_reason = f"missing '{must}'"
                    break

            if ok:
                for must_not in t.get("expect_not", []):
                    if must_not.lower() in answer_lower:
                        ok = False
                        fail_reason = f"should not contain '{must_not}'"
                        break

            if ok:
                pattern = t.get("expect_not_pattern")
                if pattern and re.search(pattern, answer):
                    ok = False
                    fail_reason = f"matched forbidden pattern '{pattern}'"

            status = "PASS" if ok else "FAIL"
            print(f"[{status}] {label:<45} \"{t['q'][:45]}\"")
            if not ok or VERBOSE:
                if fail_reason:
                    print(f"       Reason : {fail_reason}")
                if VERBOSE or not ok:
                    print(f"       Answer : {answer[:300]}")

            passed += ok
            failed += not ok

        except urllib.error.URLError as e:
            print(f"[ERR ] {label:<45} Connection error: {e}")
            errors += 1
        except Exception as e:
            print(f"[ERR ] {label:<45} {type(e).__name__}: {e}")
            errors += 1

        time.sleep(0.3)

    total = len(TESTS)
    print("=" * 70)
    print(f"Results: {passed}/{total} passed  |  {failed} failed  |  {errors} errors")
    return failed == 0 and errors == 0


if __name__ == "__main__":
    ok = run_tests()
    sys.exit(0 if ok else 1)
