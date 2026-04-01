import type { Course, Plan, Message } from "./types"

export const COURSE_COLORS = [
  "bg-blue-500/80",
  "bg-emerald-500/80",
  "bg-amber-500/80",
  "bg-rose-500/80",
  "bg-violet-500/80",
  "bg-cyan-500/80",
  "bg-orange-500/80",
  "bg-pink-500/80",
]

export const mockCourses: Course[] = [
  {
    id: "engl-101",
    code: "ENGL 101",
    name: "English Composition",
    instructor: "Dr. Sarah Mitchell",
    credits: 3,
    times: [
      { day: "Mon", startTime: "09:00", endTime: "10:30" },
      { day: "Wed", startTime: "09:00", endTime: "10:30" },
    ],
    color: "bg-blue-500/80",
    description: "Fundamentals of academic writing and critical thinking.",
  },
  {
    id: "mth-808",
    code: "MTH 808",
    name: "Advanced Calculus",
    instructor: "Prof. James Chen",
    credits: 4,
    times: [
      { day: "Tue", startTime: "11:00", endTime: "12:30" },
      { day: "Thu", startTime: "11:00", endTime: "12:30" },
    ],
    color: "bg-emerald-500/80",
    description: "Multivariable calculus and differential equations.",
  },
  {
    id: "his-101",
    code: "HIS 101",
    name: "World History I",
    instructor: "Dr. Maria Rodriguez",
    credits: 3,
    times: [
      { day: "Mon", startTime: "14:00", endTime: "15:30" },
      { day: "Wed", startTime: "14:00", endTime: "15:30" },
    ],
    color: "bg-amber-500/80",
    description: "Survey of world civilizations from prehistory to 1500 CE.",
  },
  {
    id: "cs-201",
    code: "CS 201",
    name: "Data Structures",
    instructor: "Prof. Alan Turing II",
    credits: 4,
    times: [
      { day: "Tue", startTime: "09:00", endTime: "10:30" },
      { day: "Thu", startTime: "09:00", endTime: "10:30" },
      { day: "Fri", startTime: "14:00", endTime: "15:00" },
    ],
    color: "bg-violet-500/80",
    description: "Arrays, linked lists, trees, graphs, and algorithm analysis.",
  },
  {
    id: "phy-151",
    code: "PHY 151",
    name: "Physics I",
    instructor: "Dr. Richard Feynman Jr.",
    credits: 4,
    times: [
      { day: "Mon", startTime: "11:00", endTime: "12:30" },
      { day: "Wed", startTime: "11:00", endTime: "12:30" },
      { day: "Fri", startTime: "11:00", endTime: "12:00" },
    ],
    color: "bg-rose-500/80",
    description: "Mechanics, thermodynamics, and waves.",
  },
  {
    id: "psy-101",
    code: "PSY 101",
    name: "Introduction to Psychology",
    instructor: "Dr. Emma Watson",
    credits: 3,
    times: [
      { day: "Tue", startTime: "14:00", endTime: "15:30" },
      { day: "Thu", startTime: "14:00", endTime: "15:30" },
    ],
    color: "bg-cyan-500/80",
    description: "Overview of psychological principles and research methods.",
  },
  {
    id: "art-120",
    code: "ART 120",
    name: "Drawing Fundamentals",
    instructor: "Prof. Vincent Park",
    credits: 3,
    times: [
      { day: "Wed", startTime: "16:00", endTime: "18:30" },
    ],
    color: "bg-orange-500/80",
    description: "Basic drawing techniques and visual composition.",
  },
  {
    id: "bio-201",
    code: "BIO 201",
    name: "Cell Biology",
    instructor: "Dr. Jane Darwin",
    credits: 4,
    times: [
      { day: "Mon", startTime: "16:00", endTime: "17:30" },
      { day: "Wed", startTime: "16:00", endTime: "17:30" },
    ],
    color: "bg-pink-500/80",
    description: "Structure and function of cells, molecular biology.",
  },
]

export const mockPlans: Plan[] = [
  {
    id: "plan-1",
    name: "Course Plan Draft",
    semester: "Fall 2025",
    courses: ["engl-101", "mth-808", "cs-201"],
    starred: false,
    createdAt: "2025-01-15T10:00:00Z",
    updatedAt: "2025-02-20T14:30:00Z",
  },
  {
    id: "plan-2",
    name: "Course Plan Final",
    semester: "Fall 2025",
    courses: ["engl-101", "his-101", "psy-101", "art-120"],
    starred: true,
    createdAt: "2025-01-20T09:00:00Z",
    updatedAt: "2025-03-01T11:00:00Z",
  },
  {
    id: "plan-3",
    name: "Spring Semester Plan",
    semester: "Spring 2026",
    courses: ["phy-151", "bio-201", "mth-808"],
    starred: false,
    createdAt: "2025-02-01T15:00:00Z",
    updatedAt: "2025-02-28T16:45:00Z",
  },
]

export const featuredPlanTemplates = [
  {
    id: "featured-1",
    title: "Engineering Track",
    description: "Recommended for first-year engineering students",
    courses: 5,
    credits: 18,
  },
  {
    id: "featured-2",
    title: "Pre-Med Path",
    description: "Biology and chemistry focused curriculum",
    courses: 5,
    credits: 17,
  },
  {
    id: "featured-3",
    title: "Liberal Arts Core",
    description: "Well-rounded humanities and social sciences",
    courses: 5,
    credits: 15,
  },
]

export const mockAISuggestions: Message[] = [
  {
    id: "msg-1",
    role: "assistant",
    content: "Based on your major requirements, I recommend adding ENGL 101 and MTH 808 to your schedule. These courses have good time slots that won't conflict with your existing classes.",
  },
  {
    id: "msg-2",
    role: "assistant",
    content: "I noticed you have a gap on Tuesday afternoons. PSY 101 would fit perfectly there and satisfies your social science requirement.",
  },
]

export const TIME_SLOTS = [
  "08:00", "09:00", "10:00", "11:00", "12:00", "13:00", 
  "14:00", "15:00", "16:00", "17:00", "18:00", "19:00"
]

export const DAYS: Array<"Mon" | "Tue" | "Wed" | "Thu" | "Fri"> = [
  "Mon", "Tue", "Wed", "Thu", "Fri"
]
