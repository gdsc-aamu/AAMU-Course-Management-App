/**
 * Shared Contracts
 * ================
 * Central location for all request/response schemas shared between frontend and backend.
 * This ensures frontend and backend stay in sync without tight coupling to implementation details.
 */

// ============================================================================
// Chat Routing & Query
// ============================================================================

export type ChatRoute = "DB_ONLY" | "RAG_ONLY" | "HYBRID";

export interface MatchedRule {
  id: string;
  weight: number;
  reason: string;
}

export interface ChatQueryRequest {
  question: string;
  studentId?: string;
  session?: {
    programCode?: string;
    bulletinYear?: string;
  };
}

export interface RoutingDecision {
  route: ChatRoute;
  confidence: number;
  matchedRules: MatchedRule[];
  missingContext: string[];
}

export interface RoutedResponse {
  route: ChatRoute;
  confidence: number;
  matchedRules: MatchedRule[];
  missingContext: string[];
  handlerResult: Record<string, unknown>;
}

// ============================================================================
// Curriculum Data
// ============================================================================

export interface CurriculumContext {
  programCode: string;
  programName: string;
  totalCreditHours: number;
  formattedText: string;
}

export interface ProgramOverview {
  programCode: string;
  programName: string;
  totalCreditHours: number;
  semesterCount: number;
  totalSlots: number;
  electiveSlots: number;
}

export interface PrerequisiteOption {
  courseId: string;
  title: string;
  minGrade?: string | null;
}

export interface PrerequisiteGroup {
  prereqGroup: number;
  options: PrerequisiteOption[];
}

export interface PrerequisiteResult {
  courseId: string;
  title: string;
  groups: PrerequisiteGroup[];
}

export interface SearchOptions {
  matchCount?: number;
}

export interface NextCourseOption {
  courseId: string;
  title: string;
  creditHours: number;
  semesterNumber: number;
  semesterLabel: string;
}

export interface EligibleNextCourseOption extends NextCourseOption {
  reason: string;
}

export interface BlockedNextCourseOption extends NextCourseOption {
  missingPrerequisiteGroups: string[];
}

export interface NextCoursesRecommendation {
  programCode: string;
  catalogYear: number | null;
  completedCount: number;
  inProgressCount: number;
  eligibleNow: EligibleNextCourseOption[];
  blocked: BlockedNextCourseOption[];
  alreadyInProgress: NextCourseOption[];
}

// ============================================================================
// RAG / Bulletin Search
// ============================================================================

export interface BulletinChunk {
  content: string;
  title: string;
  chunkType: string;
  sectionHierarchy: string;
  citation: string;
  isCritical: boolean;
  bulletinYear: string;
}

export interface StudentProfile {
  bulletinYear: string;
}

export interface RagSearchRequest {
  query: string;
  studentProfile: StudentProfile;
  options?: SearchOptions;
}

export interface RagSearchResponse {
  chunks: BulletinChunk[];
}

export interface RagGenerateRequest {
  query: string;
  chunks: BulletinChunk[];
}

export interface RagGenerateResponse {
  answer: string;
}

export interface RagHybridGenerateRequest {
  query: string;
  chunks: BulletinChunk[];
  curriculumContext?: string | null;
}

export interface RagHybridGenerateResponse {
  answer: string;
}

// ============================================================================
// PDF Parsing / DegreeWorks
// ============================================================================

export interface Course {
  code: string; // e.g. "ENG 101H"
  title: string; // e.g. "Composition I Honors"
  grade: string; // e.g. "A", "REG"
  credits: number; // e.g. 3.0
  term: string; // e.g. "Fall 2023"
  status: "completed" | "in_progress"; // Course status
  section: string; // e.g. "GenEd Requirements - EE"
}

export interface StudentInfo {
  name: string;
  studentId: string;
  degree: string;
  auditDate: string;
  degreeProgressPct?: number | null;
}

export interface DegreeWorksResult {
  student: StudentInfo;
  completedCourses: Course[];
  inProgressCourses: Course[];
  allCourses: Course[];
}

export interface PdfParsingRequest {
  file: File | Buffer; // Frontend sends File, backend receives Buffer
}

export interface PdfParsingResponse {
  success: boolean;
  result?: DegreeWorksResult;
  error?: string;
}

// ============================================================================
// Service Response Wrapper
// ============================================================================

export interface ServiceResponse<T> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
}
