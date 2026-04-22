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

export interface ConversationMessage {
  role: "user" | "assistant";
  content: string;
}

export interface ChatQueryRequest {
  question: string;
  studentId?: string;
  session?: {
    programCode?: string;
    bulletinYear?: string;
    classification?: string;
    studentName?: string;
    isInternational?: boolean;
    scholarshipType?: string;
    scholarshipMinGpa?: number;
    scholarshipMinCreditsPerYear?: number;
  };
  conversationHistory?: ConversationMessage[];
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
  currentTermCount: number;      // courses enrolled in current term
  preRegisteredCount: number;    // courses locked in for a future term
  currentTermCredits: number;    // credit hours currently enrolled
  preRegisteredCredits: number;  // credit hours pre-registered
  semesterCreditCap: 19;         // AAMU hard cap
  eligibleNow: EligibleNextCourseOption[];
  blocked: BlockedNextCourseOption[];
  alreadyInProgress: NextCourseOption[];  // current-term courses
  alreadyPlanned: NextCourseOption[];     // pre-registered (future terms)
}

export interface SemesterRemainingSlot {
  courseId: string | null;      // null = elective slot
  title: string;
  creditHours: number;
  isElective: boolean;
  eligibleCourses?: string[];   // populated for elective slots
}

export interface SemesterRemaining {
  semesterNumber: number;
  semesterLabel: string;
  slots: SemesterRemainingSlot[];
}

export interface GraduationGap {
  programCode: string;
  programName: string;
  creditsRequired: number;
  creditsCompleted: number;
  creditsCurrentTerm: number;    // credits enrolled in current term
  creditsPreRegistered: number;  // credits locked in for future terms
  creditsInProgress: number;     // total in-progress (currentTerm + preRegistered) — kept for compat
  creditsRemaining: number;
  remainingBySemester: SemesterRemaining[];
  electiveSlotsRemaining: number;
  isOnTrack: boolean;
}

export interface ConcentrationSlot {
  slotLabel: string;
  isElective: boolean;
  levelRestriction: string | null;
  creditHours: number;
  courseId: string | null;
  courseTitle: string | null;
}

export interface ConcentrationRequirement {
  code: string;
  name: string;
  type: "concentration" | "minor";
  totalHours: number;
  slots: ConcentrationSlot[];
}

export interface ConcentrationRequirementsResult {
  programCode: string;
  concentrations: ConcentrationRequirement[];
}

export interface ElectiveSlotOption {
  semesterNumber: number;
  semesterLabel: string;
  slotLabel: string;
  creditHours: number;
  eligibleCourses: Array<{ courseId: string; title: string }>;
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
  classification?: string | null;
  programCode?: string | null;
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
  overallGpa?: number | null;
  classification?: string | null;
  catalogYear?: string | null;
  concentration?: string | null;
  creditsRequired?: number | null;
  creditsApplied?: number | null;
}

export interface RequirementBlock {
  blockName: string;
  status: "complete" | "in_progress" | "incomplete";
  creditsRequired: number | null;
  creditsApplied: number | null;
}

export interface BlockRequirement {
  blockName: string;
  description: string;
  isMet: boolean;
}

export interface DegreeWorksResult {
  student: StudentInfo;
  completedCourses: Course[];
  inProgressCourses: Course[];
  allCourses: Course[];
  requirementBlocks: RequirementBlock[];
  blockRequirements: BlockRequirement[];
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
