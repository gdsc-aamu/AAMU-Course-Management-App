/**
 * Curriculum Service
 * 
 * Responsibility: Provide curriculum data (programs, courses, prerequisites)
 * 
 * Current location of implementation: /lib/db/curriculum.ts
 * Status: To be migrated from lib/ to here
 */

import type {
  CurriculumContext,
  ProgramOverview,
  PrerequisiteResult,
  SearchOptions,
} from "@/shared/contracts";

/**
 * Fetch full curriculum context for a program
 * Used by chat service to understand degree requirements
 */
export async function fetchCurriculumContext(
  programCode: string
): Promise<CurriculumContext | null> {
  // TODO: Migrate implementation from /lib/db/curriculum.ts
  throw new Error("Not yet migrated");
}

/**
 * Fetch program metadata and statistics
 */
export async function fetchProgramOverview(
  programCode: string
): Promise<ProgramOverview | null> {
  // TODO: Migrate implementation from /lib/db/curriculum.ts
  throw new Error("Not yet migrated");
}

/**
 * Fetch course prerequisites by course code
 */
export async function fetchCoursePrerequisitesByCode(
  courseCode: string
): Promise<PrerequisiteResult | null> {
  // TODO: Migrate implementation from /lib/db/curriculum.ts
  throw new Error("Not yet migrated");
}
