"use client"

import Link from "next/link"
import { Star, MoreHorizontal, BookOpen } from "lucide-react"
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
  const updatedLabel = (() => {
    const d = new Date(plan.updatedAt)
    const today = new Date()
    const diffDays = Math.floor((today.getTime() - d.getTime()) / 86400000)
    if (diffDays === 0) return "Updated today"
    if (diffDays === 1) return "Updated yesterday"
    if (diffDays < 7) return `Updated ${diffDays}d ago`
    return `Updated ${d.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`
  })()

  if (viewMode === "grid") {
    return (
      <div className="group relative rounded-xl border-2 border-[#A0152A] bg-white overflow-hidden transition-all duration-200 hover:shadow-xl hover:shadow-[#A0152A]/15 hover:-translate-y-0.5">
        {/* Clickable overlay */}
        <Link href={`/plans/${plan.id}`} className="absolute inset-0 z-10">
          <span className="sr-only">Open {plan.name}</span>
        </Link>

        {/* Maroon header band */}
        <div className="bg-[#A0152A] px-4 py-3 flex items-center justify-between">
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-white/15">
            <BookOpen className="h-3.5 w-3.5 text-white" />
          </div>
          <div className="relative z-20">
            <button
              className="rounded-full p-1 transition-colors hover:bg-white/15"
              onClick={(e) => {
                e.preventDefault()
                e.stopPropagation()
                onToggleStar?.(plan.id)
              }}
            >
              <Star
                className={cn(
                  "h-4 w-4 transition-colors",
                  plan.starred ? "fill-yellow-300 text-yellow-300" : "text-white/50 hover:text-yellow-300"
                )}
              />
            </button>
          </div>
        </div>

        {/* Card body — centered */}
        <div className="px-4 pt-4 pb-3 flex flex-col items-center text-center">
          {/* Plan name */}
          <h3 className="font-bold text-[15px] text-gray-900 leading-snug line-clamp-2 group-hover:text-[#A0152A] transition-colors mb-2">
            {plan.name}
          </h3>

          {/* Semester pill */}
          <span className="inline-flex items-center rounded-full border border-[#A0152A]/30 bg-[#A0152A]/6 px-3 py-0.5 text-[11px] font-semibold text-[#A0152A] uppercase tracking-wider">
            {plan.semester}
          </span>

          {/* Meta row */}
          <div className="flex items-center gap-3 mt-3 text-[11px] text-gray-400">
            <span>{plan.courses.length} {plan.courses.length === 1 ? "course" : "courses"}</span>
            <span className="text-gray-200">|</span>
            <span>{updatedLabel}</span>
          </div>
        </div>

        {/* Footer actions */}
        <div className="border-t border-[#A0152A]/15 px-4 py-2 flex items-center justify-center relative z-20">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 gap-1.5 text-xs text-gray-400 hover:text-[#A0152A] hover:bg-[#A0152A]/6"
                onClick={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                }}
              >
                <MoreHorizontal className="h-3.5 w-3.5" />
                Options
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="center" className="w-40">
              <DropdownMenuItem onClick={() => onDownload?.(plan.id)}>
                Download PDF
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onDuplicate?.(plan.id)}>
                Make a copy
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
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

  // List view
  return (
    <div className="group relative flex items-center rounded-xl border-2 border-[#A0152A] bg-white overflow-hidden transition-all duration-200 hover:shadow-lg hover:shadow-[#A0152A]/10 hover:-translate-y-px">
      <Link href={`/plans/${plan.id}`} className="absolute inset-0 z-10">
        <span className="sr-only">Open {plan.name}</span>
      </Link>

      {/* Maroon left fill */}
      <div className="flex items-center justify-center bg-[#A0152A] w-12 self-stretch shrink-0">
        <BookOpen className="h-4 w-4 text-white" />
      </div>

      <div className="flex flex-1 items-center gap-4 px-4 py-3 min-w-0">
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-sm text-gray-900 truncate group-hover:text-[#A0152A] transition-colors">
            {plan.name}
          </h3>
          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
            <span className="inline-flex items-center rounded-full border border-[#A0152A]/30 bg-[#A0152A]/6 px-2 py-0.5 text-[10px] font-semibold text-[#A0152A] uppercase tracking-wide">
              {plan.semester}
            </span>
            <span className="text-[11px] text-gray-400">
              {plan.courses.length} {plan.courses.length === 1 ? "course" : "courses"}
            </span>
            <span className="text-[11px] text-gray-300">·</span>
            <span className="text-[11px] text-gray-400">{updatedLabel}</span>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-1 pr-3 relative z-20 shrink-0">
        <button
          className="rounded-full p-1.5 transition-colors hover:bg-gray-100"
          onClick={(e) => {
            e.preventDefault()
            e.stopPropagation()
            onToggleStar?.(plan.id)
          }}
        >
          <Star
            className={cn(
              "h-4 w-4 transition-colors",
              plan.starred ? "fill-yellow-400 text-yellow-400" : "text-gray-300 hover:text-yellow-400"
            )}
          />
        </button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-gray-400 hover:text-[#A0152A]"
              onClick={(e) => {
                e.preventDefault()
                e.stopPropagation()
              }}
            >
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-40">
            <DropdownMenuItem onClick={() => onDownload?.(plan.id)}>
              Download PDF
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onDuplicate?.(plan.id)}>
              Make a copy
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
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
