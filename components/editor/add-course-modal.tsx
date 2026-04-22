"use client"

import { useState, useEffect, useRef } from "react"
import { Search, Plus, Check, X } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { createClient } from "@/lib/supabase/client"
import { cn } from "@/lib/utils"

const supabase = createClient()

interface CourseResult {
  course_id: string
  title: string
  credit_hours: number
}

interface AddCourseModalProps {
  open: boolean
  onClose: () => void
  onAdd: (courseId: string) => Promise<void>
  existingCourses: string[]
}

export function AddCourseModal({ open, onClose, onAdd, existingCourses }: AddCourseModalProps) {
  const [query, setQuery] = useState("")
  const [results, setResults] = useState<CourseResult[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [addingId, setAddingId] = useState<string | null>(null)
  const [addedIds, setAddedIds] = useState<Set<string>>(new Set())
  const inputRef = useRef<HTMLInputElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Focus input when modal opens
  useEffect(() => {
    if (open) {
      setQuery("")
      setResults([])
      setAddedIds(new Set())
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [open])

  // Debounced search
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)

    if (!query.trim()) {
      setResults([])
      setIsSearching(false)
      return
    }

    setIsSearching(true)
    debounceRef.current = setTimeout(async () => {
      const { data } = await supabase
        .from("courses")
        .select("course_id, title, credit_hours")
        .or(`course_id.ilike.%${query.trim()}%,title.ilike.%${query.trim()}%`)
        .order("course_id")
        .limit(12)

      setResults(data ?? [])
      setIsSearching(false)
    }, 300)

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [query])

  const handleAdd = async (courseId: string) => {
    if (addingId) return
    setAddingId(courseId)
    try {
      await onAdd(courseId)
      setAddedIds((prev) => new Set(prev).add(courseId))
    } finally {
      setAddingId(null)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") onClose()
  }

  if (!open) return null

  return (
    // Backdrop — blurred, dark-tinted
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: "rgba(10, 10, 10, 0.55)", backdropFilter: "blur(6px)" }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
      onKeyDown={handleKeyDown}
    >
      {/* Modal panel — glass card */}
      <div
        className="relative w-full max-w-md rounded-2xl border border-white/10 shadow-2xl"
        style={{
          background: "rgba(255, 255, 255, 0.07)",
          backdropFilter: "blur(20px)",
          WebkitBackdropFilter: "blur(20px)",
        }}
      >
        {/* Inner white surface for readability */}
        <div className="rounded-2xl bg-white/90 backdrop-blur-sm overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-5 pt-5 pb-3">
            <div>
              <h2 className="text-base font-semibold text-gray-900">Add Course to Plan</h2>
              <p className="text-xs text-gray-500 mt-0.5">Search by course code or name</p>
            </div>
            <button
              onClick={onClose}
              className="rounded-full p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Search input */}
          <div className="px-5 pb-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
              <Input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="e.g. CS 301 or Algorithms..."
                className="pl-9 border-gray-200 bg-gray-50 focus:bg-white focus:border-[#A0152A] focus:ring-[#A0152A]/20"
              />
            </div>
          </div>

          {/* Results */}
          <div className="min-h-[200px] max-h-[320px] overflow-y-auto px-3 pb-4">
            {isSearching ? (
              <div className="flex items-center justify-center py-12 text-sm text-gray-400">
                Searching...
              </div>
            ) : query.trim() && results.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-sm text-gray-400">
                <p>No courses found for &ldquo;{query}&rdquo;</p>
                <p className="text-xs mt-1">Try a different code or keyword</p>
              </div>
            ) : !query.trim() ? (
              <div className="flex items-center justify-center py-12 text-sm text-gray-400">
                Start typing to search courses
              </div>
            ) : (
              <ul className="space-y-1">
                {results.map((course) => {
                  const alreadyInPlan = existingCourses.includes(course.course_id)
                  const justAdded = addedIds.has(course.course_id)
                  const isAdding = addingId === course.course_id

                  return (
                    <li
                      key={course.course_id}
                      className={cn(
                        "flex items-center justify-between gap-3 rounded-xl px-3 py-2.5 transition-colors",
                        alreadyInPlan || justAdded ? "bg-gray-50" : "hover:bg-gray-50"
                      )}
                    >
                      <div className="min-w-0 flex-1">
                        <p className={cn(
                          "text-sm font-semibold",
                          alreadyInPlan || justAdded ? "text-gray-400" : "text-[#A0152A]"
                        )}>
                          {course.course_id}
                        </p>
                        <p className="text-xs text-gray-500 truncate">{course.title}</p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-xs text-gray-400 tabular-nums">
                          {course.credit_hours} cr
                        </span>
                        {alreadyInPlan ? (
                          <span className="text-xs text-gray-400 px-2">In plan</span>
                        ) : justAdded ? (
                          <span className="flex items-center gap-1 text-xs text-green-600 px-2">
                            <Check className="h-3.5 w-3.5" /> Added
                          </span>
                        ) : (
                          <Button
                            size="sm"
                            className="h-7 px-3 text-xs bg-[#A0152A] hover:bg-[#6B0000] text-white"
                            onClick={() => handleAdd(course.course_id)}
                            disabled={!!addingId}
                          >
                            {isAdding ? (
                              <span className="inline-flex gap-0.5">
                                <span className="animate-bounce" style={{ animationDelay: "0ms" }}>.</span>
                                <span className="animate-bounce" style={{ animationDelay: "100ms" }}>.</span>
                                <span className="animate-bounce" style={{ animationDelay: "200ms" }}>.</span>
                              </span>
                            ) : (
                              <><Plus className="h-3 w-3 mr-1" />Add</>
                            )}
                          </Button>
                        )}
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
