"use client"

import { useState, useRef } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Sidebar } from "@/components/layout/sidebar"
import { Upload, CheckCircle2, AlertCircle, FileText } from "lucide-react"

export default function SettingsPage() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (file) {
      setSelectedFile(file)
      console.log("File selected:", file.name)
    }
  }

  const handleUploadClick = () => {
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
                  
                  {/* Hidden file input */}
                  <input
                    type="file"
                    accept=".pdf"
                    className="hidden"
                    ref={fileInputRef}
                    onChange={handleFileChange}
                  />

                  {selectedFile ? (
                    <div className="flex flex-col items-center">
                      <div className="h-14 w-14 rounded-full bg-emerald-50 flex items-center justify-center mb-4">
                        <FileText className="h-6 w-6 text-emerald-600" />
                      </div>
                      <h3 className="text-lg font-bold text-gray-900">Ready to Upload</h3>
                      <p className="mt-2 max-w-sm text-sm font-medium text-emerald-600">
                        {selectedFile.name}
                      </p>
                      <div className="mt-6 flex gap-3">
                        <button 
                          onClick={handleUploadClick}
                          className="rounded-md bg-white border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 shadow-sm hover:bg-gray-50 transition-colors cursor-pointer"
                        >
                          Change File
                        </button>
                        <button className="rounded-md bg-[#78103A] px-6 py-2 text-sm font-semibold text-white shadow hover:bg-[#600d2e] transition-colors cursor-pointer">
                          Sync Audit
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="h-14 w-14 rounded-full bg-[#78103A]/10 flex items-center justify-center mb-4">
                        <Upload className="h-6 w-6 text-[#78103A]" />
                      </div>
                      <h3 className="text-lg font-bold text-gray-900">Upload Your Degree Audit</h3>
                      <p className="mt-2 max-w-sm text-sm text-gray-500">
                        Upload your PDF from Degree Works to automatically sync your completed courses and remaining requirements.
                      </p>
                      <button 
                        onClick={handleUploadClick}
                        className="mt-6 rounded-md bg-[#78103A] px-6 py-2.5 text-sm font-semibold text-white shadow hover:bg-[#600d2e] transition-colors cursor-pointer"
                      >
                        Select PDF File
                      </button>
                    </>
                  )}
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
                    11 Courses Verified
                  </div>
                </div>
                
                <div className="overflow-x-auto">
                  <table className="w-full text-sm text-left">
                    <thead>
                      <tr className="border-b border-gray-100">
                        <th className="pb-3 text-xs font-bold text-gray-400 uppercase tracking-wider">Course Code</th>
                        <th className="pb-3 text-xs font-bold text-gray-400 uppercase tracking-wider">Course Name</th>
                        <th className="pb-3 text-xs font-bold text-gray-400 uppercase tracking-wider text-center">Credits</th>
                        <th className="pb-3 text-xs font-bold text-gray-400 uppercase tracking-wider text-center">Grade</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {[
                        { code: "ENG 101", name: "Composition I", credits: "3", grade: "A" },
                        { code: "MTH 125", name: "Calculus I", credits: "4", grade: "B+" },
                        { code: "ORI 101", name: "First Year Experience", credits: "1", grade: "A" },
                        { code: "HIS 201", name: "US History I", credits: "3", grade: "A-" },
                      ].map((course) => (
                        <tr key={course.code}>
                          <td className="py-4 font-bold text-[#78103A] whitespace-nowrap">{course.code}</td>
                          <td className="py-4 font-medium text-gray-900">{course.name}</td>
                          <td className="py-4 text-center font-medium text-gray-600">{course.credits}</td>
                          <td className="py-4 text-center">
                            <span className="inline-flex items-center justify-center rounded bg-blue-50 px-2.5 py-1 text-xs font-bold text-blue-700">
                              {course.grade}
                            </span>
                          </td>
                        </tr>
                      ))}
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
          </div>
        </div>
      </main>
    </div>
  )
}