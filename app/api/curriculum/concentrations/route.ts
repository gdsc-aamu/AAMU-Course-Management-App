import { NextResponse } from "next/server"
import { getProgram, getConcentrations } from "@/backend/data-access/curriculum"

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const programCode = searchParams.get("programCode")

    if (!programCode) {
      return NextResponse.json({ success: false, error: "programCode is required" }, { status: 400 })
    }

    const program = await getProgram(programCode)
    if (!program) {
      return NextResponse.json({ success: true, concentrations: [] })
    }

    const rows = await getConcentrations(program.id)
    const concentrations = rows.map((c) => ({
      code: c.code,
      name: c.name,
      type: c.type,
      totalHours: c.total_hours,
    }))

    return NextResponse.json({ success: true, concentrations })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to fetch concentrations"
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}
