"use client"

import { Star, Calendar, GraduationCap } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

interface FilterOption {
  id: string
  label: string
  icon?: React.ReactNode
}

const filters: { category: string; options: FilterOption[] }[] = [
  {
    category: "Quick Filters",
    options: [
      { id: "starred", label: "Starred", icon: <Star className="h-3.5 w-3.5" /> },
    ],
  },
  {
    category: "Year",
    options: [
      { id: "2025", label: "2025", icon: <Calendar className="h-3.5 w-3.5" /> },
      { id: "2026", label: "2026", icon: <Calendar className="h-3.5 w-3.5" /> },
    ],
  },
  {
    category: "Academic Level",
    options: [
      { id: "freshman", label: "Freshman", icon: <GraduationCap className="h-3.5 w-3.5" /> },
      { id: "sophomore", label: "Sophomore", icon: <GraduationCap className="h-3.5 w-3.5" /> },
      { id: "junior", label: "Junior", icon: <GraduationCap className="h-3.5 w-3.5" /> },
      { id: "senior", label: "Senior", icon: <GraduationCap className="h-3.5 w-3.5" /> },
    ],
  },
]

interface PlanFiltersProps {
  activeFilters: string[]
  onFilterChange: (filters: string[]) => void
}

export function PlanFilters({ activeFilters, onFilterChange }: PlanFiltersProps) {
  const toggleFilter = (filterId: string) => {
    if (activeFilters.includes(filterId)) {
      onFilterChange(activeFilters.filter((f) => f !== filterId))
    } else {
      onFilterChange([...activeFilters, filterId])
    }
  }

  return (
    <aside className="w-full lg:w-56 shrink-0 space-y-6">
      {filters.map((group) => (
        <div key={group.category} className="space-y-2">
          <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            {group.category}
          </h3>
          <div className="flex flex-wrap gap-2 lg:flex-col lg:gap-1">
            {group.options.map((option) => (
              <Button
                key={option.id}
                variant={activeFilters.includes(option.id) ? "secondary" : "ghost"}
                size="sm"
                className={cn(
                  "justify-start gap-2 h-8",
                  activeFilters.includes(option.id) && "bg-secondary"
                )}
                onClick={() => toggleFilter(option.id)}
              >
                {option.icon}
                {option.label}
              </Button>
            ))}
          </div>
        </div>
      ))}
      
      {activeFilters.length > 0 && (
        <Button
          variant="ghost"
          size="sm"
          className="text-muted-foreground"
          onClick={() => onFilterChange([])}
        >
          Clear all filters
        </Button>
      )}
    </aside>
  )
}
