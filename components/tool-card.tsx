"use client"

import type { LucideIcon } from "lucide-react"
import { cn } from "@/lib/utils"

interface ToolCardProps {
  icon: LucideIcon
  label: string
  isActive?: boolean
  comingSoon?: boolean
  onClick?: () => void
}

export function ToolCard({ icon: Icon, label, isActive, comingSoon, onClick }: ToolCardProps) {
  return (
    <button
      onClick={onClick}
      disabled={comingSoon}
      className={cn(
        "relative flex flex-col items-center justify-center gap-2 p-4 rounded-lg border bg-card transition-all duration-200",
        !comingSoon && "hover:border-primary/50 hover:shadow-md hover:scale-[1.02]",
        comingSoon && "opacity-50 cursor-not-allowed",
        isActive && !comingSoon && "border-primary bg-primary/5 shadow-md",
      )}
    >
      <Icon
        className={cn(
          "h-6 w-6 text-muted-foreground",
          isActive && !comingSoon && "text-primary",
        )}
      />
      <span
        className={cn(
          "text-sm font-medium text-card-foreground",
          isActive && !comingSoon && "text-primary",
        )}
      >
        {label}
      </span>
      {comingSoon && (
        <span className="absolute top-1 right-1 text-[9px] uppercase tracking-wide font-medium text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
          Pronto
        </span>
      )}
    </button>
  )
}
