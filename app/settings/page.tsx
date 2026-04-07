"use client"

import { useEffect, useRef, useState } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Sidebar } from "@/components/layout/sidebar"
import { Search, Upload, CheckCircle2, AlertCircle } from "lucide-react"
import { createClient } from "@/lib/supabase/client"

const supabase = createClient()

interface CompletedCourseRow {
  code: string
  title: string
  creditHours: number
}

export default function SettingsPage() {
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [isUploading, setIsUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [uploadSuccess, setUploadSuccess] = useState<string | null>(null)
  const [courses, setCourses] = useState<CompletedCourseRow[]>([])
  const [isLoadingCourses, setIsLoadingCourses] = useState(true)
  const [coursesError, setCoursesError] = useState<string | null>(null)

  async function loadCompletedCourses() {
    setCoursesError(null)
    setIsLoadingCourses(true)

    try {
      const { data, error } = await supabase.auth.getSession()
      if (error || !data.session?.access_token) {
        throw new Error("You need to be signed in to view completed courses.")
      }

      const response = await fetch("/api/degreeworks/completed-courses", {
        method: "GET",
        headers: {
          Authorization: `Bearer ${data.session.access_token}`,
        },
      })

      const payload = (await response.json()) as {
        success: boolean
        error?: string
        courses?: CompletedCourseRow[]
      }

      if (!response.ok || !payload.success) {
        throw new Error(payload.error ?? "Failed to fetch completed courses.")
      }

      setCourses(payload.courses ?? [])
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unexpected load error"
      setCoursesError(message)
    } finally {
      setIsLoadingCourses(false)
    }
  }

  useEffect(() => {
    void loadCompletedCourses()
  }, [])

  async function handleFileSelection(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return

    setUploadError(null)
    setUploadSuccess(null)

    if (!file.name.toLowerCase().endsWith(".pdf")) {
      setUploadError("Please select a PDF file.")
      event.target.value = ""
      return
    }

    setIsUploading(true)

    try {
      const { data, error } = await supabase.auth.getSession()
      if (error || !data.session?.access_token) {
        throw new Error("You need to be signed in before uploading a DegreeWorks PDF.")
      }

      const form = new FormData()
      form.append("file", file)

      const response = await fetch("/api/degreeworks/upload", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${data.session.access_token}`,
        },
        body: form,
      })

      const payload = (await response.json()) as {
        success: boolean
        error?: string
        mappedCompletedCount?: number
      }

      if (!response.ok || !payload.success) {
        throw new Error(payload.error ?? "Failed to upload and parse DegreeWorks PDF.")
      }

      setUploadSuccess(
        `Upload successful. Synced ${payload.mappedCompletedCount ?? 0} completed courses.`
      )
      await loadCompletedCourses()
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unexpected upload error"
      setUploadError(message)
    } finally {
      setIsUploading(false)
      event.target.value = ""
    }
  }

  function handleOpenFilePicker() {
    fileInputRef.current?.click()
  }

  return (
    <div className="flex min-h-screen bg-[#fafafa]">
      <Sidebar />
      
      <main className="flex-1 px-8 py-6">
        <div className="mx-auto max-w-5xl space-y-8">
          
          {/* Top Navigation Bar */}
          <div className="flex items-center justify-between border-b pb-4">
            <div className="relative w-full max-w-md">
              
            </div>
            <div className="flex items-center gap-4">
              <div className="text-right hidden md:block">
                <div className="text-sm font-bold text-foreground">John Bulldog</div>
                <div className="text-[10px] font-semibold text-muted-foreground tracking-wider">
                  JUNIOR • CS MAJOR
                </div>
              </div>
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#78103A] text-sm font-bold text-white shadow-sm">
                JD
              </div>
            </div>
          </div>

          {/* Page Header */}
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-gray-900">
              Student Profile & Settings
            </h1>
            <p className="mt-1 text-base text-gray-500">
              Manage your academic records and personal information.
            </p>
          </div>

          <div className="space-y-6">
            {/* Personal Information Card */}
            <Card className="shadow-sm border-gray-100">
              <CardContent className="p-6">
                <div className="flex items-center justify-between mb-6">
                  <h2 className="text-lg font-bold text-gray-900">Personal Information</h2>
                  <button className="text-sm font-bold text-[#78103A] hover:underline cursor-pointer">
                    Edit Profile
                  </button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-y-6 gap-x-12">
                  <div>
                    <div className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Full Name</div>
                    <div className="text-base font-medium text-gray-900">Johnathan D. Bulldog</div>
                  </div>
                  <div>
                    <div className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Student ID</div>
                    <div className="text-base font-medium text-gray-900">A00123456</div>
                  </div>
                  <div>
                    <div className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Primary Major</div>
                    <div className="text-base font-medium text-gray-900">Computer Science</div>
                  </div>
                  <div>
                    <div className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Classification</div>
                    <div className="text-base font-medium text-gray-900">Junior (64+ Credits)</div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Degree Works Integration Card */}
            <Card className="shadow-sm border-gray-100">
              <CardContent className="p-6">
                <h2 className="text-lg font-bold text-gray-900 mb-4">Degree Works Integration</h2>
                <div className="border-2 border-dashed border-gray-200 rounded-xl bg-gray-50/50 p-10 flex flex-col items-center justify-center text-center">
                  <div className="h-14 w-14 rounded-full bg-[#78103A]/10 flex items-center justify-center mb-4">
                    <Upload className="h-6 w-6 text-[#78103A]" />
                  </div>
                  <h3 className="text-lg font-bold text-gray-900">Upload Your Degree Audit</h3>
                  <p className="mt-2 max-w-sm text-sm text-gray-500">
                    Upload your PDF from Degree Works to automatically sync your completed courses and remaining requirements.
                  </p>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="application/pdf"
                    className="hidden"
                    onChange={handleFileSelection}
                  />
                  <button
                    type="button"
                    onClick={handleOpenFilePicker}
                    disabled={isUploading}
                    className="mt-6 rounded-md bg-[#78103A] px-6 py-2.5 text-sm font-semibold text-white shadow hover:bg-[#600d2e] transition-colors cursor-pointer disabled:cursor-not-allowed disabled:opacity-70"
                  >
                    {isUploading ? "Uploading..." : "Select PDF File"}
                  </button>
                  {uploadSuccess ? (
                    <p className="mt-4 text-sm font-semibold text-emerald-700">{uploadSuccess}</p>
                  ) : null}
                  {uploadError ? (
                    <p className="mt-4 text-sm font-semibold text-red-700">{uploadError}</p>
                  ) : null}
                </div>
              </CardContent>
            </Card>

            {/* Completed Courses Card */}
            <Card className="shadow-sm border-gray-100">
              <CardContent className="p-6">
                <div className="flex items-center justify-between mb-6">
                  <h2 className="text-lg font-bold text-gray-900">Completed Courses</h2>
                  <div className="flex items-center gap-1.5 text-sm font-bold text-emerald-600">
                    <CheckCircle2 className="h-4 w-4" />
                    {courses.length} Courses Verified
                  </div>
                </div>
                
                <div className="overflow-x-auto">
                  <table className="w-full text-sm text-left">
                    <thead>
                      <tr className="border-b border-gray-100">
                        <th className="pb-3 text-xs font-bold text-gray-400 uppercase tracking-wider">Course Code</th>
                        <th className="pb-3 text-xs font-bold text-gray-400 uppercase tracking-wider">Course Name</th>
                        <th className="pb-3 text-xs font-bold text-gray-400 uppercase tracking-wider text-center">Credits</th>
                        <th className="pb-3 text-xs font-bold text-gray-400 uppercase tracking-wider text-center">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {isLoadingCourses ? (
                        <tr>
                          <td colSpan={4} className="py-8 text-center text-sm font-medium text-gray-500">
                            Loading completed courses...
                          </td>
                        </tr>
                      ) : coursesError ? (
                        <tr>
                          <td colSpan={4} className="py-8 text-center text-sm font-medium text-red-700">
                            {coursesError}
                          </td>
                        </tr>
                      ) : courses.length === 0 ? (
                        <tr>
                          <td colSpan={4} className="py-8 text-center text-sm font-medium text-gray-500">
                            No completed courses mapped yet. Upload a DegreeWorks PDF to sync.
                          </td>
                        </tr>
                      ) : (
                        courses.map((course) => (
                          <tr key={course.code}>
                            <td className="py-4 font-bold text-[#78103A] whitespace-nowrap">{course.code}</td>
                            <td className="py-4 font-medium text-gray-900">{course.title}</td>
                            <td className="py-4 text-center font-medium text-gray-600">{course.creditHours}</td>
                            <td className="py-4 text-center">
                              <span className="inline-flex items-center justify-center rounded bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-700">
                                Verified
                              </span>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
                
                <div className="mt-6 text-center">
                  <button className="text-sm font-bold text-[#78103A] hover:underline cursor-pointer">
                    View full academic transcript
                  </button>
                </div>
              </CardContent>
            </Card>

            {/* Sign Out Card */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 rounded-xl border border-red-100 bg-red-50/50 p-6">
              <div className="flex items-start gap-3">
                <AlertCircle className="h-5 w-5 text-red-600 mt-0.5" />
                <div>
                  <h3 className="text-base font-bold text-red-900">Sign Out of All Devices</h3>
                  <p className="text-sm text-red-700 mt-0.5">Protect your academic records by signing out when finished.</p>
                </div>
              </div>
              <button className="whitespace-nowrap rounded-md border border-red-200 bg-white px-4 py-2 text-sm font-bold text-red-700 shadow-sm hover:bg-red-50 transition-colors cursor-pointer">
                Secure Logout
              </button>
            </div>

          </div>
        </div>
      </main>
    </div>
  )
}