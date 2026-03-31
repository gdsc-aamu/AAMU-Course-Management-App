"use client"

import { useMemo, Fragment } from "react"
import { Droppable } from "@hello-pangea/dnd"
import { X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import type { Course, DayOfWeek } from "@/lib/types"
import { TIME_SLOTS, DAYS } from "@/lib/data"
import { cn } from "@/lib/utils"

interface TimetableProps {
  courses: Course[]
  onRemoveCourse: (courseId: string) => void
}

interface TimeSlotPosition {
  course: Course
  day: DayOfWeek
  startRow: number
  rowSpan: number
  hasConflict: boolean
}

function timeToRow(time: string): number {
  const [hours] = time.split(":").map(Number)
  return hours - 8 // 8am is row 0
}

function getRowSpan(startTime: string, endTime: string): number {
  const startHour = parseInt(startTime.split(":")[0])
  const endHour = parseInt(endTime.split(":")[0])
  const endMinutes = parseInt(endTime.split(":")[1])
  return endHour - startHour + (endMinutes > 0 ? 0.5 : 0)
}

export function Timetable({ courses, onRemoveCourse }: TimetableProps) {
  // Calculate course positions and detect conflicts
  const { positions, conflicts } = useMemo(() => {
    const positions: TimeSlotPosition[] = []
    const conflictSet = new Set<string>()

    // Create all positions
    courses.forEach((course) => {
      course.times.forEach((time) => {
        positions.push({
          course,
          day: time.day,
          startRow: timeToRow(time.startTime),
          rowSpan: getRowSpan(time.startTime, time.endTime),
          hasConflict: false,
        })
      })
    })

    // Detect conflicts
    for (let i = 0; i < positions.length; i++) {
      for (let j = i + 1; j < positions.length; j++) {
        const a = positions[i]
        const b = positions[j]
        
        if (a.day === b.day) {
          const aEnd = a.startRow + a.rowSpan
          const bEnd = b.startRow + b.rowSpan
          
          // Check overlap
          if (!(aEnd <= b.startRow || bEnd <= a.startRow)) {
            a.hasConflict = true
            b.hasConflict = true
            conflictSet.add(a.course.id)
            conflictSet.add(b.course.id)
          }
        }
      }
    }

    return { positions, conflicts: conflictSet }
  }, [courses])

  const formatTimeLabel = (time: string) => {
    const hour = parseInt(time.split(":")[0])
    const ampm = hour >= 12 ? "PM" : "AM"
    const hour12 = hour % 12 || 12
    return `${hour12} ${ampm}`
  }

  return (
    <div className="flex h-full flex-col rounded-lg border bg-card">
      <div className="flex items-center justify-between border-b p-3">
        <h3 className="font-semibold">Weekly Timetable</h3>
        {conflicts.size > 0 && (
          <span className="text-sm text-amber-500">
            {conflicts.size} conflict{conflicts.size > 1 ? "s" : ""}
          </span>
        )}
      </div>
      
      <ScrollArea className="flex-1">
        <div className="min-w-[600px] p-3">
          <div className="grid grid-cols-[60px_repeat(5,1fr)] gap-px bg-border rounded-lg overflow-hidden">
            {/* Header row */}
            <div className="bg-muted/50 p-2" />
            {DAYS.map((day) => (
              <div key={day} className="bg-muted/50 p-2 text-center font-medium text-sm">
                {day}
              </div>
            ))}
            
            {/* Time slots */}
            {TIME_SLOTS.map((time, rowIndex) => (
              <Fragment key={time}>
                {/* Time label */}
                <div
                  className="bg-background p-2 text-xs text-muted-foreground text-right pr-3"
                >
                  {formatTimeLabel(time)}
                </div>
                
                {/* Day columns */}
                {DAYS.map((day) => (
                  <Droppable
                    key={`${day}-${time}`}
                    droppableId={`timetable-${day}-${time}`}
                  >
                    {(provided, snapshot) => (
                      <div
                        ref={provided.innerRef}
                        {...provided.droppableProps}
                        className={cn(
                          "relative bg-background min-h-[48px] transition-colors",
                          snapshot.isDraggingOver && "bg-primary/10"
                        )}
                      >
                        {/* Render course blocks */}
                        {positions
                          .filter((pos) => pos.day === day && pos.startRow === rowIndex)
                          .map((pos) => (
                            <TooltipProvider key={`${pos.course.id}-${pos.day}`}>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <div
                                    className={cn(
                                      "absolute inset-x-1 rounded-md p-2 text-white text-xs font-medium cursor-pointer transition-all hover:brightness-110",
                                      pos.course.color,
                                      pos.hasConflict && "ring-2 ring-amber-500 ring-offset-1 ring-offset-background"
                                    )}
                                    style={{
                                      top: "2px",
                                      height: `calc(${pos.rowSpan * 100}% - 4px + ${(pos.rowSpan - 1) * 48}px)`,
                                      zIndex: 10,
                                    }}
                                  >
                                    <div className="flex items-start justify-between gap-1">
                                      <div className="min-w-0">
                                        <div className="font-semibold truncate">{pos.course.code}</div>
                                        <div className="text-white/80 truncate">{pos.course.name}</div>
                                      </div>
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-5 w-5 shrink-0 text-white/80 hover:text-white hover:bg-white/20"
                                        onClick={(e) => {
                                          e.stopPropagation()
                                          onRemoveCourse(pos.course.id)
                                        }}
                                      >
                                        <X className="h-3 w-3" />
                                      </Button>
                                    </div>
                                    {pos.hasConflict && (
                                      <div className="absolute bottom-1 right-1 text-amber-300 text-xs font-bold leading-none">!</div>
                                    )}
                                  </div>
                                </TooltipTrigger>
                                <TooltipContent>
                                  <p className="font-medium">{pos.course.code}: {pos.course.name}</p>
                                  <p className="text-xs text-muted-foreground">{pos.course.instructor}</p>
                                  {pos.hasConflict && (
                                    <p className="text-xs text-amber-500 mt-1">Schedule conflict detected</p>
                                  )}
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          ))}
                        {provided.placeholder}
                      </div>
                    )}
                  </Droppable>
                ))}
              </Fragment>
            ))}
          </div>
        </div>
        <ScrollBar orientation="horizontal" />
      </ScrollArea>
    </div>
  )
}
