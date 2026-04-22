"use client"

import { useState, useEffect } from "react"
import { Sidebar } from "@/components/layout/sidebar"
import { Footer } from "@/components/layout/footer"
import { RecentPlans } from "@/components/dashboard/recent-plans"
import { usePlans } from "@/hooks/use-plans"
import { createClient } from "@/lib/supabase/client"
import { statsCache, onCrossTabInvalidation, type CachedStats } from "@/lib/app-cache"

const supabase = createClient()

function deriveNextSemester() {
  const month = new Date().getMonth() + 1
  const year = new Date().getFullYear()
  return month <= 5 ? `Fall ${year}` : `Spring ${year + 1}`
}

export default function DashboardPage() {
  const { plans, isLoading, toggleStarred, deletePlan, duplicatePlan } = usePlans()
  const [classification, setClassification] = useState("—")
  const [gpa, setGpa] = useState("—")
  const [creditsEarned, setCreditsEarned] = useState("—")
  const [degreeProgress, setDegreeProgress] = useState("—")
  const [nextSemester, setNextSemester] = useState(deriveNextSemester())
  const [isLoadingProfile, setIsLoadingProfile] = useState(true)

  useEffect(() => {
    let uid: string | null = null

    const applyStats = (s: CachedStats) => {
      setClassification(s.classification)
      setGpa(s.gpa)
      setCreditsEarned(s.creditsEarned)
      setDegreeProgress(s.degreeProgress)
      setNextSemester(s.nextSemester)
    }

    const fetchStats = async (userId: string): Promise<CachedStats> => {
      const [{ data: profile }, { data: summary }] = await Promise.all([
        supabase.from("user_academic_profiles").select("classification").eq("user_id", userId).single(),
        supabase.from("student_degree_summary").select("overall_gpa, credits_applied, degree_progress_pct").eq("user_id", userId).single(),
      ])
      return {
        classification: profile?.classification || "—",
        gpa: summary?.overall_gpa != null ? summary.overall_gpa.toFixed(2) : "—",
        creditsEarned: summary?.credits_applied != null ? String(summary.credits_applied) : "—",
        degreeProgress: summary?.degree_progress_pct != null ? `${Math.round(summary.degree_progress_pct)}%` : "—",
        nextSemester: deriveNextSemester(),
      }
    }

    const load = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return
        uid = user.id

        const cached = statsCache.read(user.id)
        if (cached) {
          // Serve cache instantly
          applyStats(cached)
          setIsLoadingProfile(false)
          // Revalidate in background
          fetchStats(user.id).then(fresh => {
            applyStats(fresh)
            statsCache.write(user.id, fresh)
          }).catch(() => {})
          return
        }

        // Cache miss — fetch, render, cache
        const fresh = await fetchStats(user.id)
        applyStats(fresh)
        statsCache.write(user.id, fresh)
      } catch (error) {
        console.error("Error loading user profile:", error)
      } finally {
        setIsLoadingProfile(false)
      }
    }

    load()
  }, [])

  // Cross-tab: if another tab uploads DegreeWorks, refresh this tab too
  useEffect(() => {
    const getUid = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      return onCrossTabInvalidation(user.id, {
        onStatsInvalidated: () => {
          supabase.auth.getUser().then(({ data: { user } }) => {
            if (!user) return
            Promise.all([
              supabase.from("user_academic_profiles").select("classification").eq("user_id", user.id).single(),
              supabase.from("student_degree_summary").select("overall_gpa, credits_applied, degree_progress_pct").eq("user_id", user.id).single(),
            ]).then(([{ data: profile }, { data: summary }]) => {
              const fresh = {
                classification: profile?.classification || "—",
                gpa: summary?.overall_gpa != null ? summary.overall_gpa.toFixed(2) : "—",
                creditsEarned: summary?.credits_applied != null ? String(summary.credits_applied) : "—",
                degreeProgress: summary?.degree_progress_pct != null ? `${Math.round(summary.degree_progress_pct)}%` : "—",
                nextSemester: deriveNextSemester(),
              }
              setClassification(fresh.classification)
              setGpa(fresh.gpa)
              setCreditsEarned(fresh.creditsEarned)
              setDegreeProgress(fresh.degreeProgress)
              statsCache.write(user.id, fresh)
            })
          })
        }
      })
    }
    const cleanup = getUid()
    return () => { cleanup.then(fn => fn?.()) }
  }, [])

  const stats = [
    { label: "Credits Earned", value: creditsEarned },
    { label: "Current GPA", value: gpa },
    { label: "Next Semester", value: nextSemester },
    { label: "Degree Progress", value: degreeProgress },
  ]

  const sortedPlans = [...plans].sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  )

  return (
    <div className="flex flex-col lg:flex-row min-h-screen">
      <Sidebar />

      <div className="flex-1 flex flex-col min-w-0 bg-muted/40">
        <main className="flex-1 px-8 py-8 space-y-8">
          {/* Stats row — no icons, full width 4 columns */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {stats.map((stat) => (
              <div key={stat.label} className="rounded-xl border-2 border-[#A0152A] bg-white shadow-sm px-6 py-7 flex flex-col items-center justify-center min-h-[130px] text-center">
                <p className="text-[11px] font-semibold text-[#A0152A] uppercase tracking-widest mb-2">
                  {stat.label}
                </p>
                <p className="text-3xl font-bold tracking-tight text-gray-900">{stat.value}</p>
              </div>
            ))}
          </div>
          {/* Recent Plans */}
          {isLoading ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {["s1", "s2", "s3", "s4"].map((key) => (
                <div
                  key={key}
                  className="h-[120px] rounded-lg border border-dashed bg-muted/50 animate-pulse"
                />
              ))}
            </div>
          ) : (
            <RecentPlans
              plans={sortedPlans}
              totalCount={plans.length}
              onToggleStar={toggleStarred}
              onDelete={deletePlan}
              onDuplicate={duplicatePlan}
            />
          )}
         </main>
        <Footer />
      </div>
    </div>
  )
}
