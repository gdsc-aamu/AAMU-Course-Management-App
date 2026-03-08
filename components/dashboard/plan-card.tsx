"use client"

import Link from "next/link"
import { Star, MoreHorizontal, Calendar } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import type { Plan } from "@/lib/types"
import { cn } from "@/lib/utils"

interface PlanCardProps {
  plan: Plan
  onToggleStar?: (id: string) => void
  onDelete?: (id: string) => void
  onDuplicate?: (id: string) => void
}

export function PlanCard({ plan, onToggleStar, onDelete, onDuplicate }: PlanCardProps) {
  return (
    <Card className="group relative overflow-hidden transition-all hover:border-primary/50 hover:shadow-lg hover:shadow-primary/5">
      <Link href={`/plans/${plan.id}`} className="absolute inset-0 z-10">
        <span className="sr-only">Open {plan.name}</span>
      </Link>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold truncate text-foreground group-hover:text-primary transition-colors">
              {plan.name}
            </h3>
            <div className="flex items-center gap-1.5 mt-1 text-sm text-muted-foreground">
              <Calendar className="h-3.5 w-3.5" />
              <span>{plan.semester}</span>
            </div>
          </div>
          
          <div className="flex items-center gap-1 relative z-20">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity"
              onClick={(e) => {
                e.preventDefault()
                e.stopPropagation()
                onToggleStar?.(plan.id)
              }}
            >
              <Star
                className={cn(
                  "h-4 w-4",
                  plan.starred ? "fill-yellow-500 text-yellow-500" : "text-muted-foreground"
                )}
              />
              <span className="sr-only">{plan.starred ? "Unstar" : "Star"}</span>
            </Button>
            
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity"
                  onClick={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                  }}
                >
                  <MoreHorizontal className="h-4 w-4" />
                  <span className="sr-only">More options</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => onDuplicate?.(plan.id)}>
                  Make a copy
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem 
                  className="text-destructive"
                  onClick={() => onDelete?.(plan.id)}
                >
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
        
        <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
          <span>{plan.courses.length} courses</span>
          <span className="text-border">•</span>
          <span>Updated {new Date(plan.updatedAt).toLocaleDateString()}</span>
        </div>
      </CardContent>
    </Card>
  )
}
