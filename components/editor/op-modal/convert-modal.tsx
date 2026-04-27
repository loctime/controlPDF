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
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import type { ImageFormat } from "@/lib/pdf"
import { useEditorStore } from "@/lib/editor/store"
import type { ConvertOp, PageScope } from "@/lib/editor/types"
import { PageScopeSelector } from "../page-scope-selector"

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function ConvertModal({ open, onOpenChange }: Props) {
  const existing = useEditorStore((s) => s.globalOps.convert)
  const setGlobalOp = useEditorStore((s) => s.setGlobalOp)
  const clearGlobalOp = useEditorStore((s) => s.clearGlobalOp)

  const [scope, setScope] = useState<PageScope>(
    existing?.scope ?? { kind: "all" },
  )
  const [format, setFormat] = useState<ImageFormat>(existing?.format ?? "jpeg")
  const [dpi, setDpi] = useState<number>(existing?.dpi ?? 150)

  const reset = () => {
    setScope(existing?.scope ?? { kind: "all" })
    setFormat(existing?.format ?? "jpeg")
    setDpi(existing?.dpi ?? 150)
  }

  const save = () => {
    const op: ConvertOp = { enabled: true, scope, format, dpi }
    setGlobalOp("convert", op)
    onOpenChange(false)
  }

  const remove = () => {
    clearGlobalOp("convert")
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
          <DialogTitle>Convertir a imagen</DialogTitle>
          <DialogDescription>
            Genera imágenes JPG o PNG además del PDF. La descarga vendrá en un
            ZIP con los PDFs y las imágenes adentro.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <PageScopeSelector scope={scope} onChange={setScope} />
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Formato</Label>
              <Select
                value={format}
                onValueChange={(v) => setFormat(v as ImageFormat)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="jpeg">JPG</SelectItem>
                  <SelectItem value="png">PNG</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>DPI</Label>
              <Input
                type="number"
                min={72}
                max={600}
                value={dpi}
                onChange={(e) => setDpi(parseInt(e.target.value, 10) || 150)}
              />
            </div>
          </div>
        </div>
        <DialogFooter className="gap-2">
          {existing && (
            <Button variant="ghost" onClick={remove} className="mr-auto">
              Quitar conversión
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
