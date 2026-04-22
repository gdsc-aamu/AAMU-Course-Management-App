"use client"

import Link from "next/link"
import { Button } from "@/components/ui/button"
import { PlanCard } from "./plan-card"
import type { Plan } from "@/lib/types"

interface RecentPlansProps {
  readonly plans: Plan[]
  readonly totalCount: number
  readonly onToggleStar?: (id: string) => void
  readonly onDelete?: (id: string) => void
  readonly onDuplicate?: (id: string) => void
}

export function RecentPlans({
  plans,
  totalCount,
  onToggleStar,
  onDelete,
  onDuplicate,
}: RecentPlansProps) {
  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Recent Plans</h2>
        {totalCount > 3 && (
          <Button variant="ghost" size="sm" asChild>
            <Link href="/plans">View all</Link>
          </Button>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Link href="/plans/new" className="block rounded-xl border-2 border-dashed border-[#8B0000]/40 bg-white transition-all duration-200 hover:border-[#8B0000] hover:shadow-lg hover:shadow-[#8B0000]/10 hover:-translate-y-0.5 min-h-[160px] flex items-center justify-center">
          <div className="flex flex-col items-center gap-2 text-center py-6">
            <div className="flex h-9 w-9 items-center justify-center rounded-full border-2 border-dashed border-[#8B0000]/40 text-[#8B0000] text-lg font-light">
              +
            </div>
            <span className="text-sm font-semibold text-[#8B0000]/70">Create Plan</span>
          </div>
        </Link>

        {plans.slice(0, 3).map((plan) => (
          <PlanCard
            key={plan.id}
            plan={plan}
            onToggleStar={onToggleStar}
            onDelete={onDelete}
            onDuplicate={onDuplicate}
          />
        ))}
      </div>
    </section>
  )
}