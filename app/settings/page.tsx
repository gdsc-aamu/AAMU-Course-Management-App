"use client"

import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"

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
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-50 border-b bg-background/95 backdrop-blur">
        <div className="flex h-14 items-center gap-4 px-4 md:px-6">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/">
              <ArrowLeft className="h-4 w-4" />
              <span className="sr-only">Back to dashboard</span>
            </Link>
          </Button>
          <h1 className="text-lg font-semibold">Settings</h1>
        </div>
      </header>

      <main className="px-4 py-6 md:px-6 lg:px-8">
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
