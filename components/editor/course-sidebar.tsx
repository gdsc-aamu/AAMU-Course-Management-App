"use client"

import { useState } from "react"
import { Search, ChevronDown, ChevronRight, Clock, User, BookOpen } from "lucide-react"
import { Draggable, Droppable } from "@hello-pangea/dnd"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Badge } from "@/components/ui/badge"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import type { Course } from "@/lib/types"
import { cn } from "@/lib/utils"

interface CourseSidebarProps {
  courses: Course[]
  addedCourseIds: string[]
}

function formatTime(time: string) {
  const [hours, minutes] = time.split(":")
  const hour = parseInt(hours)
  const ampm = hour >= 12 ? "PM" : "AM"
  const hour12 = hour % 12 || 12
  return `${hour12}:${minutes} ${ampm}`
}

export function CourseSidebar({ courses, addedCourseIds }: CourseSidebarProps) {
  const [searchQuery, setSearchQuery] = useState("")
  const [expandedCourses, setExpandedCourses] = useState<Set<string>>(new Set())

  const filteredCourses = courses.filter(
    (course) =>
      course.code.toLowerCase().includes(searchQuery.toLowerCase()) ||
      course.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      course.instructor.toLowerCase().includes(searchQuery.toLowerCase())
  )

  const toggleExpanded = (courseId: string) => {
    setExpandedCourses((prev) => {
      const next = new Set(prev)
      if (next.has(courseId)) {
        next.delete(courseId)
      } else {
        next.add(courseId)
      }
      return next
    })
  }

  return (
    <div className="flex h-full flex-col border-r bg-card">
      <div className="border-b p-3">
        <h2 className="font-semibold mb-3">Courses</h2>
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search courses..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>
      
      <ScrollArea className="flex-1">
        <Droppable droppableId="course-list" isDropDisabled={true}>
          {(provided) => (
            <div
              ref={provided.innerRef}
              {...provided.droppableProps}
              className="p-2 space-y-1"
            >
              {filteredCourses.map((course, index) => {
                const isAdded = addedCourseIds.includes(course.id)
                const isExpanded = expandedCourses.has(course.id)
                
                return (
                  <Draggable
                    key={course.id}
                    draggableId={course.id}
                    index={index}
                    isDragDisabled={isAdded}
                  >
                    {(provided, snapshot) => (
                      <div
                        ref={provided.innerRef}
                        {...provided.draggableProps}
                        {...provided.dragHandleProps}
                        className={cn(
                          "rounded-lg border transition-all",
                          snapshot.isDragging
                            ? "shadow-lg bg-card border-primary"
                            : "bg-background hover:bg-muted/50",
                          isAdded && "opacity-50 cursor-not-allowed"
                        )}
                      >
                        <Collapsible open={isExpanded} onOpenChange={() => toggleExpanded(course.id)}>
                          <CollapsibleTrigger asChild>
                            <button className="w-full p-3 text-left">
                              <div className="flex items-start gap-2">
                                <div
                                  className={cn(
                                    "mt-0.5 h-2 w-2 rounded-full shrink-0",
                                    course.color.replace("/80", "")
                                  )}
                                />
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2">
                                    <span className="font-medium">{course.code}</span>
                                    {isAdded && (
                                      <Badge variant="secondary" className="text-xs">Added</Badge>
                                    )}
                                  </div>
                                  <p className="text-sm text-muted-foreground truncate">
                                    {course.name}
                                  </p>
                                </div>
                                {isExpanded ? (
                                  <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                                ) : (
                                  <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                                )}
                              </div>
                            </button>
                          </CollapsibleTrigger>
                          
                          <CollapsibleContent>
                            <div className="px-3 pb-3 pt-0 space-y-2 text-sm">
                              <div className="flex items-center gap-2 text-muted-foreground">
                                <User className="h-3.5 w-3.5" />
                                <span>{course.instructor}</span>
                              </div>
                              <div className="flex items-center gap-2 text-muted-foreground">
                                <BookOpen className="h-3.5 w-3.5" />
                                <span>{course.credits} credits</span>
                              </div>
                              <div className="flex items-start gap-2 text-muted-foreground">
                                <Clock className="h-3.5 w-3.5 mt-0.5" />
                                <div className="space-y-0.5">
                                  {course.times.map((time, i) => (
                                    <div key={i}>
                                      {time.day} {formatTime(time.startTime)} - {formatTime(time.endTime)}
                                    </div>
                                  ))}
                                </div>
                              </div>
                              {course.description && (
                                <p className="text-muted-foreground pt-1 border-t">
                                  {course.description}
                                </p>
                              )}
                            </div>
                          </CollapsibleContent>
                        </Collapsible>
                      </div>
                    )}
                  </Draggable>
                )
              })}
              {provided.placeholder}
            </div>
          )}
        </Droppable>
      </ScrollArea>
    </div>
  )
}
