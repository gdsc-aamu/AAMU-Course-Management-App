"use client"

import Link from "next/link"
import { Star, MoreHorizontal } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import type { Plan } from "@/lib/types"
import { cn } from "@/lib/utils"

interface PlanListItemProps {
  readonly plan: Plan
  readonly viewMode: "grid" | "list"
  readonly onToggleStar?: (id: string) => void
  readonly onDelete?: (id: string) => void
  readonly onDuplicate?: (id: string) => void
  readonly onDownload?: (id: string) => void
}

export function PlanListItem({
  plan,
  viewMode,
  onToggleStar,
  onDelete,
  onDuplicate,
  onDownload,
}: Readonly<PlanListItemProps>) {
  if (viewMode === "grid") {
    return (
      <div className="group relative rounded-lg border bg-card p-4 transition-all hover:border-primary/50 hover:shadow-lg hover:shadow-primary/5">
        <Link href={`/plans/${plan.id}`} className="absolute inset-0 z-10">
          <span className="sr-only">Open {plan.name}</span>
        </Link>

        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-1 relative z-20 ml-auto">
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
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => onDownload?.(plan.id)}>
                  Download
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onDuplicate?.(plan.id)}>
                  Make a copy
                </DropdownMenuItem>
                <DropdownMenuItem>Share</DropdownMenuItem>
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

        <div className="mt-2">
          <h3 className="font-semibold truncate group-hover:text-primary transition-colors">
            {plan.name}
          </h3>
          <p className="text-sm text-muted-foreground mt-1">{plan.semester}</p>
        </div>

        <div className="mt-3 flex items-center gap-3 text-xs text-muted-foreground">
          <span>{plan.courses.length} courses</span>
          <span>Updated {new Date(plan.updatedAt).toLocaleDateString()}</span>
        </div>
      </div>
    )
  }

  // List view
  return (
    <div className="group relative flex items-center gap-4 rounded-lg border bg-card p-3 transition-all hover:border-primary/50 hover:shadow-lg hover:shadow-primary/5">
      <Link href={`/plans/${plan.id}`} className="absolute inset-0 z-10">
        <span className="sr-only">Open {plan.name}</span>
      </Link>

      <div className="flex-1 min-w-0">
        <h3 className="font-semibold truncate group-hover:text-primary transition-colors">
          {plan.name}
        </h3>
        <div className="flex items-center gap-3 text-sm text-muted-foreground mt-0.5">
          <span>{plan.semester}</span>
          <span>{plan.courses.length} courses</span>
        </div>
      </div>

      <div className="flex items-center gap-1 relative z-20">
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
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
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={(e) => {
                e.preventDefault()
                e.stopPropagation()
              }}
            >
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => onDownload?.(plan.id)}>
              Download
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onDuplicate?.(plan.id)}>
              Make a copy
            </DropdownMenuItem>
            <DropdownMenuItem>Share</DropdownMenuItem>
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
  )
}
