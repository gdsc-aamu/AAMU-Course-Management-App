"use client"

import { useState, useMemo } from "react"
import Link from "next/link"
import { LayoutGrid, List } from "lucide-react"
import { Sidebar } from "@/components/layout/sidebar"
import { PlanFilters } from "@/components/plans/plan-filters"
import { PlanListItem } from "@/components/plans/plan-list-item"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { usePlans } from "@/hooks/use-plans"
import { cn } from "@/lib/utils"

type SortOption = "recent" | "title" | "created"
type ViewMode = "grid" | "list"

const SORT_LABELS: Record<SortOption, string> = {
  recent: "Most Recent",
  title: "Title",
  created: "Date Created",
}

export default function PlansPage() {
  const { plans, isLoading, toggleStarred, deletePlan, duplicatePlan, getPlan } = usePlans()
  const [viewMode, setViewMode] = useState<ViewMode>("grid")
  const [sortBy, setSortBy] = useState<SortOption>("recent")
  const [activeFilters, setActiveFilters] = useState<string[]>([])

  const filteredAndSortedPlans = useMemo(() => {
    let filtered = [...plans]

    if (activeFilters.includes("starred")) {
      filtered = filtered.filter((p) => p.starred)
    }
    if (activeFilters.includes("2025")) {
      filtered = filtered.filter((p) => p.semester.includes("2025"))
    }
    if (activeFilters.includes("2026")) {
      filtered = filtered.filter((p) => p.semester.includes("2026"))
    }

    switch (sortBy) {
      case "recent":
        filtered.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
        break
      case "title":
        filtered.sort((a, b) => a.name.localeCompare(b.name))
        break
      case "created":
        filtered.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        break
    }

    return filtered
  }, [plans, activeFilters, sortBy])

  const handleDownload = (id: string) => {
    const plan = getPlan(id)
    if (!plan) return

    const data = JSON.stringify(plan, null, 2)
    const blob = new Blob([data], { type: "application/json" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `${plan.name.toLowerCase().replaceAll(" ", "-")}.json`
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  }

  const skeletonKeys = new Array(6).fill(null).map((_, i) => i)

  const emptyMessage =
    activeFilters.length > 0
      ? "Try adjusting your filters"
      : "Create your first course plan to get started"

  return (
    <div className="flex min-h-screen">
      <Sidebar />

      <main className="flex-1 px-4 py-6 md:px-6 lg:px-8">
        <div className="mx-auto max-w-6xl">
          <div className="flex flex-col lg:flex-row gap-6">
            <PlanFilters
              activeFilters={activeFilters}
              onFilterChange={setActiveFilters}
            />

            <div className="flex-1 space-y-4">
              {/* Toolbar */}
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-2">
                  <div className="flex items-center rounded-lg border bg-muted/50 p-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className={cn(
                        "h-8 w-8 rounded-md",
                        viewMode === "grid" && "bg-background shadow-sm"
                      )}
                      onClick={() => setViewMode("grid")}
                    >
                      <LayoutGrid className="h-4 w-4" />
                      <span className="sr-only">Grid view</span>
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className={cn(
                        "h-8 w-8 rounded-md",
                        viewMode === "list" && "bg-background shadow-sm"
                      )}
                      onClick={() => setViewMode("list")}
                    >
                      <List className="h-4 w-4" />
                      <span className="sr-only">List view</span>
                    </Button>
                  </div>

                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" size="sm">
                        {SORT_LABELS[sortBy]}
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start">
                      <DropdownMenuItem onClick={() => setSortBy("recent")}>
                        Most Recent
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => setSortBy("title")}>
                        Title
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => setSortBy("created")}>
                        Date Created
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>

                <Button asChild>
                  <Link href="/plans/new">Create new</Link>
                </Button>
              </div>

              {/* Plans grid/list */}
              {isLoading ? (
                <div className={cn(
                  viewMode === "grid"
                    ? "grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
                    : "space-y-2"
                )}>
                  {skeletonKeys.map((key) => (
                    <div
                      key={key}
                      className={cn(
                        "rounded-lg border bg-muted/50 animate-pulse",
                        viewMode === "grid" ? "h-40" : "h-16"
                      )}
                    />
                  ))}
                </div>
              ) : filteredAndSortedPlans.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <h3 className="text-lg font-semibold">No plans found</h3>
                  <p className="mt-1 text-sm text-muted-foreground">{emptyMessage}</p>
                  <Button asChild className="mt-4">
                    <Link href="/plans/new">Create plan</Link>
                  </Button>
                </div>
              ) : (
                <div className={cn(
                  viewMode === "grid"
                    ? "grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
                    : "space-y-2"
                )}>
                  {filteredAndSortedPlans.map((plan) => (
                    <PlanListItem
                      key={plan.id}
                      plan={plan}
                      viewMode={viewMode}
                      onToggleStar={toggleStarred}
                      onDelete={deletePlan}
                      onDuplicate={duplicatePlan}
                      onDownload={handleDownload}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}
