"use client"

import type { Plan } from "@/lib/types"

interface CourseDetail {
  code: string
  title: string
  creditHours: number
}

async function fetchCourseDetails(courseCodes: string[]): Promise<CourseDetail[]> {
  if (courseCodes.length === 0) return []

  const { createClient } = await import("@/lib/supabase/client")
  const supabase = createClient()

  const { data } = await supabase
    .from("courses")
    .select("course_id, title, credit_hours")
    .in("course_id", courseCodes.map((c) => c.trim().toUpperCase()))

  if (!data) return courseCodes.map((c) => ({ code: c, title: c, creditHours: 3 }))

  const map = new Map(data.map((row) => [row.course_id, row]))
  return courseCodes.map((code) => {
    const row = map.get(code.trim().toUpperCase())
    return { code, title: row?.title ?? code, creditHours: row?.credit_hours ?? 3 }
  })
}

export async function downloadPlanAsPdf(plan: Plan, studentName?: string): Promise<void> {
  const { default: jsPDF } = await import("jspdf")

  const courses = await fetchCourseDetails(plan.courses)
  const totalCredits = courses.reduce((sum, c) => sum + c.creditHours, 0)

  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "letter" })

  const pageW = 215.9
  const margin = 20
  const contentW = pageW - margin * 2
  const primaryColor: [number, number, number] = [139, 0, 0]      // AAMU maroon
  const goldColor: [number, number, number] = [212, 175, 55]       // AAMU gold
  const lightGray: [number, number, number] = [245, 245, 245]
  const darkText: [number, number, number] = [30, 30, 30]
  const mutedText: [number, number, number] = [100, 100, 100]

  let y = margin

  // ── Header banner ──────────────────────────────────────────────────────────
  doc.setFillColor(...primaryColor)
  doc.rect(0, 0, pageW, 38, "F")

  // Gold accent stripe
  doc.setFillColor(...goldColor)
  doc.rect(0, 38, pageW, 2, "F")

  doc.setTextColor(255, 255, 255)
  doc.setFont("helvetica", "bold")
  doc.setFontSize(18)
  doc.text("Alabama A&M University", margin, 14)

  doc.setFontSize(11)
  doc.setFont("helvetica", "normal")
  doc.text("Academic Course Plan", margin, 22)

  doc.setFontSize(9)
  doc.setTextColor(212, 175, 55)
  doc.text(`Generated ${new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}`, margin, 30)

  y = 50

  // ── Plan info card ─────────────────────────────────────────────────────────
  doc.setFillColor(...lightGray)
  doc.roundedRect(margin, y, contentW, 28, 2, 2, "F")

  doc.setFont("helvetica", "bold")
  doc.setFontSize(13)
  doc.setTextColor(...darkText)
  doc.text(plan.name, margin + 6, y + 9)

  doc.setFont("helvetica", "normal")
  doc.setFontSize(9)
  doc.setTextColor(...mutedText)

  const infoItems: string[] = [`Semester: ${plan.semester}`]
  if (studentName) infoItems.push(`Student: ${studentName}`)
  infoItems.push(`Total Credits: ${totalCredits}`)
  infoItems.push(`Courses: ${courses.length}`)

  doc.text(infoItems.join("    •    "), margin + 6, y + 19)

  y += 36

  // ── Table header ───────────────────────────────────────────────────────────
  doc.setFillColor(...primaryColor)
  doc.rect(margin, y, contentW, 9, "F")

  doc.setFont("helvetica", "bold")
  doc.setFontSize(9)
  doc.setTextColor(255, 255, 255)
  doc.text("#", margin + 4, y + 6)
  doc.text("Course Code", margin + 14, y + 6)
  doc.text("Course Title", margin + 52, y + 6)
  doc.text("Credits", margin + contentW - 18, y + 6)

  y += 9

  // ── Table rows ─────────────────────────────────────────────────────────────
  doc.setFont("helvetica", "normal")
  doc.setFontSize(9)

  courses.forEach((course, idx) => {
    const rowH = 8
    const isEven = idx % 2 === 0

    // Alternating row background
    if (isEven) {
      doc.setFillColor(250, 250, 250)
    } else {
      doc.setFillColor(255, 255, 255)
    }
    doc.rect(margin, y, contentW, rowH, "F")

    // Row border
    doc.setDrawColor(220, 220, 220)
    doc.setLineWidth(0.2)
    doc.line(margin, y + rowH, margin + contentW, y + rowH)

    doc.setTextColor(...darkText)
    doc.text(String(idx + 1), margin + 4, y + 5.5)

    doc.setFont("helvetica", "bold")
    doc.setTextColor(...primaryColor)
    doc.text(course.code, margin + 14, y + 5.5)

    doc.setFont("helvetica", "normal")
    doc.setTextColor(...darkText)
    // Truncate long titles to fit
    const titleMaxW = contentW - 70
    const titleStr = doc.splitTextToSize(course.title, titleMaxW)[0] ?? course.title
    doc.text(titleStr, margin + 52, y + 5.5)

    doc.setFont("helvetica", "bold")
    doc.text(String(course.creditHours), margin + contentW - 14, y + 5.5)
    doc.setFont("helvetica", "normal")

    y += rowH
  })

  // ── Totals row ─────────────────────────────────────────────────────────────
  y += 2
  doc.setFillColor(...goldColor)
  doc.rect(margin, y, contentW, 9, "F")

  doc.setFont("helvetica", "bold")
  doc.setFontSize(9)
  doc.setTextColor(...darkText)
  doc.text("Total Credit Hours", margin + 14, y + 6)
  doc.text(String(totalCredits), margin + contentW - 14, y + 6)

  // ── Footer ─────────────────────────────────────────────────────────────────
  const footerY = 270
  doc.setDrawColor(...goldColor)
  doc.setLineWidth(0.5)
  doc.line(margin, footerY, margin + contentW, footerY)

  doc.setFont("helvetica", "italic")
  doc.setFontSize(8)
  doc.setTextColor(...mutedText)
  doc.text(
    "This plan is for advising purposes only. Please verify requirements with your academic advisor.",
    margin,
    footerY + 5
  )
  doc.text("Alabama A&M University — Office of Academic Affairs", margin, footerY + 10)

  // ── Download ───────────────────────────────────────────────────────────────
  const filename = `${plan.name.replace(/[^a-z0-9]/gi, "-").toLowerCase()}-${plan.semester.replace(/\s+/g, "-").toLowerCase()}.pdf`
  doc.save(filename)
}
