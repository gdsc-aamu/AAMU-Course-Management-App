"use client"

import { Sidebar } from "@/components/layout/sidebar"
import { RecentPlans } from "@/components/dashboard/recent-plans"
import { usePlans } from "@/hooks/use-plans"

const stats = [
  { label: "Credits Earned", value: "78 / 120" },
  { label: "Current GPA", value: "3.62" },
  { label: "Next Semester", value: "Fall 2026" },
  { label: "Degree Progress", value: "65%" },
]

export default function DashboardPage() {
  const { plans, isLoading, toggleStarred, deletePlan, duplicatePlan } = usePlans()

  const sortedPlans = [...plans].sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  )

  return (
    <div className="flex min-h-screen">
      <Sidebar />

      <div className="flex-1 flex flex-col min-w-0 bg-muted/40">
        {/* User info bar */}
        <div className="flex items-center justify-end gap-3 px-8 py-4 border-b bg-background">
          <div className="text-right">
            <p className="text-sm font-semibold">John Bulldog</p>
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Junior · CS Major</p>
          </div>
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-primary-foreground text-sm font-semibold shrink-0">
            JD
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
