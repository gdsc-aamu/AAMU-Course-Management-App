export type DayOfWeek = "Mon" | "Tue" | "Wed" | "Thu" | "Fri"

export interface CourseTime {
  day: DayOfWeek
  startTime: string // "09:00" format
  endTime: string   // "10:30" format
}

export interface Course {
  id: string
  code: string           // "ENGL 101"
  name: string           // "English Composition"
  instructor: string
  credits: number
  times: CourseTime[]
  color: string          // Tailwind color class for timetable display
  description?: string
}

export interface Plan {
  id: string
  name: string
  semester: string       // "Fall 2025"
  courses: string[]      // Course IDs placed in timetable
  starred: boolean
  createdAt: string
  updatedAt: string
}

export interface TimetableEntry {
  courseId: string
  day: DayOfWeek
  startTime: string
  endTime: string
}

export interface Message {
  id: string
  role: "assistant" | "user"
  content: string
}

// Chat persistence types
export interface ChatThread {
  id: string
  user_id: string
  plan_id: string
  title: string
  created_at: string
  updated_at: string
}

export interface ChatMessage {
  id: string
  thread_id: string
  role: "user" | "assistant"
  content: string
  created_at: string
}
