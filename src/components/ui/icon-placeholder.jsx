import * as LucideIcons from "lucide-react"
import { cn } from "@/lib/utils"

const FALLBACK = "Square"

export function IconPlaceholder({ lucide, className, ...props }) {
  const name = lucide || FALLBACK
  const Icon = LucideIcons[name]
  if (Icon) {
    return <Icon className={cn("size-4 shrink-0", className)} {...props} />
  }
  // fallback: small diamond
  return (
    <svg className={cn("size-4 shrink-0 text-muted-foreground", className)} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" {...props}>
      <rect x="2" y="2" width="12" height="12" rx="3" />
    </svg>
  )
}
