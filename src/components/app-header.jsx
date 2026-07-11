"use client"

import { cn } from "@/lib/utils"
import { CustomSidebarTrigger } from "@/components/custom-sidebar-trigger"
import { NavUser } from "@/components/nav-user"

export function AppHeader() {
  return (
    <header className={cn("mb-6 flex items-center justify-between gap-2")}>
      <div className="flex items-center gap-2">
        <CustomSidebarTrigger />
        <h1 className="text-lg font-semibold tracking-tight">Dashboard</h1>
      </div>
      <div className="flex items-center gap-3">
        <NavUser />
      </div>
    </header>
  )
}
