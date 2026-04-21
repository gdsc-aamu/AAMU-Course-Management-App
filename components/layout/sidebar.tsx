"use client"

import { useState } from "react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { Menu, X } from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  Sheet,
  SheetContent,
  SheetTrigger,
  SheetClose,
  SheetTitle,
} from "@/components/ui/sheet"

const navItems = [
  { label: "Dashboard", href: "/dashboard" },
  { label: "My Plans", href: "/plans" },
  { label: "Settings", href: "/settings" },
]

function NavContent() {
  const pathname = usePathname()
  const router = useRouter()
  const supabase = createClient()

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    router.push("/login")
  }

  return (
    <div className="flex flex-col h-full">
      <nav className="flex-1 px-4 pt-8 space-y-1">
        {navItems.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "flex items-center rounded-lg px-4 py-3 text-base font-semibold transition-colors",
              pathname === item.href
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            )}
          >
            {item.label}
          </Link>
        ))}
      </nav>

      <div className="px-4 py-4">
        <button
          onClick={handleSignOut}
          className="w-full flex items-center rounded-lg px-4 py-3 text-base font-semibold text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
        >
          Sign Out
        </button>
      </div>
    </div>
  )
}

export function Sidebar() {
  const [open, setOpen] = useState(false)

  return (
    <>
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex h-screen w-72 flex-col border-r bg-background sticky top-0 shrink-0">
        <div className="flex items-center gap-3 px-6 py-5">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground font-bold text-sm">
            OT
          </div>
          <span className="text-xl font-bold tracking-tight">ON TRACK</span>
        </div>

        <NavContent />
      </aside>

      {/* Mobile Navigation */}
      <div className="lg:hidden fixed top-0 left-0 right-0 z-40 border-b bg-background px-4 py-3 flex items-center justify-between">
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon">
              <Menu className="h-6 w-6" />
              <span className="sr-only">Open menu</span>
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-64 p-0">
            <SheetTitle className="sr-only">Navigation Menu</SheetTitle>
            <div className="flex items-center gap-3 px-6 py-5 border-b">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground font-bold text-sm">
                OT
              </div>
              <span className="text-xl font-bold tracking-tight">ON TRACK</span>
            </div>
            <div className="p-4">
              <NavContent />
            </div>
          </SheetContent>
        </Sheet>

        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground font-bold text-sm">
            OT
          </div>
          <span className="text-lg font-bold tracking-tight">ON TRACK</span>
        </div>
      </div>

      {/* Mobile padding to account for fixed header */}
      <div className="lg:hidden h-16" />
    </>
  )
}
