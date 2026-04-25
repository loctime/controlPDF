"use client"

import { useState, type ReactNode } from "react"
import { ChevronDown, ChevronUp, Settings2 } from "lucide-react"
import { cn } from "@/lib/utils"

interface OptionsCardProps {
  title?: string
  defaultOpen?: boolean
  children: ReactNode
  className?: string
}

export function OptionsCard({
  title = "Opciones",
  defaultOpen = true,
  children,
  className,
}: OptionsCardProps) {
  const [isExpanded, setIsExpanded] = useState(defaultOpen)
  return (
    <div className={cn("rounded-lg border bg-card overflow-hidden", className)}>
      <button
        onClick={() => setIsExpanded((v) => !v)}
        className="flex items-center justify-between w-full p-4 hover:bg-muted/50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Settings2 className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium text-foreground">{title}</span>
        </div>
        {isExpanded ? (
          <ChevronUp className="h-4 w-4 text-muted-foreground" />
        ) : (
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        )}
      </button>
      <div
        className={cn(
          "overflow-hidden transition-all duration-300",
          isExpanded ? "max-h-[600px] opacity-100" : "max-h-0 opacity-0",
        )}
      >
        <div className="p-4 pt-0 border-t">{children}</div>
      </div>
    </div>
  )
}
