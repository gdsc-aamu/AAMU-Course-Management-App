/**
 * PDF Parsing Service
 * 
 * Responsibility: Parse DegreeWorks PDFs, extract student and course data
 * 
 * Current location of implementation: /api/main.py, /api/parser.py, /api/models.py
 * Status: To be refactored as a service endpoint
 */

import type { PdfParsingRequest, PdfParsingResponse, DegreeWorksResult } from "@/shared/contracts";

/**
 * Parse a DegreeWorks PDF file
 * Returns structured student info and course history
 */
export async function parseDegreeWorksPdf(
  filePath: string | Buffer
): Promise<DegreeWorksResult> {
  // TODO: Wrap existing /api/parser.py logic as a service
  // For now, this returns the result of calling the FastAPI endpoint
  throw new Error("Not yet migrated");
}
