"use client"

import Link from "next/link"
import { Plus, ArrowRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { PlanCard } from "./plan-card"
import type { Plan } from "@/lib/types"

interface RecentPlansProps {
  plans: Plan[]
  totalCount: number
  onToggleStar?: (id: string) => void
  onDelete?: (id: string) => void
  onDuplicate?: (id: string) => void
}

export function RecentPlans({ 
  plans, 
  totalCount, 
  onToggleStar, 
  onDelete,
  onDuplicate 
}: RecentPlansProps) {
  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Recent Plans</h2>
        {totalCount > 3 && (
          <Button variant="ghost" size="sm" asChild>
            <Link href="/plans" className="gap-1">
              See all {totalCount}
              <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        )}
      </div>
      
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Link href="/plans/new">
          <Card className="h-full cursor-pointer border-dashed transition-all hover:border-primary hover:shadow-lg hover:shadow-primary/5">
            <CardContent className="flex h-full min-h-[120px] flex-col items-center justify-center gap-2 p-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
                <Plus className="h-6 w-6" />
              </div>
              <span className="text-sm font-medium">Create Plan</span>
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
