import re
import pdfplumber
from models import Course, StudentInfo, RequirementBlock, BlockRequirement, DegreeWorksResult


# ── Course line patterns ────────────────────────────────────────────────────

# Term suffix shared by completed + REG patterns.
# Handles: "Fall 2023", "Spring 2024", "Summer 2022", "Summer I 2022", "Summer II 2022",
#          2-digit years like "Fall 22" (rare but seen on older audits).
_TERM_PAT = r"(?:Fall|Spring|Summer)(?:\s+I{1,3})?\s+\d{2,4}"

# Completed: "ENG 101H Composition I Honors A 3 Fall 2023"
# Grade allows 1-2 uppercase letters so transfer grades like "TR" and "IP" are matched directly.
_COMPLETED_RE = re.compile(
    r"^([A-Z]{2,5})\s+(\d{3}[A-Z]{0,2})\s+(.+?)\s+([A-Z]{1,2}[+-]?)\s+(\d+(?:\.\d+)?)\s+(" + _TERM_PAT + r")$"
)

# Fallback for completed courses that have no term listed (e.g. AP credits, very old courses,
# or PDFs where pdfplumber drops the term column).  Only used when _COMPLETED_RE fails.
# Extra safety: require credits to be a small integer (≤ 6) to avoid false positives.
_COMPLETED_NO_TERM_RE = re.compile(
    r"^([A-Z]{2,5})\s+(\d{3}[A-Z]{0,2})\s+(.+?)\s+([A-Z]{1,2}[+-]?)\s+([0-6](?:\.\d+)?)$"
)

# REG (pre-registered future semester): "CS 401 Software Engineering REG (3) Spring 2026"
_REG_RE = re.compile(
    r"^([A-Z]{2,5})\s+(\d{3}[A-Z]{0,2})\s+(.+?)\s+REG\s+\((\d+(?:\.\d+)?)\)\s+(" + _TERM_PAT + r")$"
)

# ── Block header pattern ────────────────────────────────────────────────────
# "GenEd Requirements - CMP   IN-PROGRESS" or "Major in Computer Science  INCOMPLETE"
_BLOCK_RE = re.compile(
    r"^(.+?)\s+(INCOMPLETE|IN-PROGRESS|COMPLETE)$"
)

# Block credit line: "Credits required: 53   Credits applied: 53"
_BLOCK_CREDITS_RE = re.compile(
    r"Credits required:\s*(\d+(?:\.\d+)?)\s+Credits applied:\s*(\d+(?:\.\d+)?)"
)

# Still needed lines: "Still needed: 1 Class in CS 4@@"
_STILL_NEEDED_RE = re.compile(r"^Still needed:\s+(.+)$", re.IGNORECASE)

# ── Student header patterns ─────────────────────────────────────────────────
_NAME_RE = re.compile(r"(?:Student name|Name)\s+([A-Za-z,\s]+?)(?=\s{2,}|\n|$)")
_ID_RE = re.compile(r"Student ID\s+(\S+)")
_DEGREE_RE = re.compile(r"Degree\s+((?:Bachelor|Master|Doctor|Associate)\s+.+)")
_AUDIT_RE = re.compile(r"Audit date\s+([\d/]+(?:\s+\d+:\d+\s+[AP]M)?)")
_PROGRESS_RE = re.compile(r"(\d+(?:\.\d+)?)%")
_GPA_RE = re.compile(r"(?:Overall\s+)?GPA[:\s]+(\d+\.\d+)")
_CLASSIFICATION_RE = re.compile(r"\b(Freshman|Sophomore|Junior|Senior)\b", re.IGNORECASE)
_CATALOG_YEAR_RE = re.compile(r"Catalog year[:\s]+(20\d{2}[-–]\d{2,4})")
_CONCENTRATION_RE = re.compile(r"Concentration\s+([A-Za-z\s]+?)(?=\s{2,}|College|Academic|$)", re.IGNORECASE)

# Top-level degree credit line: "Credits required: 125  Credits applied: 116"
_DEGREE_CREDITS_RE = re.compile(
    r"Credits required:\s*(\d+(?:\.\d+)?)\s+Credits applied:\s*(\d+(?:\.\d+)?)\s+Catalog year"
)

# Honors suffix normalizer
_HONORS_RE = re.compile(r"^([A-Z]{2,5}\s+\d{3})H$")


def _normalize_course_code(code: str) -> str:
    m = _HONORS_RE.match(code.strip().upper())
    return m.group(1) if m else code.strip().upper()


def _parse_student_info(text: str) -> StudentInfo:
    name = _NAME_RE.search(text)
    sid = _ID_RE.search(text)
    degree = _DEGREE_RE.search(text)
    audit = _AUDIT_RE.search(text)
    progress = _PROGRESS_RE.search(text)
    gpa = _GPA_RE.search(text)
    classification = _CLASSIFICATION_RE.search(text)
    catalog_year = _CATALOG_YEAR_RE.search(text)
    concentration = _CONCENTRATION_RE.search(text)
    degree_credits = _DEGREE_CREDITS_RE.search(text)

    credits_required = float(degree_credits.group(1)) if degree_credits else None
    credits_applied = float(degree_credits.group(2)) if degree_credits else None

    return StudentInfo(
        name=name.group(1).strip() if name else "Unknown",
        student_id=sid.group(1).strip() if sid else "Unknown",
        degree=degree.group(1).strip() if degree else "Unknown",
        audit_date=audit.group(1).strip() if audit else "Unknown",
        degree_progress_pct=float(progress.group(1)) if progress else None,
        overall_gpa=float(gpa.group(1)) if gpa else None,
        classification=classification.group(1).capitalize() if classification else None,
        catalog_year=catalog_year.group(1).strip() if catalog_year else None,
        concentration=concentration.group(1).strip() if concentration else None,
        credits_required=credits_required,
        credits_applied=credits_applied,
    )


def _status_from_label(label: str) -> str:
    label = label.strip().upper()
    if label == "COMPLETE":
        return "complete"
    if label == "IN-PROGRESS":
        return "in_progress"
    return "incomplete"


def parse_degreeworks_pdf(pdf_path: str) -> DegreeWorksResult:
    """
    Parse a DegreeWorks PDF and return fully structured data including:
    - student summary (GPA, progress %, credits, catalog year, concentration)
    - completed courses (graded)
    - in-progress courses (REG = future registered, in_progress = current term)
    - requirement blocks with credit totals and status
    - unmet/still-needed requirements per block
    """
    full_text = ""

    with pdfplumber.open(pdf_path) as pdf:
        for page in pdf.pages:
            full_text += (page.extract_text() or "") + "\n"

    student = _parse_student_info(full_text)

    current_block = "General"
    current_block_status = "incomplete"
    completed: list[Course] = []
    in_progress: list[Course] = []
    requirement_blocks: list[RequirementBlock] = []
    block_requirements: list[BlockRequirement] = []
    seen: set[str] = set()

    # Track pending block credits — they appear on the line after the block header
    pending_block_name: str | None = None
    pending_block_status: str | None = None

    lines = full_text.splitlines()

    for i, raw_line in enumerate(lines):
        line = raw_line.strip()
        if not line:
            continue

        # ── Flush pending block if we have credits on this line ──
        if pending_block_name is not None:
            credit_match = _BLOCK_CREDITS_RE.search(line)
            if credit_match:
                requirement_blocks.append(RequirementBlock(
                    block_name=pending_block_name,
                    status=pending_block_status or "incomplete",
                    credits_required=float(credit_match.group(1)),
                    credits_applied=float(credit_match.group(2)),
                ))
                current_block = pending_block_name
                current_block_status = pending_block_status or "incomplete"
                pending_block_name = None
                pending_block_status = None
                continue
            else:
                # No credits found — commit block without credit info
                requirement_blocks.append(RequirementBlock(
                    block_name=pending_block_name,
                    status=pending_block_status or "incomplete",
                    credits_required=None,
                    credits_applied=None,
                ))
                current_block = pending_block_name
                current_block_status = pending_block_status or "incomplete"
                pending_block_name = None
                pending_block_status = None

        # ── Block header detection ──
        block_match = _BLOCK_RE.match(line)
        if block_match and len(line) < 100:
            candidate = block_match.group(1).strip()
            # Filter out noise — real block names contain letters and are not pure course lines
            if len(candidate) > 5 and not _COMPLETED_RE.match(line) and not _REG_RE.match(line):
                pending_block_name = candidate
                pending_block_status = _status_from_label(block_match.group(2))
                continue

        # ── Still needed / unmet requirement ──
        still_match = _STILL_NEEDED_RE.match(line)
        if still_match:
            block_requirements.append(BlockRequirement(
                block_name=current_block,
                description=f"Still needed: {still_match.group(1).strip()}",
                is_met=False,
            ))
            continue

        # ── Completed course (primary pattern — includes term) ──
        m = _COMPLETED_RE.match(line)
        if m:
            raw_code = f"{m.group(1)} {m.group(2)}"
            code = _normalize_course_code(raw_code)
            key = f"{code}|{m.group(6)}"
            if key not in seen:
                seen.add(key)
                completed.append(Course(
                    code=code,
                    title=m.group(3).strip(),
                    grade=m.group(4),
                    credits=float(m.group(5)),
                    term=m.group(6),
                    status="completed",
                    section=current_block,
                    is_registered=False,
                ))
            continue

        # ── Completed course (fallback — no term; AP credit, transfer, old audit) ──
        m = _COMPLETED_NO_TERM_RE.match(line)
        if m:
            raw_code = f"{m.group(1)} {m.group(2)}"
            code = _normalize_course_code(raw_code)
            key = f"{code}|no-term"
            # Only add if this course hasn't already been captured with a term
            if key not in seen and not any(s.startswith(f"{code}|") for s in seen):
                seen.add(key)
                completed.append(Course(
                    code=code,
                    title=m.group(3).strip(),
                    grade=m.group(4),
                    credits=float(m.group(5)),
                    term=None,
                    status="completed",
                    section=current_block,
                    is_registered=False,
                ))
            continue

        # ── REG course (pre-registered / future semester) ──
        m = _REG_RE.match(line)
        if m:
            raw_code = f"{m.group(1)} {m.group(2)}"
            code = _normalize_course_code(raw_code)
            key = f"{code}|{m.group(5)}"
            if key not in seen:
                seen.add(key)
                in_progress.append(Course(
                    code=code,
                    title=m.group(3).strip(),
                    grade="REG",
                    credits=float(m.group(4)),
                    term=m.group(5),
                    status="in_progress",
                    section=current_block,
                    is_registered=True,  # future semester pre-registration
                ))

    return DegreeWorksResult(
        student=student,
        completed_courses=completed,
        in_progress_courses=in_progress,
        all_courses=completed + in_progress,
        requirement_blocks=requirement_blocks,
        block_requirements=block_requirements,
    )
