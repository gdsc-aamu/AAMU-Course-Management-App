"use client"

import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
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
            <Link href="/plans">See all {totalCount}</Link>
          </Button>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Link href="/plans/new">
          <Card className="h-full cursor-pointer border-dashed transition-all hover:border-primary hover:shadow-lg hover:shadow-primary/5">
            <CardContent className="flex h-full min-h-[120px] flex-col items-center justify-center gap-2 p-4">
              <span className="text-sm font-medium text-muted-foreground">+ Create Plan</span>
            </CardContent>
          </Card>
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
