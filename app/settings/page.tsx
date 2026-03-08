"use client"

import Link from "next/link"
import { ArrowLeft, User, Bell, Palette, Shield, HelpCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"

const settingsSections = [
  {
    icon: User,
    title: "Profile",
    description: "Manage your account information",
  },
  {
    icon: Bell,
    title: "Notifications",
    description: "Configure notification preferences",
  },
  {
    icon: Palette,
    title: "Appearance",
    description: "Customize the look and feel",
  },
  {
    icon: Shield,
    title: "Privacy",
    description: "Control your data and privacy settings",
  },
  {
    icon: HelpCircle,
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
          <div>
            <h2 className="text-2xl font-bold tracking-tight">Settings</h2>
            <p className="text-muted-foreground">
              Manage your account and application preferences
            </p>
          </div>
          
          <Separator />
          
          <div className="space-y-4">
            {settingsSections.map((section) => (
              <Card 
                key={section.title}
                className="cursor-pointer transition-all hover:border-primary/50 hover:shadow-sm"
              >
                <CardHeader className="pb-3">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
                      <section.icon className="h-5 w-5 text-muted-foreground" />
                    </div>
                    <div>
                      <CardTitle className="text-base">{section.title}</CardTitle>
                      <CardDescription>{section.description}</CardDescription>
                    </div>
                  </div>
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
