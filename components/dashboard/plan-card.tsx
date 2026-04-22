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

interface PlanCardProps {
  plan: Plan
  onToggleStar?: (id: string) => void
  onDelete?: (id: string) => void
  onDuplicate?: (id: string) => void
}

export function PlanCard({ plan, onToggleStar, onDelete, onDuplicate }: Readonly<PlanCardProps>) {
  const updatedLabel = (() => {
    const d = new Date(plan.updatedAt)
    const today = new Date()
    const diffDays = Math.floor((today.getTime() - d.getTime()) / 86400000)
    if (diffDays === 0) return "Updated today"
    if (diffDays === 1) return "Updated yesterday"
    return `Updated ${d.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`
  })()

  return (
    <div className="group relative rounded-xl border-2 border-[#A0152A] bg-white overflow-hidden transition-all duration-200 hover:shadow-xl hover:shadow-[#A0152A]/15 hover:-translate-y-0.5">
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

      {/* Centered body */}
      <div className="px-4 pt-4 pb-3 flex flex-col items-center text-center">
        <h3 className="font-bold text-[15px] text-gray-900 leading-snug line-clamp-2 group-hover:text-[#A0152A] transition-colors mb-2">
          {plan.name}
        </h3>
        <span className="inline-flex items-center rounded-full border border-[#A0152A]/30 bg-[#A0152A]/6 px-3 py-0.5 text-[11px] font-semibold text-[#A0152A] uppercase tracking-wider">
          {plan.semester}
        </span>
        <div className="flex items-center gap-3 mt-3 text-[11px] text-gray-400">
          <span>{plan.courses.length} {plan.courses.length === 1 ? "course" : "courses"}</span>
          <span className="text-gray-200">|</span>
          <span>{updatedLabel}</span>
        </div>
      </div>

      {/* Footer */}
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
