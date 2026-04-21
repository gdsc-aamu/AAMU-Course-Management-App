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
      <div className="group relative rounded-lg border border-gray-200 bg-white p-3 transition-all hover:border-[#8B4545]/40 hover:shadow-lg hover:shadow-[#8B4545]/15">
        <Link href={`/plans/${plan.id}`} className="absolute inset-0 z-10">
          <span className="sr-only">Open {plan.name}</span>
        </Link>

        {/* Title at Top - Centered */}
        <div className="text-center mb-3">
          <h3 className="font-bold text-base truncate group-hover:text-[#8B4545] transition-colors text-gray-900">
            {plan.name}
          </h3>
        </div>

        {/* Metadata Section */}
        <div className="space-y-2">
          <p className="text-xs text-gray-600 text-center">{plan.semester}</p>

          {/* Bottom info and actions */}
          <div className="flex flex-col gap-2 pt-2 border-t border-gray-200">
            <div className="flex items-center justify-between text-xs text-gray-500">
              <span>{plan.courses.length} courses</span>
              <span>Updated {new Date(plan.updatedAt).toLocaleDateString()}</span>
            </div>

            {/* Action buttons */}
            <div className="flex items-center justify-center gap-1 relative z-20">
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  onToggleStar?.(plan.id)
                }}
              >
                <Star
                  className={cn(
                    "h-4 w-4",
                    plan.starred ? "fill-yellow-500 text-yellow-500" : "text-gray-400 hover:text-yellow-500"
                  )}
                />
              </Button>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
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
