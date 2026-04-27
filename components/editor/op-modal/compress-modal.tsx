"use client"

import { useState } from "react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import type { CompressLevel } from "@/lib/pdf"
import { useEditorStore } from "@/lib/editor/store"
import type { CompressOp } from "@/lib/editor/types"
import { cn } from "@/lib/utils"

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
}

const LEVELS: Array<{
  value: CompressLevel
  label: string
  hint: string
}> = [
  { value: "low", label: "Suave", hint: "Calidad alta · ahorro menor" },
  { value: "medium", label: "Medio", hint: "Calidad media · buen ahorro" },
  { value: "high", label: "Fuerte", hint: "Calidad baja · máximo ahorro" },
]

export function CompressModal({ open, onOpenChange }: Props) {
  const existing = useEditorStore((s) => s.globalOps.compress)
  const setGlobalOp = useEditorStore((s) => s.setGlobalOp)
  const clearGlobalOp = useEditorStore((s) => s.clearGlobalOp)

  const [level, setLevel] = useState<CompressLevel>(
    existing?.level ?? "medium",
  )

  const reset = () => setLevel(existing?.level ?? "medium")

  const save = () => {
    const op: CompressOp = { enabled: true, level }
    setGlobalOp("compress", op)
    onOpenChange(false)
  }

  const remove = () => {
    clearGlobalOp("compress")
    onOpenChange(false)
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (o) reset()
        onOpenChange(o)
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Comprimir PDF</DialogTitle>
          <DialogDescription>
            Rasteriza cada página como imagen para reducir el peso. Aplica al
            documento completo.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <Label>Nivel</Label>
          <div className="grid grid-cols-3 gap-2">
            {LEVELS.map((l) => (
              <button
                key={l.value}
                type="button"
                onClick={() => setLevel(l.value)}
                className={cn(
                  "flex flex-col items-start rounded-md border px-3 py-2 text-left text-sm transition-colors",
                  level === l.value
                    ? "border-primary bg-primary/10 text-foreground"
                    : "border-input hover:bg-accent hover:text-accent-foreground",
                )}
              >
                <span className="font-medium">{l.label}</span>
                <span className="text-xs text-muted-foreground">{l.hint}</span>
              </button>
            ))}
          </div>
          <p className="text-xs text-muted-foreground pt-2">
            Si tenés OCR activo en algunas páginas, esas saltean la compresión
            (OCR ya las re-rasteriza con su propia calidad).
          </p>
        </div>
        <DialogFooter className="gap-2">
          {existing && (
            <Button variant="ghost" onClick={remove} className="mr-auto">
              Quitar compresión
            </Button>
          )}
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={save}>{existing ? "Guardar" : "Aplicar"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
