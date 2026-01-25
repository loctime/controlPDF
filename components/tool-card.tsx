"use client"

import type { LucideIcon } from "lucide-react"
import { cn } from "@/lib/utils"

interface ToolCardProps {
  icon: LucideIcon
  label: string
  isActive?: boolean
  onClick?: () => void
}

export function ToolCard({ icon: Icon, label, isActive, onClick }: ToolCardProps) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex flex-col items-center justify-center gap-2 p-4 rounded-lg border bg-card transition-all duration-200",
        "hover:border-primary/50 hover:shadow-md hover:scale-[1.02]",
        isActive && "border-primary bg-primary/5 shadow-md"
      )}
    >
      <Icon className={cn("h-6 w-6 text-muted-foreground", isActive && "text-primary")} />
      <span className={cn("text-sm font-medium text-card-foreground", isActive && "text-primary")}>
        {label}
      </span>
    </button>
  )
}
