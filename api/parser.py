import re
import pdfplumber
from models import Course, StudentInfo, DegreeWorksResult


_COMPLETED_RE = re.compile(
    r"^([A-Z]{2,5})\s+(\d{3}[A-Z]{0,2})\s+(.+?)\s+([A-Z][+-]?)\s+(\d+(?:\.\d+)?)\s+((?:Fall|Spring|Summer)\s+\d{4})$"
)

_IN_PROGRESS_RE = re.compile(
    r"^([A-Z]{2,5})\s+(\d{3}[A-Z]{0,2})\s+(.+?)\s+REG\s+\((\d+(?:\.\d+)?)\)\s+((?:Fall|Spring|Summer)\s+\d{4})$"
)

_SECTION_RE = re.compile(r"^(.+?)\s+(INCOMPLETE|COMPLETE)$")

# Student header fields
_NAME_RE = re.compile(r"Student name\s+(.+)")
_ID_RE = re.compile(r"Student ID\s+(\S+)")
_DEGREE_RE = re.compile(r"Degree\s+((?:Bachelor|Master|Doctor|Associate)\s+.+)")
_AUDIT_RE = re.compile(r"Audit date\s+(\d{2}/\d{2}/\d{4})")
_PROGRESS_RE = re.compile(r"(\d+)%")


def _parse_student_info(text: str) -> StudentInfo:
    name = _NAME_RE.search(text)
    sid = _ID_RE.search(text)
    degree = _DEGREE_RE.search(text)
    audit = _AUDIT_RE.search(text)
    progress = _PROGRESS_RE.search(text)

    return StudentInfo(
        name=name.group(1).strip() if name else "Unknown",
        student_id=sid.group(1).strip() if sid else "Unknown",
        degree=degree.group(1).strip() if degree else "Unknown",
        audit_date=audit.group(1) if audit else "Unknown",
        degree_progress_pct=int(progress.group(1)) if progress else None,
    )


def parse_degreeworks_pdf(pdf_path: str) -> DegreeWorksResult:
    """
    Parses DegreeWorks PDF and returns structured course data

    Args:
        pdf_path: Absolute or relative path to the DegreeWorks PDF

    Returns:
        student info and course lists

    Usage:
        result = parse_degreeworks_pdf("Degree Works.pdf")
        taken_courses = result.all_courses          
        completed     = result.completed_courses    
        in_progress   = result.in_progress_courses 
    """
    full_text = ""
    all_lines: list[tuple[str, str]] = []  

    with pdfplumber.open(pdf_path) as pdf:
        for page in pdf.pages:
            text = page.extract_text() or ""
            full_text += text + "\n"

    student = _parse_student_info(full_text)

    current_section = "General"
    completed: list[Course] = []
    in_progress: list[Course] = []

    seen: set[str] = set()  

    for line in full_text.splitlines():
        line = line.strip()
        if not line:
            continue

        sec_match = _SECTION_RE.match(line)
        if sec_match and len(line) < 80:
            current_section = sec_match.group(1).strip()
            continue

        m = _COMPLETED_RE.match(line)
        if m:
            code = f"{m.group(1)} {m.group(2)}"
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
                    section=current_section,
                ))
            continue
            
        m = _IN_PROGRESS_RE.match(line)
        if m:
            code = f"{m.group(1)} {m.group(2)}"
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
                    section=current_section,
                ))

    return DegreeWorksResult(
        student=student,
        completed_courses=completed,
        in_progress_courses=in_progress,
        all_courses=completed + in_progress,
    )
