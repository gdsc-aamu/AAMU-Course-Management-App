"use client"

import { useState, useEffect, use } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { DragDropContext, type DropResult } from "@hello-pangea/dnd"
import { ArrowLeft, PanelLeftClose, PanelLeft } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable"
import { CourseSidebar } from "@/components/editor/course-sidebar"
import { AISuggestions } from "@/components/editor/ai-suggestions"
import { Timetable } from "@/components/editor/timetable"
import { usePlans } from "@/hooks/use-plans"
import { mockCourses } from "@/lib/data"
import type { Plan } from "@/lib/types"
import { cn } from "@/lib/utils"

const SEMESTERS = [
  "Fall 2025",
  "Spring 2026",
  "Fall 2026",
  "Spring 2027",
]

export default function PlanEditorPage({ params }: Readonly<{ params: Promise<{ id: string }> }>) {
  const resolvedParams = use(params)
  const router = useRouter()
  const { plans, createPlan, updatePlan, getPlan, addCourseToPlan, removeCourseFromPlan } = usePlans()
  
  const [plan, setPlan] = useState<Plan | null>(null)
  const [planName, setPlanName] = useState("")
  const [semester, setSemester] = useState(SEMESTERS[0])
  const [isSaving, setIsSaving] = useState(false)
  const [showSaved, setShowSaved] = useState(false)
  const [showSidebar, setShowSidebar] = useState(true)
  const [isLoading, setIsLoading] = useState(true)
  const [isMounted, setIsMounted] = useState(false)

  const isNewPlan = resolvedParams.id === "new"
  const [hasCreatedPlan, setHasCreatedPlan] = useState(false)

  // Handle SSR - @hello-pangea/dnd requires client-side rendering
  useEffect(() => {
    setIsMounted(true)
  }, [])

  // Load plan data
  useEffect(() => {
    if (isNewPlan && !hasCreatedPlan) {
      const newPlan = createPlan("Untitled Plan", SEMESTERS[0])
      setPlan(newPlan)
      setPlanName(newPlan.name)
      setSemester(newPlan.semester)
      setHasCreatedPlan(true)
      setIsLoading(false)
      // Navigate to the new plan's URL to avoid re-creating on refresh
      router.replace(`/plans/${newPlan.id}`)
    } else if (!isNewPlan) {
      const existingPlan = getPlan(resolvedParams.id)
      if (existingPlan) {
        setPlan(existingPlan)
        setPlanName(existingPlan.name)
        setSemester(existingPlan.semester)
      }
      setIsLoading(false)
    }
  }, [isNewPlan, resolvedParams.id, plans.length, hasCreatedPlan, createPlan, getPlan, router])

  // Get courses that are in this plan
  const planCourses = plan
    ? mockCourses.filter((course) => plan.courses.includes(course.id))
    : []

  const handleSave = () => {
    if (!plan) return
    
    setIsSaving(true)
    updatePlan(plan.id, { name: planName, semester })
    
    setTimeout(() => {
      setIsSaving(false)
      setShowSaved(true)
      setTimeout(() => setShowSaved(false), 2000)
    }, 500)
  }

  const handleDragEnd = (result: DropResult) => {
    if (!plan) return
    
    const { destination, draggableId } = result
    
    // Dropped outside a droppable
    if (!destination) return
    
    // Dropped back in course list
    if (destination.droppableId === "course-list") return
    
    // Dropped in timetable
    if (destination.droppableId.startsWith("timetable-")) {
      // Add course to plan
      addCourseToPlan(plan.id, draggableId)
      
      // Update local state
      setPlan((prev) => {
        if (!prev || prev.courses.includes(draggableId)) return prev
        return { ...prev, courses: [...prev.courses, draggableId] }
      })
    }
  }

  const handleRemoveCourse = (courseId: string) => {
    if (!plan) return
    
    removeCourseFromPlan(plan.id, courseId)
    setPlan((prev) => {
      if (!prev) return prev
      return { ...prev, courses: prev.courses.filter((id) => id !== courseId) }
    })
  }

  if (isLoading || !isMounted) {
    return (
      <div className="h-screen flex items-center justify-center">
        <div className="animate-pulse text-muted-foreground">Loading...</div>
      </div>
    )
  }

  if (!plan) {
    return (
      <div className="h-screen flex flex-col items-center justify-center gap-4">
        <p className="text-muted-foreground">Plan not found</p>
        <Button asChild>
          <Link href="/plans">Go to Plans</Link>
        </Button>
      </div>
    )
  }

  return (
    <DragDropContext onDragEnd={handleDragEnd}>
      <div className="h-screen flex flex-col bg-background">
        {/* Header */}
        <header className="flex items-center justify-between gap-4 border-b px-4 py-2">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" asChild>
              <Link href="/plans">
                <ArrowLeft className="h-4 w-4" />
                <span className="sr-only">Back to plans</span>
              </Link>
            </Button>
            
            <Button
              variant="ghost"
              size="icon"
              className="lg:hidden"
              onClick={() => setShowSidebar(!showSidebar)}
            >
              {showSidebar ? (
                <PanelLeftClose className="h-4 w-4" />
              ) : (
                <PanelLeft className="h-4 w-4" />
              )}
            </Button>
            
            <div className="flex items-center gap-2">
              <Input
                value={planName}
                onChange={(e) => setPlanName(e.target.value)}
                onBlur={handleSave}
                className="h-8 w-48 font-semibold border-transparent hover:border-input focus:border-input"
              />
              <Select value={semester} onValueChange={(value) => {
                setSemester(value)
                updatePlan(plan.id, { semester: value })
              }}>
                <SelectTrigger className="h-8 w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SEMESTERS.map((sem) => (
                    <SelectItem key={sem} value={sem}>{sem}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleSave}
              disabled={isSaving}
            >
              {showSaved ? "Saved" : isSaving ? "Saving..." : "Save"}
            </Button>
            <Button variant="outline" size="sm">
              Share
            </Button>
          </div>
        </header>

        {/* Main content */}
        <div className="flex-1 overflow-hidden">
          <ResizablePanelGroup direction="horizontal">
            {/* Course sidebar */}
            <ResizablePanel
              defaultSize={25}
              minSize={20}
              maxSize={35}
              className={cn(!showSidebar && "hidden lg:block")}
            >
              <CourseSidebar
                courses={mockCourses}
                addedCourseIds={plan.courses}
              />
            </ResizablePanel>
            
            <ResizableHandle withHandle className="hidden lg:flex" />
            
            {/* Main workspace */}
            <ResizablePanel defaultSize={75}>
              <div className="h-full flex min-h-0 flex-col gap-4 overflow-auto p-4">
                {/* AI Suggestions */}
                <div className="relative z-10 h-192 shrink-0 overflow-hidden">
                  <AISuggestions currentCourses={plan.courses} />
                </div>
                
                {/* Timetable */}
                <div className="relative z-0 flex-1 min-h-100 overflow-hidden">
                  <Timetable
                    courses={planCourses}
                    onRemoveCourse={handleRemoveCourse}
                  />
                </div>
              </div>
            </ResizablePanel>
          </ResizablePanelGroup>
        </div>
      </div>
    </DragDropContext>
  )
}
