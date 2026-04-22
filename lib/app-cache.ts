"use client"

/**
 * App-wide client cache
 *
 * - localStorage for cross-tab persistence
 * - Event-driven invalidation (no TTL) — data is valid until a known mutation fires
 * - Stale-while-revalidate: callers render cached data immediately, then refresh in background
 * - Cross-tab sync: storage events propagate invalidations to other open tabs
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CachedStats {
  classification: string
  gpa: string
  creditsEarned: string
  degreeProgress: string
  nextSemester: string
}

export interface CachedProfile {
  fullName: string | null
  classification: string | null
  programCode: string | null
  bulletinYear: string | null
}

export interface CachedSessionContext {
  programCode: string | undefined
  bulletinYear: string | undefined
  classification: string | undefined
}

export interface CachedCourse {
  courseId: string
  title: string
  grade: string
  credits: number
  term: string
  status: string
  section: string
}

export interface CachedPlan {
  id: string
  name: string
  semester: string
  courses: string[]
  starred: boolean
  createdAt: string
  updatedAt: string
}

// ─── Storage keys ─────────────────────────────────────────────────────────────

const KEYS = {
  stats:      (uid: string) => `ot:stats:${uid}`,
  profile:    (uid: string) => `ot:profile:${uid}`,
  courses:    (uid: string) => `ot:courses:${uid}`,
  plans:      (uid: string) => `ot:plans:${uid}`,
  session:    (uid: string) => `ot:session:${uid}`,
}

// ─── Internals ────────────────────────────────────────────────────────────────

function read<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : null
  } catch {
    return null
  }
}

function write<T>(key: string, value: T): void {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // storage full or unavailable — degrade gracefully
  }
}

function remove(key: string): void {
  try {
    localStorage.removeItem(key)
  } catch {}
}

// ─── Stats ────────────────────────────────────────────────────────────────────

export const statsCache = {
  read:       (uid: string) => read<CachedStats>(KEYS.stats(uid)),
  write:      (uid: string, v: CachedStats) => write(KEYS.stats(uid), v),
  invalidate: (uid: string) => remove(KEYS.stats(uid)),
}

// ─── Profile ──────────────────────────────────────────────────────────────────

export const profileCache = {
  read:       (uid: string) => read<CachedProfile>(KEYS.profile(uid)),
  write:      (uid: string, v: CachedProfile) => write(KEYS.profile(uid), v),
  invalidate: (uid: string) => remove(KEYS.profile(uid)),
}

// ─── Session context (static DB fields only — never cache conversational state) ──

export const sessionCache = {
  read:       (uid: string) => read<CachedSessionContext>(KEYS.session(uid)),
  write:      (uid: string, v: CachedSessionContext) => write(KEYS.session(uid), v),
  invalidate: (uid: string) => remove(KEYS.session(uid)),
}

// ─── Completed courses ────────────────────────────────────────────────────────

export const coursesCache = {
  read:       (uid: string) => read<CachedCourse[]>(KEYS.courses(uid)),
  write:      (uid: string, v: CachedCourse[]) => write(KEYS.courses(uid), v),
  invalidate: (uid: string) => remove(KEYS.courses(uid)),
}

// ─── Plans ────────────────────────────────────────────────────────────────────

export const plansCache = {
  read:       (uid: string) => read<CachedPlan[]>(KEYS.plans(uid)),
  write:      (uid: string, v: CachedPlan[]) => write(KEYS.plans(uid), v),
  invalidate: (uid: string) => remove(KEYS.plans(uid)),
  /** Patch a single plan in place without full invalidation */
  patch:      (uid: string, planId: string, updates: Partial<CachedPlan>) => {
    const current = read<CachedPlan[]>(KEYS.plans(uid))
    if (!current) return
    write(KEYS.plans(uid), current.map(p => p.id === planId ? { ...p, ...updates } : p))
  },
  /** Append a new plan to the cache */
  append:     (uid: string, plan: CachedPlan) => {
    const current = read<CachedPlan[]>(KEYS.plans(uid)) ?? []
    write(KEYS.plans(uid), [plan, ...current])
  },
  /** Remove a plan from the cache */
  remove:     (uid: string, planId: string) => {
    const current = read<CachedPlan[]>(KEYS.plans(uid))
    if (!current) return
    write(KEYS.plans(uid), current.filter(p => p.id !== planId))
  },
}

// ─── Bulk invalidation helpers ────────────────────────────────────────────────

/** Call after DegreeWorks PDF upload */
export function invalidateAfterUpload(uid: string) {
  statsCache.invalidate(uid)
  coursesCache.invalidate(uid)
}

/** Call after profile save */
export function invalidateAfterProfileSave(uid: string) {
  statsCache.invalidate(uid)
  profileCache.invalidate(uid)
  sessionCache.invalidate(uid)
}

// ─── Cross-tab sync ───────────────────────────────────────────────────────────

/**
 * Listen for cache invalidations from other tabs.
 * Pass a map of key-prefix → callback to re-fetch when another tab mutates.
 * Returns a cleanup function — call it in useEffect return.
 */
export function onCrossTabInvalidation(
  uid: string,
  handlers: {
    onStatsInvalidated?: () => void
    onProfileInvalidated?: () => void
    onPlansInvalidated?: () => void
    onCoursesInvalidated?: () => void
  }
): () => void {
  const listener = (e: StorageEvent) => {
    if (!e.key) return
    if (e.newValue !== null) return // write event, not removal
    if (e.key === KEYS.stats(uid))   handlers.onStatsInvalidated?.()
    if (e.key === KEYS.profile(uid)) handlers.onProfileInvalidated?.()
    if (e.key === KEYS.plans(uid))   handlers.onPlansInvalidated?.()
    if (e.key === KEYS.courses(uid)) handlers.onCoursesInvalidated?.()
  }
  window.addEventListener("storage", listener)
  return () => window.removeEventListener("storage", listener)
}
