"use client"

import { useEffect } from "react"
import { Download, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"

interface ActionBarProps {
  isProcessing: boolean
  canProcess: boolean
  label: string
  processingLabel?: string
  onProcess: () => void
  onClear: () => void
  warning?: React.ReactNode
}

export function ActionBar({
  isProcessing,
  canProcess,
  label,
  processingLabel = "Procesando...",
  onProcess,
  onClear,
  warning,
}: ActionBarProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (
        e.key === "Enter" &&
        (e.metaKey || e.ctrlKey) &&
        canProcess &&
        !isProcessing
      ) {
        e.preventDefault()
        onProcess()
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [canProcess, isProcessing, onProcess])

  return (
    <section className="flex flex-col gap-4">
      {warning}
      <div className="flex flex-col sm:flex-row gap-3">
        <Button
          size="lg"
          className="flex-1"
          onClick={onProcess}
          disabled={!canProcess || isProcessing}
        >
          {isProcessing ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              {processingLabel}
            </>
          ) : (
            <>
              <Download className="h-4 w-4 mr-2" />
              {label}
            </>
          )}
        </Button>
        <Button
          size="lg"
          variant="outline"
          onClick={onClear}
          disabled={isProcessing}
          className="sm:flex-none"
        >
          Limpiar
        </Button>
      </div>
    </section>
  )
}
