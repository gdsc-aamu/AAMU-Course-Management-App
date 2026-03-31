"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"

const navItems = [
  { label: "Dashboard", href: "/dashboard" },
  { label: "My Plans", href: "/plans" },
  { label: "Settings", href: "/settings" },
]

export function Sidebar() {
  const pathname = usePathname()

  return (
    <aside className="flex h-screen w-72 flex-col border-r bg-background sticky top-0 shrink-0">
      <div className="flex items-center gap-3 px-6 py-5">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground font-bold text-sm">
          OT
        </div>
        <span className="text-xl font-bold tracking-tight">ON TRACK</span>
      </div>

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
        <button className="w-full flex items-center rounded-lg px-4 py-3 text-base font-semibold text-muted-foreground hover:bg-muted hover:text-foreground transition-colors">
          Sign Out
        </button>
      </div>
    </aside>
  )
}
