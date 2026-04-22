const CACHE_KEY = "dashboard_stats"
const TTL_MS = 24 * 60 * 60 * 1000 // 24 hours

export interface DashboardStats {
  classification: string
  gpa: string
  creditsEarned: string
  degreeProgress: string
  nextSemester: string
}

interface CacheEntry {
  userId: string
  stats: DashboardStats
  cachedAt: number
}

export function readDashboardCache(userId: string): DashboardStats | null {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY)
    if (!raw) return null
    const entry: CacheEntry = JSON.parse(raw)
    if (entry.userId !== userId) return null
    if (Date.now() - entry.cachedAt > TTL_MS) return null
    return entry.stats
  } catch {
    return null
  }
}

export function writeDashboardCache(userId: string, stats: DashboardStats): void {
  try {
    const entry: CacheEntry = { userId, stats, cachedAt: Date.now() }
    sessionStorage.setItem(CACHE_KEY, JSON.stringify(entry))
  } catch {
    // sessionStorage unavailable — no-op
  }
}

export function invalidateDashboardCache(): void {
  try {
    sessionStorage.removeItem(CACHE_KEY)
  } catch {
    // no-op
  }
}
