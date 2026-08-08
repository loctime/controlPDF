"use client"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import type { ScanMode } from "@/lib/scanner/types"

const MODES: { value: ScanMode; label: string }[] = [
  { value: "document", label: "Documento" },
  { value: "bw", label: "Blanco y negro" },
  { value: "original", label: "Original" },
]

interface ModeToggleProps {
  value: ScanMode
  onChange: (mode: ScanMode) => void
  disabled?: boolean
}

export function ModeToggle({ value, onChange, disabled }: ModeToggleProps) {
  return (
    <div className="flex gap-1 rounded-lg bg-muted p-1">
      {MODES.map((mode) => (
        <Button
          key={mode.value}
          type="button"
          variant="ghost"
          size="sm"
          disabled={disabled}
          onClick={() => onChange(mode.value)}
          className={cn(
            "flex-1 text-xs",
            value === mode.value && "bg-background shadow-sm",
          )}
        >
          {mode.label}
        </Button>
      ))}
    </div>
  )
}
