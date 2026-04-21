"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { X, Filter } from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"

interface FilterOption {
  id: string
  label: string
}

const filters: { category: string; options: FilterOption[] }[] = [
  {
    category: "Quick Filters",
    options: [
      { id: "starred", label: "Starred" },
    ],
  },
  {
    category: "Year",
    options: [
      { id: "2025", label: "2025" },
      { id: "2026", label: "2026" },
    ],
  },
  {
    category: "Academic Level",
    options: [
      { id: "freshman", label: "Freshman" },
      { id: "sophomore", label: "Sophomore" },
      { id: "junior", label: "Junior" },
      { id: "senior", label: "Senior" },
    ],
  },
]

interface PlanFiltersProps {
  readonly activeFilters: string[]
  readonly onFilterChange: (filters: string[]) => void
}

export function PlanFilters({ activeFilters, onFilterChange }: Readonly<PlanFiltersProps>) {
  const [isOpen, setIsOpen] = useState(false)

  const toggleFilter = (filterId: string) => {
    if (activeFilters.includes(filterId)) {
      onFilterChange(activeFilters.filter((f) => f !== filterId))
    } else {
      onFilterChange([...activeFilters, filterId])
    }
  }

  const removeFilter = (filterId: string) => {
    onFilterChange(activeFilters.filter((f) => f !== filterId))
  }

  const getFilterLabel = (filterId: string): string => {
    for (const group of filters) {
      const option = group.options.find((opt) => opt.id === filterId)
      if (option) return option.label
    }
    return filterId
  }

  return (
    <div className="space-y-3">
      {/* Filter Button + Active Filters Display */}
      <div className="flex flex-wrap items-center gap-2">
        <DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="flex items-center gap-2">
              <Filter className="h-4 w-4" />
              Filters
              {activeFilters.length > 0 && (
                <span className="ml-1 inline-flex items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-semibold h-5 w-5">
                  {activeFilters.length}
                </span>
              )}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-56">
            {filters.map((group) => (
              <div key={group.category}>
                <DropdownMenuLabel className="text-xs font-medium text-muted-foreground uppercase">
                  {group.category}
                </DropdownMenuLabel>
                {group.options.map((option) => (
                  <DropdownMenuItem
                    key={option.id}
                    onClick={() => toggleFilter(option.id)}
                    className={cn(
                      "cursor-pointer",
                      activeFilters.includes(option.id) && "bg-accent"
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={activeFilters.includes(option.id)}
                      onChange={() => {}}
                      className="mr-2"
                      aria-label={option.label}
                    />
                    {option.label}
                  </DropdownMenuItem>
                ))}
                <DropdownMenuSeparator />
              </div>
            ))}
            {activeFilters.length > 0 && (
              <DropdownMenuItem
                onClick={() => onFilterChange([])}
                className="text-muted-foreground"
              >
                Clear all filters
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Active Filter Pills */}
        {activeFilters.map((filterId) => (
          <div
            key={filterId}
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full bg-secondary text-secondary-foreground text-sm"
          >
            <span>{getFilterLabel(filterId)}</span>
            <button
              onClick={() => removeFilter(filterId)}
              className="ml-1 hover:opacity-70 transition-opacity"
              aria-label={`Remove ${getFilterLabel(filterId)} filter`}
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
