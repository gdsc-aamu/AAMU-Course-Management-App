"use client"

import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { Card, CardContent } from "@/components/ui/card"
import { Sidebar } from "@/components/layout/sidebar"
import { Search, Upload, CheckCircle2, AlertCircle, Loader2 } from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { profileCache, coursesCache, invalidateAfterUpload, invalidateAfterProfileSave } from "@/lib/app-cache"

const supabase = createClient()

interface CompletedCourseRow {
  code: string
  title: string
  creditHours: number
}

interface UserProfile {
  fullName: string | null
  classification: string | null
  programCode: string | null
  bulletinYear: string | null
  concentrationCode: string | null
}

interface ProgramOption {
  code: string
  name: string
  catalogYear: number
}

interface ConcentrationOption {
  code: string
  name: string
  type: "concentration" | "minor"
  totalHours: number
}

export default function SettingsPage() {
  const router = useRouter()
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [isUploading, setIsUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [uploadSuccess, setUploadSuccess] = useState<string | null>(null)
  const [courses, setCourses] = useState<CompletedCourseRow[]>([])
  const [isLoadingCourses, setIsLoadingCourses] = useState(true)
  const [coursesError, setCoursesError] = useState<string | null>(null)
  
  // Profile state
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [isLoadingProfile, setIsLoadingProfile] = useState(true)
  const [profileError, setProfileError] = useState<string | null>(null)
  const [programs, setPrograms] = useState<ProgramOption[]>([])
  const [isLoadingPrograms, setIsLoadingPrograms] = useState(true)
  
  // Edit modal state
  const [isEditingProfile, setIsEditingProfile] = useState(false)
  const [editFormData, setEditFormData] = useState({ programCode: "", bulletinYear: "", classification: "", concentrationCode: "" })
  const [isSavingProfile, setIsSavingProfile] = useState(false)
  const [profileSaveError, setProfileSaveError] = useState<string | null>(null)
  const [profileSaveSuccess, setProfileSaveSuccess] = useState<string | null>(null)
  const [concentrations, setConcentrations] = useState<ConcentrationOption[]>([])
  const [isLoadingConcentrations, setIsLoadingConcentrations] = useState(false)

  // Enrollment & Financial Aid state
  const [isInternational, setIsInternational] = useState(false)
  const [scholarshipType, setScholarshipType] = useState('')
  const [scholarshipName, setScholarshipName] = useState('')
  const [scholarshipMinGpa, setScholarshipMinGpa] = useState('')
  const [scholarshipMinCreditsPerYear, setScholarshipMinCreditsPerYear] = useState('')
  const [isSavingEnrollment, setIsSavingEnrollment] = useState(false)
  const [enrollmentSaveSuccess, setEnrollmentSaveSuccess] = useState(false)
  const [enrollmentSaveError, setEnrollmentSaveError] = useState('')
  const [isEditingEnrollment, setIsEditingEnrollment] = useState(false)

  const savedEnrollmentRef = useRef({
    isInternational: false,
    scholarshipType: '',
    scholarshipName: '',
    scholarshipMinGpa: '',
    scholarshipMinCreditsPerYear: '',
  })

  async function loadUserProfile() {
    setProfileError(null)

    try {
      const { data, error } = await supabase.auth.getSession()
      if (error || !data.session?.access_token) throw new Error("You need to be signed in to view your profile.")
      const uid = data.session.user.id

      const { data: authData } = await supabase.auth.getUser()
      const fullName = authData.user?.user_metadata?.full_name || authData.user?.email || "Student"

      const fetchFresh = async () => {
        const response = await fetch("/api/user/academic-profile", {
          method: "GET",
          headers: { Authorization: `Bearer ${data.session!.access_token}` },
        })
        const payload = (await response.json()) as { success: boolean; error?: string; profile?: any }
        if (!response.ok || !payload.success) throw new Error(payload.error ?? "Failed to fetch user profile.")
        const p = payload.profile ?? { classification: null, programCode: null, bulletinYear: null, concentrationCode: null }
        const result = {
          fullName,
          classification: p.classification ?? null,
          programCode: p.programCode ?? null,
          bulletinYear: p.bulletinYear ?? null,
          concentrationCode: p.concentrationCode ?? null,
        }
        // Set enrollment fields from response
        const enrollSnap = {
          isInternational: p.is_international ?? false,
          scholarshipType: p.scholarship_type ?? '',
          scholarshipName: p.scholarship_name ?? '',
          scholarshipMinGpa: p.scholarship_min_gpa?.toString() ?? '',
          scholarshipMinCreditsPerYear: p.scholarship_min_credits_per_year?.toString() ?? '',
        }
        setIsInternational(enrollSnap.isInternational)
        setScholarshipType(enrollSnap.scholarshipType)
        setScholarshipName(enrollSnap.scholarshipName)
        setScholarshipMinGpa(enrollSnap.scholarshipMinGpa)
        setScholarshipMinCreditsPerYear(enrollSnap.scholarshipMinCreditsPerYear)
        savedEnrollmentRef.current = enrollSnap
        profileCache.write(uid, result)
        return result
      }

      const cached = profileCache.read(uid)
      if (cached) {
        // Serve cache instantly, revalidate in background
        setProfile({ ...cached, fullName, concentrationCode: (cached as any).concentrationCode ?? null })
        setIsLoadingProfile(false)
        fetchFresh().then(fresh => setProfile(fresh)).catch(() => {})
        return
      }

      setIsLoadingProfile(true)
      const fresh = await fetchFresh()
      setProfile(fresh)
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unexpected profile load error"
      setProfileError(message)
    } finally {
      setIsLoadingProfile(false)
    }
  }

  async function loadAvailablePrograms() {
    setIsLoadingPrograms(true)

    try {
      const response = await fetch("/api/curriculum/programs")
      const payload = (await response.json()) as {
        success: boolean
        programs?: ProgramOption[]
        error?: string
      }

      if (!response.ok || !payload.success) {
        throw new Error(payload.error ?? "Failed to fetch programs.")
      }

      setPrograms(payload.programs ?? [])
    } catch (error) {
      console.error("Failed to load programs:", error)
    } finally {
      setIsLoadingPrograms(false)
    }
  }

  async function loadConcentrations(programCode: string) {
    if (!programCode) {
      setConcentrations([])
      return
    }
    setIsLoadingConcentrations(true)
    try {
      const response = await fetch(`/api/curriculum/concentrations?programCode=${encodeURIComponent(programCode)}`)
      const payload = (await response.json()) as {
        success: boolean
        concentrations?: ConcentrationOption[]
        error?: string
      }
      setConcentrations(payload.concentrations ?? [])
    } catch {
      setConcentrations([])
    } finally {
      setIsLoadingConcentrations(false)
    }
  }

  async function handleSaveProfile() {
    setProfileSaveError(null)
    setProfileSaveSuccess(null)
    setIsSavingProfile(true)

    try {
      const { data, error } = await supabase.auth.getSession()
      if (error || !data.session?.access_token) {
        throw new Error("You need to be signed in to update your profile.")
      }

      const response = await fetch("/api/user/academic-profile", {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${data.session.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          programCode: editFormData.programCode || null,
          bulletinYear: editFormData.bulletinYear || null,
          classification: editFormData.classification || null,
          concentrationCode: editFormData.concentrationCode || null,
        }),
      })

      const payload = (await response.json()) as {
        success: boolean
        error?: string
        profile?: UserProfile & { concentrationCode?: string | null }
      }

      if (!response.ok || !payload.success) {
        throw new Error(payload.error ?? "Failed to save profile.")
      }

      if (payload.profile) {
        setProfile({
          fullName: profile?.fullName ?? null,
          classification: payload.profile.classification ?? null,
          programCode: payload.profile.programCode ?? null,
          bulletinYear: payload.profile.bulletinYear ?? null,
          concentrationCode: payload.profile.concentrationCode ?? null,
        })
      }
      invalidateAfterProfileSave(data.session.user.id)
      setProfileSaveSuccess("Profile updated successfully!")
      setIsEditingProfile(false)
      setTimeout(() => setProfileSaveSuccess(null), 3000)
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unexpected save error"
      setProfileSaveError(message)
    } finally {
      setIsSavingProfile(false)
    }
  }

  function handleEditClick() {
    const programCode = profile?.programCode || ""
    setEditFormData({
      programCode,
      bulletinYear: profile?.bulletinYear || "",
      classification: profile?.classification || "",
      concentrationCode: profile?.concentrationCode || "",
    })
    setProfileSaveError(null)
    setProfileSaveSuccess(null)
    setIsEditingProfile(true)
    void loadConcentrations(programCode)
  }

  function handleCancelEdit() {
    setIsEditingProfile(false)
    setProfileSaveError(null)
    setProfileSaveSuccess(null)
  }

  const handleSaveEnrollment = async () => {
    setIsSavingEnrollment(true)
    setEnrollmentSaveError('')
    setEnrollmentSaveSuccess(false)
    try {
      const { data: sessData, error: sessErr } = await supabase.auth.getSession()
      if (sessErr || !sessData.session?.access_token) throw new Error('You need to be signed in.')
      const res = await fetch('/api/user/academic-profile', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${sessData.session.access_token}`,
        },
        body: JSON.stringify({
          isInternational,
          scholarshipType: scholarshipType || null,
          scholarshipName: scholarshipName || null,
          scholarshipMinGpa: scholarshipMinGpa ? parseFloat(scholarshipMinGpa) : null,
          scholarshipMinCreditsPerYear: scholarshipMinCreditsPerYear ? parseInt(scholarshipMinCreditsPerYear) : null,
        }),
      })
      if (!res.ok) throw new Error('Failed to save')
      savedEnrollmentRef.current = {
        isInternational,
        scholarshipType,
        scholarshipName,
        scholarshipMinGpa,
        scholarshipMinCreditsPerYear,
      }
      setEnrollmentSaveSuccess(true)
      setIsEditingEnrollment(false)
      setTimeout(() => setEnrollmentSaveSuccess(false), 3000)
    } catch (e: any) {
      setEnrollmentSaveError(e.message ?? 'Error saving enrollment info')
    } finally {
      setIsSavingEnrollment(false)
    }
  }

  function handleCancelEnrollment() {
    setIsEditingEnrollment(false)
    setEnrollmentSaveError('')
    const snap = savedEnrollmentRef.current
    setIsInternational(snap.isInternational)
    setScholarshipType(snap.scholarshipType)
    setScholarshipName(snap.scholarshipName)
    setScholarshipMinGpa(snap.scholarshipMinGpa)
    setScholarshipMinCreditsPerYear(snap.scholarshipMinCreditsPerYear)
  }

  async function loadCompletedCourses() {
    setCoursesError(null)

    try {
      const { data, error } = await supabase.auth.getSession()
      if (error || !data.session?.access_token) throw new Error("You need to be signed in to view completed courses.")
      const uid = data.session.user.id

      const fetchFresh = async () => {
        const response = await fetch("/api/degreeworks/completed-courses", {
          method: "GET",
          headers: { Authorization: `Bearer ${data.session!.access_token}` },
        })
        const payload = (await response.json()) as { success: boolean; error?: string; courses?: CompletedCourseRow[] }
        if (!response.ok || !payload.success) throw new Error(payload.error ?? "Failed to fetch completed courses.")
        const result = payload.courses ?? []
        coursesCache.write(uid, result.map(c => ({
          courseId: c.code, title: c.title, grade: "", credits: c.creditHours,
          term: "", status: "", section: "",
        })))
        return result
      }

      const cached = coursesCache.read(uid)
      if (cached) {
        // Reconstruct CompletedCourseRow from cache
        setCourses(cached.map(c => ({ code: c.courseId, title: c.title, creditHours: c.credits })))
        setIsLoadingCourses(false)
        fetchFresh().then(fresh => setCourses(fresh)).catch(() => {})
        return
      }

      setIsLoadingCourses(true)
      const fresh = await fetchFresh()
      setCourses(fresh)
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unexpected load error"
      setCoursesError(message)
    } finally {
      setIsLoadingCourses(false)
    }
  }

  useEffect(() => {
    void loadUserProfile()
    void loadAvailablePrograms()
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
      const { data: sess } = await supabase.auth.getSession()
      if (sess.session?.user.id) invalidateAfterUpload(sess.session.user.id)
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

  const topProfileName = profile?.fullName?.trim() || "Student"
  const topProfileMajor =
    programs.find((p) => p.code === profile?.programCode)?.name || profile?.programCode || "Major not set"
  const topProfileClassification =
    profile?.classification && profile.classification.trim().length > 0
      ? profile.classification.trim().toUpperCase()
      : "UNCLASSIFIED"
  const topProfileMeta = `${topProfileClassification} • ${topProfileMajor}`
  const topProfileInitials = topProfileName
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("") || "ST"

  return (
    <div className="flex flex-col lg:flex-row min-h-screen bg-[#fafafa]">
      <Sidebar />
      
      <main className="flex-1 px-8 py-6">
        <div className="mx-auto max-w-5xl space-y-8">
          
          {/* Top Navigation Bar */}
          <div className="flex items-center justify-between border-b pb-4">
            <div className="relative w-full max-w-md">
              
            </div>
            <div className="flex items-center gap-4">
              <div className="text-right hidden md:block">
                <div className="text-sm font-bold text-foreground">{topProfileName}</div>
                <div className="text-[10px] font-semibold text-muted-foreground tracking-wider">
                  {topProfileMeta}
                </div>
              </div>
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#78103A] text-sm font-bold text-white shadow-sm">
                {topProfileInitials}
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
                  <h2 className="text-lg font-bold text-gray-900">Academic Profile</h2>
                  <button
                    onClick={handleEditClick}
                    disabled={isLoadingProfile}
                    className="text-sm font-bold text-[#78103A] hover:underline cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Edit Profile
                  </button>
                </div>

                {isLoadingProfile ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-5 w-5 animate-spin text-[#78103A]" />
                    <span className="ml-2 text-sm text-gray-500">Loading profile...</span>
                  </div>
                ) : profileError ? (
                  <div className="rounded-md bg-red-50 p-4">
                    <p className="text-sm font-medium text-red-700">{profileError}</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-y-6 gap-x-12">
                    <div>
                      <div className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Full Name</div>
                      <div className="text-base font-medium text-gray-900">
                        {profile?.fullName || "Not set"}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Classification</div>
                      <div className="text-base font-medium text-gray-900">
                        {profile?.classification || "Not set"}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Primary Major</div>
                      <div className="text-base font-medium text-gray-900">
                        {programs.find((p) => p.code === profile?.programCode)?.name || profile?.programCode || "Not set"}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Catalog Year</div>
                      <div className="text-base font-medium text-gray-900">
                        {profile?.bulletinYear || "Not set"}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Concentration / Minor</div>
                      <div className="text-base font-medium text-gray-900">
                        {profile?.concentrationCode || "None declared"}
                      </div>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Enrollment & Financial Aid Card */}
            <Card className="shadow-sm border-gray-100">
              <CardContent className="p-6">
                <div className="flex items-center justify-between mb-6">
                  <div>
                    <h2 className="text-lg font-bold text-gray-900">Enrollment &amp; Financial Aid</h2>
                    <p className="mt-1 text-sm text-gray-500">
                      Used by your AI advisor to provide accurate credit and scholarship guidance.
                    </p>
                  </div>
                  {!isEditingEnrollment && (
                    <button
                      onClick={() => setIsEditingEnrollment(true)}
                      className="text-sm font-bold text-[#78103A] hover:underline cursor-pointer"
                    >
                      Edit
                    </button>
                  )}
                </div>

                {isEditingEnrollment ? (
                  <div className="space-y-6">
                    {/* International Student Checkbox */}
                    <div>
                      <label className="flex items-center gap-3 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={isInternational}
                          onChange={(e) => setIsInternational(e.target.checked)}
                          className="h-4 w-4 rounded border-gray-300 text-[#78103A] accent-[#78103A] cursor-pointer"
                        />
                        <span className="text-sm font-medium text-gray-900">I am an international student</span>
                      </label>
                      {isInternational && (
                        <p className="mt-2 ml-7 text-xs text-amber-700 bg-amber-50 rounded-md px-3 py-2">
                          International students must maintain at least 12 credits/semester (9 in-person). Summer minimum: 3 credits.
                        </p>
                      )}
                    </div>

                    {/* Scholarship Type */}
                    <div>
                      <label className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2 block">
                        Scholarship Type
                      </label>
                      <select
                        value={scholarshipType}
                        onChange={(e) => setScholarshipType(e.target.value)}
                        className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#78103A] focus:border-transparent"
                      >
                        <option value="">None / Not applicable</option>
                        <option value="AAMU Presidential Scholarship">AAMU Presidential Scholarship</option>
                        <option value="AAMU Academic Excellence Scholarship">AAMU Academic Excellence Scholarship</option>
                        <option value="AAMU Achievers Scholarship">AAMU Achievers Scholarship</option>
                        <option value="AAMU Bulldog Scholarship">AAMU Bulldog Scholarship</option>
                        <option value="AAMU Transfer Scholarship">AAMU Transfer Scholarship</option>
                        <option value="AAMU STEM Scholarship">AAMU STEM Scholarship</option>
                        <option value="AAMU Need-Based Grant">AAMU Need-Based Grant</option>
                        <option value="AAMU Athletic Scholarship">AAMU Athletic Scholarship</option>
                        <option value="External Scholarship">External Scholarship</option>
                      </select>
                    </div>

                    {/* External Scholarship Fields */}
                    {scholarshipType === 'External Scholarship' && (
                      <div className="space-y-4 rounded-lg border border-gray-100 bg-gray-50/50 p-4">
                        <div>
                          <label className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2 block">
                            Scholarship Name
                          </label>
                          <input
                            type="text"
                            value={scholarshipName}
                            onChange={(e) => setScholarshipName(e.target.value)}
                            placeholder="e.g. Gates Scholarship"
                            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#78103A] focus:border-transparent"
                          />
                        </div>
                        <div>
                          <label className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2 block">
                            Minimum GPA Required
                          </label>
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            max="4"
                            value={scholarshipMinGpa}
                            onChange={(e) => setScholarshipMinGpa(e.target.value)}
                            placeholder="e.g. 3.50"
                            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#78103A] focus:border-transparent"
                          />
                        </div>
                        <div>
                          <label className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2 block">
                            Minimum Credits Per Year
                          </label>
                          <input
                            type="number"
                            min="0"
                            value={scholarshipMinCreditsPerYear}
                            onChange={(e) => setScholarshipMinCreditsPerYear(e.target.value)}
                            placeholder="e.g. 24"
                            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#78103A] focus:border-transparent"
                          />
                        </div>
                      </div>
                    )}

                    {/* Save / Cancel Buttons */}
                    <div className="flex gap-3">
                      <button
                        type="button"
                        onClick={handleCancelEnrollment}
                        disabled={isSavingEnrollment}
                        className="rounded-md border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={handleSaveEnrollment}
                        disabled={isSavingEnrollment}
                        className="rounded-md bg-[#78103A] px-6 py-2.5 text-sm font-semibold text-white shadow hover:bg-[#600d2e] transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                      >
                        {isSavingEnrollment && <Loader2 className="h-4 w-4 animate-spin" />}
                        Save Enrollment Info
                      </button>
                    </div>
                    {enrollmentSaveError && (
                      <p className="text-sm font-semibold text-red-700">{enrollmentSaveError}</p>
                    )}
                  </div>
                ) : (
                  /* Read-only view */
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-y-6 gap-x-12">
                    <div>
                      <div className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">International Student</div>
                      <div className="text-base font-medium text-gray-900">
                        {isInternational ? "Yes" : "No"}
                      </div>
                      {isInternational && (
                        <p className="mt-1 text-xs text-amber-700">
                          Must maintain 12+ credits/semester (9 in-person)
                        </p>
                      )}
                    </div>
                    <div>
                      <div className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Scholarship</div>
                      <div className="text-base font-medium text-gray-900">
                        {scholarshipType || "None"}
                      </div>
                      {scholarshipType === 'External Scholarship' && scholarshipName && (
                        <div className="text-sm text-gray-500 mt-0.5">{scholarshipName}</div>
                      )}
                    </div>
                    {scholarshipType === 'External Scholarship' && (scholarshipMinGpa || scholarshipMinCreditsPerYear) && (
                      <>
                        {scholarshipMinGpa && (
                          <div>
                            <div className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Min GPA Required</div>
                            <div className="text-base font-medium text-gray-900">{scholarshipMinGpa}</div>
                          </div>
                        )}
                        {scholarshipMinCreditsPerYear && (
                          <div>
                            <div className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Min Credits/Year</div>
                            <div className="text-base font-medium text-gray-900">{scholarshipMinCreditsPerYear}</div>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                )}
                {enrollmentSaveSuccess && !isEditingEnrollment && (
                  <p className="mt-4 text-sm font-semibold text-emerald-700">Enrollment info saved successfully!</p>
                )}
              </CardContent>
            </Card>

            {/* Edit Profile Modal */}
            {isEditingProfile && (
              <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center">
                <Card className="w-full max-w-md shadow-lg">
                  <CardContent className="p-6">
                    <h2 className="text-lg font-bold text-gray-900 mb-6">Edit Academic Profile</h2>

                    {profileSaveError && (
                      <div className="mb-4 rounded-md bg-red-50 p-4">
                        <p className="text-sm font-medium text-red-700">{profileSaveError}</p>
                      </div>
                    )}

                    {profileSaveSuccess && (
                      <div className="mb-4 rounded-md bg-emerald-50 p-4">
                        <p className="text-sm font-medium text-emerald-700">{profileSaveSuccess}</p>
                      </div>
                    )}

                    <div className="space-y-4">
                      {/* Program Selector */}
                      <div>
                        <label className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2 block">
                          Primary Major
                        </label>
                        <select
                          value={editFormData.programCode}
                          onChange={(e) => {
                            const code = e.target.value
                            setEditFormData({ ...editFormData, programCode: code, concentrationCode: "" })
                            void loadConcentrations(code)
                          }}
                          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#78103A] focus:border-transparent"
                        >
                          <option value="">Select a major...</option>
                          {isLoadingPrograms ? (
                            <option disabled>Loading programs...</option>
                          ) : (
                            programs.map((prog) => (
                              <option key={`${prog.code}-${prog.catalogYear}`} value={prog.code}>
                                {prog.name} ({prog.code})
                              </option>
                            ))
                          )}
                        </select>
                      </div>

                      {/* Bulletin Year Selector */}
                      <div>
                        <label className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2 block">
                          Catalog Year
                        </label>
                        <select
                          value={editFormData.bulletinYear}
                          onChange={(e) => setEditFormData({ ...editFormData, bulletinYear: e.target.value })}
                          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#78103A] focus:border-transparent"
                        >
                          <option value="">Select a catalog year...</option>
                          {/* Alias years — resolved to next year at backend; no direct DB entry */}
                          <option value="2024-2025">2024-2025</option>
                          {programs
                            .filter((p) => !editFormData.programCode || p.code === editFormData.programCode)
                            .reduce((acc, p) => {
                              if (!acc.includes(String(p.catalogYear))) {
                                acc.push(String(p.catalogYear))
                              }
                              return acc
                            }, [] as string[])
                            .map((year) => {
                              const y = parseInt(year)
                              const label = isNaN(y) ? year : `${y}-${y + 1}`
                              const value = isNaN(y) ? year : `${y}-${y + 1}`
                              return (
                                <option key={year} value={value}>
                                  {label}
                                </option>
                              )
                            })}
                        </select>
                      </div>
                      
                        {/* Classification Selector */}
                        <div>
                          <label className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2 block">
                            Classification
                          </label>
                          <select
                            value={editFormData.classification}
                            onChange={(e) => setEditFormData({ ...editFormData, classification: e.target.value })}
                            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#78103A] focus:border-transparent"
                          >
                            <option value="">Select classification...</option>
                            <option value="freshman">Freshman</option>
                            <option value="sophomore">Sophomore</option>
                            <option value="junior">Junior</option>
                            <option value="senior">Senior</option>
                          </select>
                        </div>

                        {/* Concentration / Minor Selector */}
                        <div>
                          <label className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2 block">
                            Concentration / Minor
                          </label>
                          <select
                            value={editFormData.concentrationCode}
                            onChange={(e) => setEditFormData({ ...editFormData, concentrationCode: e.target.value })}
                            disabled={isLoadingConcentrations || !editFormData.programCode}
                            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#78103A] focus:border-transparent disabled:bg-gray-50 disabled:text-gray-400"
                          >
                            <option value="">
                              {!editFormData.programCode
                                ? "Select a major first..."
                                : isLoadingConcentrations
                                ? "Loading..."
                                : concentrations.length === 0
                                ? "None available"
                                : "None / Not declared"}
                            </option>
                            {concentrations
                              .filter((c) => c.type === "concentration")
                              .length > 0 && (
                              <optgroup label="Concentrations">
                                {concentrations
                                  .filter((c) => c.type === "concentration")
                                  .map((c) => (
                                    <option key={c.code} value={c.code}>
                                      {c.name} ({c.code})
                                    </option>
                                  ))}
                              </optgroup>
                            )}
                            {concentrations
                              .filter((c) => c.type === "minor")
                              .length > 0 && (
                              <optgroup label="Minors">
                                {concentrations
                                  .filter((c) => c.type === "minor")
                                  .map((c) => (
                                    <option key={c.code} value={c.code}>
                                      {c.name} ({c.code})
                                    </option>
                                  ))}
                              </optgroup>
                            )}
                          </select>
                          {!editFormData.programCode && (
                            <p className="mt-1 text-xs text-gray-400">
                              Select your major to see available concentrations and minors.
                            </p>
                          )}
                        </div>
                    </div>

                    <div className="mt-6 flex gap-3">
                      <button
                        type="button"
                        onClick={handleCancelEdit}
                        disabled={isSavingProfile}
                        className="flex-1 rounded-md border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={handleSaveProfile}
                        disabled={isSavingProfile}
                        className="flex-1 rounded-md bg-[#78103A] px-4 py-2 text-sm font-semibold text-white hover:bg-[#600d2e] transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                      >
                        {isSavingProfile && <Loader2 className="h-4 w-4 animate-spin" />}
                        Save Changes
                      </button>
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}

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
              <button onClick={async () => { await supabase.auth.signOut(); router.push("/login"); }} className="whitespace-nowrap rounded-md border border-red-200 bg-white px-4 py-2 text-sm font-bold text-red-700 shadow-sm hover:bg-red-50 transition-colors cursor-pointer">
                Secure Logout
              </button>
            </div>

          </div>
        </div>
      </main>
    </div>
  )
}