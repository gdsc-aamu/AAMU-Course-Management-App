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
