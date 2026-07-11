"use client"

import { IconPlaceholder } from "@/components/ui/icon-placeholder"
import { cn } from "@/lib/utils"
import { useState } from "react"
import { Button } from "@/components/ui/button"

const latestChange = {
  badge: "SINCRONIZADO",
  title: "Dentalink conectado",
  description: "Leads sincronizados en tiempo real con Elevator CRM.",
}

export function LatestChange() {
  const [isOpen, setIsOpen] = useState(true)

  if (!isOpen) return null

  return (
    <div
      className={cn(
        "group/latest-change relative mx-3 rounded-lg border border-border bg-card p-3",
      )}>
      <Button
        className="absolute top-2 right-2 z-10 size-6 rounded-full opacity-0 transition-opacity group-hover/latest-change:opacity-100"
        onClick={() => setIsOpen(false)}
        size="icon-sm"
        variant="ghost">
        <IconPlaceholder lucide="X" className="size-3.5 text-muted-foreground" />
      </Button>
      <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-[--lime-pulse]">
        {latestChange.badge}
      </p>
      <p className="mb-0.5 text-sm font-medium">{latestChange.title}</p>
      <p className="text-xs text-muted-foreground">{latestChange.description}</p>
    </div>
  )
}
