"use client"

import { useState, useRef, useEffect } from "react"
import { Send, Bot } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Badge } from "@/components/ui/badge"
import { mockCourses } from "@/lib/data"
import type { Message, Course } from "@/lib/types"
import type { ChatQueryRequest, RoutedResponse } from "@/shared/contracts"
import { cn } from "@/lib/utils"

interface AISuggestionsProps {
  currentCourses?: string[]
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

const initialMessages: Message[] = [
  {
    id: "msg-welcome",
    role: "assistant",
    content: "Hi! I'm your AI Course Assistant. I can help you:\n\n- Find courses that fit your schedule\n- Check if you're on track to graduate\n- Analyze how adding a course affects your degree progress\n\nWhat would you like to know?",
  },
]

export function AISuggestions({ currentCourses = [] }: AISuggestionsProps) {
  const [messages, setMessages] = useState<Message[]>(initialMessages)
  const [input, setInput] = useState("")
  const [isTyping, setIsTyping] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const messageCounterRef = useRef(1)

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages])

  const nextMessageId = (prefix: "user" | "assistant") => {
    const id = `msg-${prefix}-${messageCounterRef.current}`
    messageCounterRef.current += 1
    return id
  }

  const sendMessage = async (content: string) => {
    const userMessage: Message = {
      id: nextMessageId("user"),
      role: "user",
      content,
    }

    setMessages((prev) => [...prev, userMessage])
    setInput("")
    setIsTyping(true)

    try {
      const payload: ChatQueryRequest = {
        question: content,
        session: {
          programCode: "BSCS-BS",
          bulletinYear: "2025-2026",
        },
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
      const assistantMessage: Message = {
        id: nextMessageId("assistant"),
        role: "assistant",
        content: formatServerAnswer(routed),
      }
      setMessages((prev) => [...prev, assistantMessage])
    } catch {
      const assistantMessage: Message = {
        id: nextMessageId("assistant"),
        role: "assistant",
        content: buildFallbackResponse(content, currentCourses),
      }
      setMessages((prev) => [...prev, assistantMessage])
    } finally {
      setIsTyping(false)
    }
  }

  const handleSubmit = (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!input.trim()) return
    sendMessage(input)
  }

  return (
    <div className="flex h-full flex-col rounded-lg border bg-card">
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
          >
            {label}
          </Button>
        ))}
      </div>

      <ScrollArea className="flex-1 p-3" ref={scrollRef}>
        <div className="space-y-4">
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
    </div>
  )
}
