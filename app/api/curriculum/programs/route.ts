import { NextResponse } from "next/server"
import { listPrograms } from "@/backend/data-access/curriculum"

export async function GET() {
  try {
    const rawPrograms = await listPrograms()
    
    const programs = rawPrograms.map((p) => ({
      code: p.code,
      name: p.name,
      catalogYear: p.catalog_year,
    }))

    return NextResponse.json({ success: true, programs })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to fetch programs"
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}
