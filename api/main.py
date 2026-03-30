import tempfile
import os
from fastapi import FastAPI, File, UploadFile, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from parser import parse_degreeworks_pdf
from models import DegreeWorksResult

app = FastAPI(
    title="AAMU Course Management API",
    description="Upload a DegreeWorks PDF to extract course history.",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.post("/parse-degreeworks", response_model=DegreeWorksResult)
async def parse_degreeworks(file: UploadFile = File(...)):
    """
    Upload a DegreeWorks PDF.

    Returns a structured JSON object containing:
    - student info (name, ID, degree, progress %)
    - completed_courses (graded courses)
    - in_progress_courses (currently registered)
    - all_courses (both combined — the main retrievable list)
    """
    if not file.filename.endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are accepted.")

    # Write upload to a temp file so pdfplumber can read it
    with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as tmp:
        tmp.write(await file.read())
        tmp_path = tmp.name

    try:
        result = parse_degreeworks_pdf(tmp_path)
    except Exception as e:
        raise HTTPException(status_code=422, detail=f"Failed to parse PDF: {str(e)}")
    finally:
        os.unlink(tmp_path)

    return result


@app.get("/health")
def health():
    return {"status": "ok"}
