"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { Menu, LayoutDashboard, BookOpen, Settings, LogOut } from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  Sheet,
  SheetContent,
  SheetTrigger,
  SheetTitle,
} from "@/components/ui/sheet"

const navItems = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { label: "My Plans", href: "/plans", icon: BookOpen },
  { label: "Settings", href: "/settings", icon: Settings },
]

function NavContent({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname()
  const router = useRouter()
  const supabase = createClient()

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    router.push("/login")
  }

  return (
    <div className="flex flex-col h-full">
      <nav className="flex-1 px-3 pt-4 space-y-0.5">
        {navItems.map((item) => {
          const Icon = item.icon
          const active = pathname === item.href
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onNavigate}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all",
                active
                  ? "bg-[#A0152A] text-white shadow-sm"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {item.label}
            </Link>
          )
        })}
      </nav>

      <div className="px-3 pb-4 border-t pt-3 mt-3">
        <button
          onClick={handleSignOut}
          className="w-full flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-all"
        >
          <LogOut className="h-4 w-4 shrink-0" />
          Sign Out
        </button>
      </div>
    </div>
  )
}

function Brand() {
  return (
    <div className="flex items-center gap-2.5 px-4 py-4 border-b">
      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#A0152A] text-white font-bold text-xs shrink-0">
        OT
      </div>
      <div>
        <p className="text-sm font-bold tracking-tight leading-none">ON TRACK</p>
        <p className="text-[10px] text-muted-foreground leading-none mt-0.5">AAMU Course Planner</p>
      </div>
    </div>
  )
}


export function Sidebar() {
  const [open, setOpen] = useState(false)
  const [initials, setInitials] = useState("ST")
  const [name, setName] = useState("")
  const supabase = createClient()

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      const fullName = data.session?.user.user_metadata?.full_name ?? data.session?.user.email ?? ""
      setName(fullName)
      const parts = fullName.trim().split(" ")
      setInitials(parts.map((p: string) => p[0] ?? "").join("").toUpperCase().slice(0, 2) || "ST")
    })
  }, [])

  return (
    <>
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex h-screen w-60 flex-col border-r bg-background sticky top-0 shrink-0">
        <Brand />
        <div className="flex-1 overflow-y-auto">
          <NavContent />
        </div>
        <div className="flex items-center gap-2.5 px-4 py-3 border-t bg-muted/30">
          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-[#A0152A] text-white text-xs font-semibold shrink-0">
            {initials}
          </div>
          <p className="text-xs font-medium truncate text-foreground">{name || "Student"}</p>
        </div>
      </aside>

      {/* Mobile: fixed top bar — hamburger | brand | avatar */}
      <div className="lg:hidden fixed top-0 left-0 right-0 z-40 flex items-center border-b bg-background shadow-sm h-12">
        {/* Left — hamburger */}
        <div className="flex items-center pl-3">
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <Menu className="h-5 w-5" />
                <span className="sr-only">Open menu</span>
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-60 p-0 flex flex-col">
              <SheetTitle className="sr-only">Navigation</SheetTitle>
              <Brand />
              <div className="flex-1 overflow-y-auto">
                <NavContent onNavigate={() => setOpen(false)} />
              </div>
              <div className="flex items-center gap-2.5 px-4 py-3 border-t bg-muted/30">
                <div className="flex h-7 w-7 items-center justify-center rounded-full bg-[#A0152A] text-white text-xs font-semibold shrink-0">
                  {initials}
                </div>
                <p className="text-xs font-medium truncate text-foreground">{name || "Student"}</p>
              </div>
            </SheetContent>
          </Sheet>
        </div>

        {/* Center — brand (flex-1 on both sides keeps it centered) */}
        <div className="flex-1 flex items-center justify-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-[#A0152A] text-white font-bold text-xs shrink-0">
            OT
          </div>
          <span className="text-sm font-bold tracking-tight whitespace-nowrap">ON TRACK</span>
        </div>

        {/* Right — avatar */}
        <div className="flex items-center pr-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#A0152A] text-white text-xs font-semibold">
            {initials}
          </div>
        </div>
      </div>

      {/* Mobile spacer */}
      <div className="lg:hidden h-12" />
    </>
  )
}
