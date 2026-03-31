"use client"

import { useState, useRef, useEffect } from "react"
import { Send, Bot } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Badge } from "@/components/ui/badge"
import { mockCourses } from "@/lib/data"
import type { Message, Course } from "@/lib/types"
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

// Mock AI response generator
function generateAIResponse(userMessage: string, currentCourses: string[]): { content: string; courses?: Course[] } {
  const lowerMessage = userMessage.toLowerCase()
  const enrolledCourses = mockCourses.filter(c => currentCourses.includes(c.id))
  const availableCourses = mockCourses.filter(c => !currentCourses.includes(c.id))

  const currentCredits = enrolledCourses.reduce((sum, c) => sum + c.credits, 0)
  const remainingCredits = GRADUATION_REQUIREMENTS.totalCredits - currentCredits

  if (lowerMessage.includes("graduate") || lowerMessage.includes("graduation") || lowerMessage.includes("on time")) {
    const hasEnglish = enrolledCourses.some(c => c.code === "ENGL 101")
    const hasMath = enrolledCourses.some(c => c.code === "MTH 808")
    const missingRequired = []
    if (!hasEnglish) missingRequired.push("ENGL 101")
    if (!hasMath) missingRequired.push("MTH 808")

    if (missingRequired.length > 0) {
      return {
        content: `Based on your current plan, you're missing some required courses: ${missingRequired.join(", ")}. You currently have ${currentCredits} credits enrolled. To graduate, you need ${GRADUATION_REQUIREMENTS.totalCredits} credits total (${remainingCredits} remaining). I recommend adding the missing required courses to stay on track for graduation.`,
      }
    }

    return {
      content: `Great news! You have all required core courses. You currently have ${currentCredits} credits enrolled, with ${remainingCredits} credits remaining to reach ${GRADUATION_REQUIREMENTS.totalCredits}. At this pace, you're on track to graduate. Consider adding electives that align with your interests or career goals.`,
    }
  }

  if (lowerMessage.includes("what course") || lowerMessage.includes("can i take") || lowerMessage.includes("recommend") || lowerMessage.includes("suggest")) {
    const recommendations = availableCourses.slice(0, 3)
    return {
      content: `Based on your current schedule, here are some courses you can take:\n\n${recommendations.map(c => `**${c.code}** - ${c.name} (${c.credits} credits)\n${c.description}`).join("\n\n")}\n\nThese courses don't conflict with your current schedule and help fulfill graduation requirements.`,
      courses: recommendations,
    }
  }

  if (lowerMessage.includes("requirement") || lowerMessage.includes("check") || lowerMessage.includes("need")) {
    const categories = Object.entries(GRADUATION_REQUIREMENTS.categories).map(([cat, req]) => {
      const enrolled = enrolledCourses.filter(c => req.courses.includes(c.code))
      const earnedCredits = enrolled.reduce((sum, c) => sum + c.credits, 0)
      const status = earnedCredits >= req.required ? "Complete" : `${earnedCredits}/${req.required} credits`
      return `${cat.charAt(0).toUpperCase() + cat.slice(1)}: ${status}`
    })

    return {
      content: `Here's your graduation requirements status:\n\n${categories.join("\n")}\n\nTotal: ${currentCredits}/${GRADUATION_REQUIREMENTS.totalCredits} credits`,
    }
  }

  const courseCodeMatch = userMessage.match(/([A-Z]{2,4})\s*(\d{3})/i)
  if (courseCodeMatch) {
    const searchCode = `${courseCodeMatch[1].toUpperCase()} ${courseCodeMatch[2]}`
    const course = mockCourses.find(c => c.code.toUpperCase() === searchCode)

    if (course) {
      const isRequired = GRADUATION_REQUIREMENTS.requiredCourses.includes(course.code)
      const alreadyEnrolled = currentCourses.includes(course.id)

      if (alreadyEnrolled) {
        return {
          content: `You're already enrolled in ${course.code} (${course.name}). ${isRequired ? "This is a required course for graduation - good choice!" : "This course counts toward your elective credits."}`,
        }
      }

      const hasConflict = enrolledCourses.some(enrolled =>
        enrolled.times.some(t1 =>
          course.times.some(t2 =>
            t1.day === t2.day && t1.startTime === t2.startTime
          )
        )
      )

      if (hasConflict) {
        return {
          content: `Adding ${course.code} (${course.name}) would create a time conflict with your current schedule. ${isRequired ? "However, this is a required course for graduation, so you may need to adjust your other courses." : "Consider taking this course in a different semester."}`,
        }
      }

      return {
        content: `${course.code} (${course.name}) - ${course.credits} credits\n\n${course.description}\n\n${isRequired ? "This is a **required course** for graduation. Adding it will help you stay on track!" : "This course fulfills elective requirements."} It fits well in your current schedule with no time conflicts.`,
      }
    }
  }

  return {
    content: "I can help you with course planning. Try asking:\n\n- \"What courses can I take?\"\n- \"Will I graduate on time?\"\n- \"Tell me about CS 201\"\n- \"Check my requirements\"\n\nI'll analyze your schedule and provide personalized recommendations.",
  }
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

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages])

  const sendMessage = (content: string) => {
    const userMessage: Message = {
      id: `msg-user-${Date.now()}`,
      role: "user",
      content,
    }

    setMessages((prev) => [...prev, userMessage])
    setInput("")
    setIsTyping(true)

    setTimeout(() => {
      const response = generateAIResponse(content, currentCourses)
      const assistantMessage: Message = {
        id: `msg-assistant-${Date.now()}`,
        role: "assistant",
        content: response.content,
      }
      setMessages((prev) => [...prev, assistantMessage])
      setIsTyping(false)
    }, 800)
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
