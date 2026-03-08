"use client"

import { Header } from "@/components/layout/header"
import { FeaturedPlans } from "@/components/dashboard/featured-plans"
import { RecentPlans } from "@/components/dashboard/recent-plans"
import { usePlans } from "@/hooks/use-plans"

export default function DashboardPage() {
  const { plans, isLoading, toggleStarred, deletePlan, duplicatePlan } = usePlans()

  // Sort by most recently updated
  const sortedPlans = [...plans].sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  )

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      
      <main className="flex-1 px-4 py-6 md:px-6 lg:px-8">
        <div className="mx-auto max-w-6xl space-y-8">
          {/* Welcome section */}
          <div className="space-y-1">
            <h1 className="text-2xl font-bold tracking-tight">Welcome back</h1>
            <p className="text-muted-foreground">
              Plan your courses and stay on track with your degree requirements.
            </p>
          </div>

          {/* Featured AI-generated plans */}
          <FeaturedPlans />

          {/* Recent plans */}
          {isLoading ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {[...Array(4)].map((_, i) => (
                <div 
                  key={i} 
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
        </div>
      </main>
    </div>
  )
}
