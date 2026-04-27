"use client"

import { Loader2 } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"

export interface ExportProgressInfo {
  message: string
  current: number
  total: number
}

interface Props {
  open: boolean
  progress: ExportProgressInfo | null
  onCancel?: () => void
}

export function ExportProgressDialog({ open, progress, onCancel }: Props) {
  const pct =
    progress && progress.total > 0
      ? Math.min(100, Math.round((progress.current / progress.total) * 100))
      : null

  return (
    <Dialog open={open}>
      <DialogContent
        className="sm:max-w-sm"
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
        showCloseButton={false}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            Generando descarga
          </DialogTitle>
          <DialogDescription>
            {progress?.message ?? "Preparando…"}
          </DialogDescription>
        </DialogHeader>
        {pct !== null && (
          <div className="space-y-1 py-2">
            <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
              <div
                className="h-full bg-primary transition-[width] duration-200"
                style={{ width: `${pct}%` }}
              />
            </div>
            <div className="text-xs text-muted-foreground text-right">
              {progress?.current} / {progress?.total} ({pct}%)
            </div>
          </div>
        )}
        {onCancel && (
          <div className="flex justify-end pt-1">
            <Button variant="ghost" size="sm" onClick={onCancel}>
              Cancelar
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
