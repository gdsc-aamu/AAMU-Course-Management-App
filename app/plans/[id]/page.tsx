"use client"

import { useState, useEffect, use, useRef } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { ArrowLeft, PanelLeftClose, PanelLeft, FileDown } from "lucide-react"
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
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from "@/components/ui/sheet"
import { ChatHistorySidebar } from "@/components/editor/chat-history-sidebar"
import { AISuggestions } from "@/components/editor/ai-suggestions"
import { usePlans } from "@/hooks/use-plans"
import { createClient } from "@/lib/supabase/client"
import { authenticatedFetch } from "@/lib/api-client"
import { useToast } from "@/hooks/use-toast"
import { downloadPlanAsPdf } from "@/lib/download-plan-pdf"
import type { Plan } from "@/lib/types"
import { cn } from "@/lib/utils"

const SEMESTERS = [
  "Fall 2025",
  "Spring 2026",
  "Fall 2026",
  "Spring 2027",
]

const supabase = createClient()

export default function PlanEditorPage({ params }: Readonly<{ params: Promise<{ id: string }> }>) {
  const resolvedParams = use(params)
  const router = useRouter()
  const { plans, createPlan, updatePlan, getPlan } = usePlans()
  const { toast } = useToast()
  
  const [plan, setPlan] = useState<Plan | null>(null)
  const [planName, setPlanName] = useState("")
  const [semester, setSemester] = useState(SEMESTERS[0])
  const [showSidebar, setShowSidebar] = useState(true)
  const [isLoading, setIsLoading] = useState(true)
  const [isMounted, setIsMounted] = useState(false)
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null)
  const [isCreatingThread, setIsCreatingThread] = useState(false)
  const [isDownloadingPdf, setIsDownloadingPdf] = useState(false)
  const [studentName, setStudentName] = useState<string | undefined>(undefined)

  const isNewPlan = resolvedParams.id === "new"
  const planCreatedRef = useRef(false)

  // Handle SSR
  useEffect(() => {
    setIsMounted(true)
  }, [])

  // Load student name for PDF header
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      const name = data.session?.user.user_metadata?.full_name ?? data.session?.user.email
      if (name) setStudentName(name)
    })
  }, [])

  // Load plan data
  useEffect(() => {
    const loadPlan = async () => {
      if (isNewPlan) {
        // Only create once - use ref to prevent double execution
        if (planCreatedRef.current) return
        planCreatedRef.current = true

        try {
          const newPlan = await createPlan("Untitled Plan", SEMESTERS[0])
          setPlan(newPlan)
          setPlanName(newPlan.name)
          setSemester(newPlan.semester)
          // Keep isLoading true during redirect to show loading state
          router.replace(`/plans/${newPlan.id}`)
        } catch (error) {
          console.error("Error creating plan:", error)
          setIsLoading(false)
          planCreatedRef.current = false
        }
      } else if (!isNewPlan) {
        // Fetch plan directly from Supabase by ID
        try {
          const { data, error } = await supabase
            .from("plans")
            .select("*")
            .eq("id", resolvedParams.id)
            .single()

          if (error || !data) {
            console.error("Plan not found:", error)
            setIsLoading(false)
            return
          }

          // Fetch the plan's courses
          const { data: coursesData } = await supabase
            .from("plan_courses")
            .select("course_id")
            .eq("plan_id", data.id)

          const loadedPlan: Plan = {
            id: data.id,
            name: data.name,
            semester: data.semester,
            courses: (coursesData || []).map((c) => c.course_id),
            starred: data.starred,
            createdAt: data.created_at,
            updatedAt: data.updated_at,
          }

          setPlan(loadedPlan)
          setPlanName(loadedPlan.name)
          setSemester(loadedPlan.semester)
          setIsLoading(false)
        } catch (error) {
          console.error("Error loading plan:", error)
          setIsLoading(false)
        }
      }
    }
    
    loadPlan()
  }, [isNewPlan, resolvedParams.id, createPlan, router])

  const handleDownloadPdf = async () => {
    if (!plan) return
    setIsDownloadingPdf(true)
    try {
      await downloadPlanAsPdf(plan, studentName)
    } catch (err) {
      toast({ title: "Failed to generate PDF", description: "Please try again.", variant: "destructive" })
    } finally {
      setIsDownloadingPdf(false)
    }
  }

  const handleCreateThread = async () => {
    if (!plan) return

    setIsCreatingThread(true)
    try {
      const response = await authenticatedFetch("/api/chat/threads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          planId: plan.id,
          title: `Chat - ${new Date().toLocaleDateString()}`,
        }),
      })

      if (!response.ok) {
        throw new Error("Failed to create thread")
      }

      const data = await response.json()
      setSelectedThreadId(data.thread.id)
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : "Failed to create chat"
      toast({
        title: "Error",
        description: errorMsg,
        variant: "destructive",
      })
    } finally {
      setIsCreatingThread(false)
    }
  }

  const handleSelectThread = (threadId: string) => {
    setSelectedThreadId(threadId)
  }

  // Initialize with first thread or create one
  useEffect(() => {
    if (plan && !selectedThreadId) {
      // Try to get first thread for this plan
      const loadFirstThread = async () => {
        try {
          const response = await authenticatedFetch(`/api/chat/threads?planId=${encodeURIComponent(plan.id)}`)
          if (response.ok) {
            const data = await response.json()
            if (data.threads && data.threads.length > 0) {
              setSelectedThreadId(data.threads[0].id)
            } else {
              // No threads, create one
              await handleCreateThread()
            }
          }
        } catch (error) {
          console.error("Failed to load threads:", error)
          // Create a new thread on error
          await handleCreateThread()
        }
      }

      loadFirstThread()
    }
  }, [plan?.id])

  if (isLoading || !isMounted) {
    return (
      <div className="h-screen flex items-center justify-center">
        <div className="animate-pulse text-muted-foreground">Loading...</div>
      </div>
    )
  }

  if (!plan || !selectedThreadId) {
    return (
      <div className="h-screen flex flex-col items-center justify-center gap-4">
        <p className="text-muted-foreground">
          {!plan ? "Plan not found" : "Initializing chat..."}
        </p>
        {!plan && (
          <Button asChild>
            <Link href="/plans">Go to Plans</Link>
          </Button>
        )}
      </div>
    )
  }

  return (
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

          <Sheet>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="lg:hidden">
                {showSidebar ? (
                  <PanelLeftClose className="h-4 w-4" />
                ) : (
                  <PanelLeft className="h-4 w-4" />
                )}
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-64 p-0">
              <SheetTitle className="sr-only">Chat History</SheetTitle>
              <ChatHistorySidebar
                planId={plan.id}
                selectedThreadId={selectedThreadId}
                onSelectThread={handleSelectThread}
                onCreateThread={handleCreateThread}
              />
            </SheetContent>
          </Sheet>

          <div className="flex items-center gap-2">
            <Input
              value={planName}
              onChange={(e) => setPlanName(e.target.value)}
              onBlur={() => plan && updatePlan(plan.id, { name: planName, semester })}
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
            onClick={handleDownloadPdf}
            disabled={isDownloadingPdf || !plan}
            className="gap-2"
          >
            <FileDown className="h-4 w-4" />
            {isDownloadingPdf ? "Generating..." : "Save as PDF"}
          </Button>
        </div>
      </header>

      {/* Main content */}
      <div className="flex-1 overflow-hidden">
        <ResizablePanelGroup direction="horizontal">
          {/* Chat History Sidebar */}
          <ResizablePanel
            defaultSize={25}
            minSize={20}
            maxSize={35}
            className={"hidden lg:block"}
          >
            <ChatHistorySidebar
              planId={plan.id}
              selectedThreadId={selectedThreadId}
              onSelectThread={handleSelectThread}
              onCreateThread={handleCreateThread}
            />
          </ResizablePanel>

          <ResizableHandle withHandle className="hidden lg:flex" />

          {/* Chat workspace */}
          <ResizablePanel defaultSize={75}>
            <div className="h-full flex flex-col overflow-hidden">
              <AISuggestions currentCourses={plan.courses} threadId={selectedThreadId} planSemester={semester} />
            </div>
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>
    </div>
  )
}
