"use client"

import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { Sidebar } from "@/components/layout/sidebar"

const settingsSections = [
  {
    title: "Profile",
    description: "Manage your account information",
  },
  {
    title: "Notifications",
    description: "Configure notification preferences",
  },
  {
    title: "Appearance",
    description: "Customize the look and feel",
  },
  {
    title: "Privacy",
    description: "Control your data and privacy settings",
  },
  {
    title: "Help & Support",
    description: "Get help and contact support",
  },
]

export default function SettingsPage() {
  return (
    <div className="flex min-h-screen">
      <Sidebar />

      <main className="flex-1 px-4 py-6 md:px-6 lg:px-8">
        <div className="mx-auto max-w-2xl space-y-6">
          <p className="text-muted-foreground">
            Manage your account and application preferences
          </p>

          <Separator />

          <div className="space-y-3">
            {settingsSections.map((section) => (
              <Card
                key={section.title}
                className="cursor-pointer transition-all hover:border-primary/50 hover:shadow-sm"
              >
                <CardHeader className="py-4">
                  <CardTitle className="text-base">{section.title}</CardTitle>
                  <CardDescription>{section.description}</CardDescription>
                </CardHeader>
              </Card>
            ))}
          </div>

          <Separator />

          <div className="text-center text-sm text-muted-foreground">
            <p>On Track v1.0.0</p>
            <p className="mt-1">Course planning made simple</p>
          </div>
        </div>
      </main>
    </div>
  )
}
