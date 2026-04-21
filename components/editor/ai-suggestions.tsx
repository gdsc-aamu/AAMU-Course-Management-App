"use client"

import { useState, useRef, useEffect } from "react"
import { Send, Bot, Save } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { mockCourses } from "@/lib/data"
import { createClient } from "@/lib/supabase/client"
import { authenticatedFetch } from "@/lib/api-client"
import { useToast } from "@/hooks/use-toast"
import type { Message } from "@/lib/types"
import type { ChatQueryRequest, RoutedResponse, ConversationMessage } from "@/shared/contracts"
import { cn } from "@/lib/utils"

const supabase = createClient()

interface AISuggestionsProps {
  currentCourses?: string[]
  threadId: string
  planSemester?: string   // e.g. "Fall 2025" — used as planning context in AI prompts
}

// Mock graduation requirements
const GRADUATION_REQUIREMENTS = {
  totalCredits: 120,
  requiredCourses: ["ENGL 101", "MTH 808"],
  categories: {
    english: { required: 6, courses: ["ENGL 101"] },
    math: { required: 8, courses: ["MTH 808"] },
    science: { required: 8, courses: ["PHY 151", "BIO 201"] },
    humanities: { required: 6, courses: ["HIS 101", "ART 120"] },
    socialScience: { required: 6, courses: ["PSY 101"] },
    electives: { required: 86, courses: ["CS 201"] },
  }
}

// Quick action prompts
const QUICK_ACTIONS = [
  "What courses can I take?",
  "What should I take next?",
  "Will I graduate on time?",
  "Check my requirements",
]

function buildFallbackResponse(userMessage: string, currentCourses: string[]): string {
  const lowerMessage = userMessage.toLowerCase()
  const enrolledCourses = mockCourses.filter((c) => currentCourses.includes(c.id))
  const availableCourses = mockCourses.filter((c) => !currentCourses.includes(c.id))

  const currentCredits = enrolledCourses.reduce((sum, c) => sum + c.credits, 0)
  const remainingCredits = GRADUATION_REQUIREMENTS.totalCredits - currentCredits

  if (lowerMessage.includes("graduate") || lowerMessage.includes("graduation") || lowerMessage.includes("on time")) {
    const hasEnglish = enrolledCourses.some((c) => c.code === "ENGL 101")
    const hasMath = enrolledCourses.some((c) => c.code === "MTH 808")
    const missingRequired: string[] = []
    if (!hasEnglish) missingRequired.push("ENGL 101")
    if (!hasMath) missingRequired.push("MTH 808")

    if (missingRequired.length > 0) {
      return `Based on your current plan, you're missing some required courses: ${missingRequired.join(", ")}. You currently have ${currentCredits} credits enrolled. To graduate, you need ${GRADUATION_REQUIREMENTS.totalCredits} credits total (${remainingCredits} remaining).`
    }

    return `You currently have ${currentCredits} credits enrolled, with ${remainingCredits} credits remaining to reach ${GRADUATION_REQUIREMENTS.totalCredits}.`
  }

  if (lowerMessage.includes("what course") || lowerMessage.includes("can i take") || lowerMessage.includes("recommend") || lowerMessage.includes("suggest")) {
    const recommendations = availableCourses.slice(0, 3)
    return `Here are available courses from your local plan data:\n\n${recommendations
      .map((c) => `${c.code} - ${c.name} (${c.credits} credits)`)
      .join("\n")}`
  }

  return "I couldn't reach the server response, but I can still help with local schedule guidance. Try asking about graduation progress or course recommendations."
}

function formatServerAnswer(response: RoutedResponse): string {
  const handlerResult = response.handlerResult as {
    answer?: string
    sources?: Array<{ citation?: string; title?: string }>
  }

  const answer = handlerResult.answer ?? "I could not generate an answer."
  const sources = handlerResult.sources ?? []

  if (sources.length === 0) {
    return answer
  }

  const citations = sources
    .slice(0, 3)
    .map((s) => `- ${s.title ?? "Source"}${s.citation ? ` (${s.citation})` : ""}`)
    .join("\n")

  return `${answer}\n\nSources:\n${citations}`
}

interface SavePlanAction {
  suggestedName: string | null
  suggestedCourses: string[]
  requiresConfirmation: boolean
}

export function AISuggestions({ currentCourses = [], threadId, planSemester }: AISuggestionsProps) {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState("")
  const [isTyping, setIsTyping] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [studentId, setStudentId] = useState<string | null>(null)
  const [studentName, setStudentName] = useState<string | null>(null)
  const [sessionContext, setSessionContext] = useState<{
    programCode?: string
    bulletinYear?: string
    classification?: string
  }>({})
  const [savePlanDialog, setSavePlanDialog] = useState<{
    open: boolean
    action: SavePlanAction | null
  }>({ open: false, action: null })
  const [savePlanName, setSavePlanName] = useState("")
  const [isSavingPlan, setIsSavingPlan] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const messageCounterRef = useRef(1)
  const { toast } = useToast()

  // Load thread messages on mount
  useEffect(() => {
    let isActive = true

    const loadThread = async () => {
      try {
        const response = await authenticatedFetch(`/api/chat/threads/${threadId}`)
        if (!response.ok) {
          throw new Error(`Failed to load thread: ${response.statusText}`)
        }
        const data = await response.json()
        
        if (!isActive) return

        // Convert DB messages to local Message format
        const dbMessages = data.messages || []
        const loadedMessages: Message[] = dbMessages.map((msg: any, idx: number) => ({
          id: msg.id,
          role: msg.role,
          content: msg.content,
        }))

        if (loadedMessages.length === 0) {
          // No messages yet, show welcome
          loadedMessages.push({
            id: "msg-welcome",
            role: "assistant",
            content:
              `Hi${studentName ? ` ${studentName.split(" ")[0]}` : ""}! I'm your AAMU course advisor. Ask me anything about your courses, what you need to graduate, prerequisites, or what to register for next semester.`,
          })
        }

        setMessages(loadedMessages)
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : "Failed to load thread"
        console.error("[AISuggestions] Load error:", errorMsg)
        toast({
          title: "Failed to load conversation",
          description: errorMsg,
          variant: "destructive",
        })
        // Fallback: show welcome message
        setMessages([
          {
            id: "msg-welcome",
            role: "assistant",
            content:
              `Hi${studentName ? ` ${studentName.split(" ")[0]}` : ""}! I'm your AAMU course advisor. Ask me anything about your courses, what you need to graduate, prerequisites, or what to register for next semester.`,
          },
        ])
      } finally {
        if (isActive) {
          setIsLoading(false)
        }
      }
    }

    loadThread()

    // Fetch session user and academic profile context
    ;(async () => {
      const { data } = await supabase.auth.getSession()
      if (!isActive) return
      const uid = data.session?.user.id ?? null
      setStudentId(uid)

      const name =
        data.session?.user.user_metadata?.full_name ??
        data.session?.user.user_metadata?.name ??
        null
      if (name) setStudentName(name)

      if (uid && data.session?.access_token) {
        try {
          const profileRes = await fetch("/api/user/academic-profile", {
            headers: { Authorization: `Bearer ${data.session.access_token}` },
          })
          if (profileRes.ok) {
            const profilePayload = await profileRes.json()
            if (isActive && profilePayload.profile) {
              setSessionContext({
                programCode: profilePayload.profile.programCode ?? undefined,
                bulletinYear: profilePayload.profile.bulletinYear ?? undefined,
                classification: profilePayload.profile.classification ?? undefined,
              })
            }
          }
        } catch {
          // non-fatal — chat still works without context
        }
      }
    })()

    return () => {
      isActive = false
    }
  }, [threadId, toast])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  const sendMessage = async (content: string) => {
    const userMessage: Message = {
      id: `msg-${Date.now()}`, // Temporary ID until saved
      role: "user",
      content,
    }

    setMessages((prev) => [...prev, userMessage])
    setInput("")
    setIsTyping(true)

    try {
      // Save user message to DB
      await authenticatedFetch(`/api/chat/threads/${threadId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: "user", content }),
      })

      const { data } = await supabase.auth.getSession()
      const liveStudentId = data.session?.user.id ?? studentId ?? null

      // Build history from all messages visible before this new user message
      // (exclude the welcome placeholder and filter to user/assistant roles only)
      const historySnapshot: ConversationMessage[] = messages
        .filter((m) => m.id !== "msg-welcome" && (m.role === "user" || m.role === "assistant"))
        .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }))

      const payload: ChatQueryRequest = {
        question: planSemester
          ? `[Planning for: ${planSemester}] ${content}`
          : content,
        studentId: liveStudentId ?? undefined,
        session: {
          programCode: sessionContext.programCode,
          bulletinYear: sessionContext.bulletinYear,
          classification: sessionContext.classification,
          studentName: studentName ?? undefined,
        },
        conversationHistory: historySnapshot,
      }

      const apiResponse = await fetch("/api/chat/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })

      if (!apiResponse.ok) {
        throw new Error(`Chat query failed with status ${apiResponse.status}`)
      }

      const routed = (await apiResponse.json()) as RoutedResponse
      const assistantContent = formatServerAnswer(routed)

      // Check for save-plan action
      const handlerResult = routed.handlerResult as Record<string, unknown>
      const savePlanActionData = handlerResult?.savePlanAction as SavePlanAction | undefined
      if (savePlanActionData?.requiresConfirmation) {
        setSavePlanName(savePlanActionData.suggestedName ?? "")
        setSavePlanDialog({ open: true, action: savePlanActionData })
      }

      // Save assistant message to DB
      const saveResponse = await authenticatedFetch(`/api/chat/threads/${threadId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: "assistant", content: assistantContent }),
      })

      if (!saveResponse.ok) {
        throw new Error("Failed to save assistant message")
      }

      const assistantMessage: Message = {
        id: `msg-${Date.now()}`,
        role: "assistant",
        content: assistantContent,
      }
      setMessages((prev) => [...prev, assistantMessage])
    } catch (error) {
      const errorContent = buildFallbackResponse(content, currentCourses)
      const assistantMessage: Message = {
        id: `msg-${Date.now()}`,
        role: "assistant",
        content: errorContent,
      }
      setMessages((prev) => [...prev, assistantMessage])

      // Still try to save fallback message
      authenticatedFetch(`/api/chat/threads/${threadId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: "assistant", content: errorContent }),
      }).catch(() => {
        // Silently fail if save doesn't work, fallback already shown
      })
    } finally {
      setIsTyping(false)
    }
  }

  const handleSavePlan = async () => {
    if (!savePlanName.trim() || !studentId) return
    setIsSavingPlan(true)
    try {
      const courseIds = savePlanDialog.action?.suggestedCourses ?? []
      const res = await fetch("/api/plans", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: savePlanName.trim(),
          semester: sessionContext.bulletinYear
            ? `${sessionContext.bulletinYear.split("-")[0]} Fall`
            : "Fall 2025",
          courseIds,
          userId: studentId,
        }),
      })
      if (!res.ok) throw new Error("Failed to save plan")
      toast({ title: "Plan saved!", description: `"${savePlanName.trim()}" has been saved to your plans.` })
      setSavePlanDialog({ open: false, action: null })

      // Add confirmation message to chat
      const confirmMsg: Message = {
        id: `msg-${Date.now()}`,
        role: "assistant",
        content: `Your plan "${savePlanName.trim()}" has been saved! You can view and edit it from the Plans section.`,
      }
      setMessages((prev) => [...prev, confirmMsg])
      await authenticatedFetch(`/api/chat/threads/${threadId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: "assistant", content: confirmMsg.content }),
      }).catch(() => {})
    } catch (error) {
      toast({ title: "Failed to save plan", description: "Please try again.", variant: "destructive" })
    } finally {
      setIsSavingPlan(false)
    }
  }

  const handleSubmit = (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!input.trim()) return
    sendMessage(input)
  }

  return (
    <div className="relative z-10 flex h-full min-h-0 flex-col overflow-hidden rounded-lg border bg-card">
      <div className="flex items-center gap-2 border-b p-3">
        <div className="flex-1">
          <h3 className="font-semibold text-sm">AI Course Assistant</h3>
          <p className="text-xs text-muted-foreground">Ask about courses & graduation</p>
        </div>
        <Badge variant="secondary" className="text-xs">Beta</Badge>
      </div>

      {/* Quick Actions */}
      <div className="flex gap-2 border-b p-2 overflow-x-auto">
        {QUICK_ACTIONS.map((label) => (
          <Button
            key={label}
            variant="outline"
            size="sm"
            className="shrink-0 text-xs h-7"
            onClick={() => sendMessage(label)}
            disabled={isLoading || isTyping}
          >
            {label}
          </Button>
        ))}
      </div>

      <ScrollArea className="min-h-0 flex-1 p-3">
        <div className="space-y-4">
          {isLoading ? (
            <div className="flex justify-center items-center h-full">
              <div className="flex gap-1">
                <span className="inline-flex gap-1">
                  <span className="animate-bounce" style={{ animationDelay: "0ms" }}>.</span>
                  <span className="animate-bounce" style={{ animationDelay: "150ms" }}>.</span>
                  <span className="animate-bounce" style={{ animationDelay: "300ms" }}>.</span>
                </span>
              </div>
            </div>
          ) : (
            <>
              {messages.map((message) => (
            <div
              key={message.id}
              className={cn(
                "flex gap-2",
                message.role === "user" && "flex-row-reverse"
              )}
            >
              {message.role === "assistant" && (
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <Bot className="h-4 w-4" />
                </div>
              )}
              <div
                className={cn(
                  "rounded-lg px-3 py-2 text-sm max-w-[85%] whitespace-pre-line",
                  message.role === "user"
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted"
                )}
              >
                {message.content}
              </div>
            </div>
          ))}
          {isTyping && (
            <div className="flex gap-2">
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                <Bot className="h-4 w-4" />
              </div>
              <div className="rounded-lg px-3 py-2 text-sm bg-muted">
                <span className="inline-flex gap-1">
                  <span className="animate-bounce" style={{ animationDelay: "0ms" }}>.</span>
                  <span className="animate-bounce" style={{ animationDelay: "150ms" }}>.</span>
                  <span className="animate-bounce" style={{ animationDelay: "300ms" }}>.</span>
                </span>
              </div>
            </div>
          )}
          <div ref={bottomRef} />
            </>
          )}
        </div>
      </ScrollArea>

      <form onSubmit={handleSubmit} className="border-t p-3">
        <div className="flex gap-2">
          <Input
            placeholder="Ask about courses or graduation..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            className="flex-1"
            disabled={isTyping}
          />
          <Button type="submit" size="icon" disabled={isTyping || !input.trim()}>
            <Send className="h-4 w-4" />
            <span className="sr-only">Send message</span>
          </Button>
        </div>
      </form>

      {/* Save Plan Dialog */}
      <Dialog
        open={savePlanDialog.open}
        onOpenChange={(open) => setSavePlanDialog((prev) => ({ ...prev, open }))}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Save className="h-4 w-4" />
              Save Plan
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="plan-name">Plan name</Label>
              <Input
                id="plan-name"
                placeholder="e.g. Spring 2026 Schedule"
                value={savePlanName}
                onChange={(e) => setSavePlanName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSavePlan()}
                autoFocus
              />
            </div>
            {(savePlanDialog.action?.suggestedCourses?.length ?? 0) > 0 && (
              <div className="text-sm text-muted-foreground">
                <p className="font-medium mb-1">Courses to include:</p>
                <ul className="list-disc list-inside space-y-0.5">
                  {savePlanDialog.action!.suggestedCourses.map((c) => (
                    <li key={c}>{c}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setSavePlanDialog({ open: false, action: null })}
              disabled={isSavingPlan}
            >
              Cancel
            </Button>
            <Button
              onClick={handleSavePlan}
              disabled={isSavingPlan || !savePlanName.trim()}
            >
              {isSavingPlan ? "Saving..." : "Save Plan"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
