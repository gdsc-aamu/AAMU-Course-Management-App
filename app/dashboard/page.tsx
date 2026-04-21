"use client"

import { useState, useEffect } from "react"
import { Sidebar } from "@/components/layout/sidebar"
import { RecentPlans } from "@/components/dashboard/recent-plans"
import { usePlans } from "@/hooks/use-plans"
import { createClient } from "@/lib/supabase/client"

const supabase = createClient()

export default function DashboardPage() {
  const { plans, isLoading, toggleStarred, deletePlan, duplicatePlan } = usePlans()
  const [userName, setUserName] = useState("Student")
  const [userInitials, setUserInitials] = useState("ST")
  const [classification, setClassification] = useState("—")
  const [gpa, setGpa] = useState("—")
  const [creditsEarned, setCreditsEarned] = useState("—")
  const [degreeProgress, setDegreeProgress] = useState("—")
  const [nextSemester, setNextSemester] = useState("—")
  const [isLoadingProfile, setIsLoadingProfile] = useState(true)

  useEffect(() => {
    const loadUserProfile = async () => {
      try {
        // Get authenticated user
        const { data: { user } } = await supabase.auth.getUser()
        if (user) {
          // Get user's display name from auth metadata
          const name = user.user_metadata?.full_name || user.email || "Student"
          setUserName(name)
          
          // Generate initials from name
          const initials = name.split(" ").map((n: string) => n[0]).join("").toUpperCase().slice(0, 2)
          setUserInitials(initials)

          // Get user's profile + degree summary in parallel
          const [{ data: profile }, { data: summary }] = await Promise.all([
            supabase
              .from("user_academic_profiles")
              .select("classification")
              .eq("user_id", user.id)
              .single(),
            supabase
              .from("student_degree_summary")
              .select("overall_gpa, credits_applied, degree_progress_pct, catalog_year")
              .eq("user_id", user.id)
              .single(),
          ])

          if (profile) {
            setClassification(profile.classification || "—")
          }

          if (summary) {
            setGpa(summary.overall_gpa != null ? summary.overall_gpa.toFixed(2) : "—")
            setCreditsEarned(summary.credits_applied != null ? String(summary.credits_applied) : "—")
            setDegreeProgress(summary.degree_progress_pct != null ? `${Math.round(summary.degree_progress_pct)}%` : "—")
          }

          // Derive next semester from current date
          const now = new Date()
          const month = now.getMonth() + 1
          const year = now.getFullYear()
          // If Jan–May → next semester is Fall same year; if Jun–Dec → next is Spring next year
          const next = month <= 5 ? `Fall ${year}` : `Spring ${year + 1}`
          setNextSemester(next)
        }
      } catch (error) {
        console.error("Error loading user profile:", error)
      } finally {
        setIsLoadingProfile(false)
      }
    }

    loadUserProfile()
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
        {/* User info bar */}
        <div className="flex items-center justify-end gap-3 px-8 py-4 border-b bg-background">
          <div className="text-right">
            <p className="text-sm font-semibold">{userName}</p>
            <p className="text-xs text-muted-foreground uppercase tracking-wide">{classification}</p>
          </div>
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-primary-foreground text-sm font-semibold shrink-0">
            {userInitials}
          </div>
        </div>
        <main className="flex-1 px-8 py-8 space-y-8">
          {/* Stats row — no icons, full width 4 columns */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {stats.map((stat) => (
              <div key={stat.label} className="rounded-xl bg-card shadow-sm px-6 py-8 flex flex-col justify-center min-h-[120px]">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-widest mb-3">
                  {stat.label}
                </p>
                <p className="text-3xl font-bold tracking-tight">{stat.value}</p>
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
      </div>
    </div>
  )
}
