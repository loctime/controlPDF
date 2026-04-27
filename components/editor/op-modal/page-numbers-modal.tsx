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
import { Switch } from "@/components/ui/switch"
import type { PageNumberFormat, PageNumberOptions, TextPosition } from "@/lib/pdf"
import { useEditorStore } from "@/lib/editor/store"
import type { PageNumbersOp, PageScope } from "@/lib/editor/types"
import { PageScopeSelector } from "../page-scope-selector"

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
}

type NumberPosition = Exclude<TextPosition, "center">

const POSITIONS: Array<{ value: NumberPosition; label: string }> = [
  { value: "bottomCenter", label: "Abajo-centro" },
  { value: "bottomLeft", label: "Abajo-izquierda" },
  { value: "bottomRight", label: "Abajo-derecha" },
  { value: "topCenter", label: "Arriba-centro" },
  { value: "topLeft", label: "Arriba-izquierda" },
  { value: "topRight", label: "Arriba-derecha" },
]

const FORMATS: Array<{ value: PageNumberFormat; label: string }> = [
  { value: "n", label: "1, 2, 3…" },
  { value: "n-of-total", label: "1 / N" },
  { value: "page-n", label: "Página 1" },
  { value: "page-n-of-total", label: "Página 1 de N" },
]

const defaultOpts: PageNumberOptions = {
  position: "bottomCenter",
  format: "n",
  fontSize: 11,
  margin: 24,
  startAtPage: 1,
  skipFirstPage: false,
}

export function PageNumbersModal({ open, onOpenChange }: Props) {
  const existing = useEditorStore((s) => s.globalOps.pageNumbers)
  const setGlobalOp = useEditorStore((s) => s.setGlobalOp)
  const clearGlobalOp = useEditorStore((s) => s.clearGlobalOp)

  const [scope, setScope] = useState<PageScope>(
    existing?.scope ?? { kind: "all" },
  )
  const [opts, setOpts] = useState<PageNumberOptions>(
    existing?.opts ?? defaultOpts,
  )

  const reset = () => {
    setScope(existing?.scope ?? { kind: "all" })
    setOpts(existing?.opts ?? defaultOpts)
  }

  const save = () => {
    const op: PageNumbersOp = { enabled: true, scope, opts }
    setGlobalOp("pageNumbers", op)
    onOpenChange(false)
  }

  const remove = () => {
    clearGlobalOp("pageNumbers")
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
          <DialogTitle>Números de página</DialogTitle>
          <DialogDescription>
            Numerá automáticamente al exportar.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <PageScopeSelector scope={scope} onChange={setScope} />
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Formato</Label>
              <Select
                value={opts.format}
                onValueChange={(v) =>
                  setOpts({ ...opts, format: v as PageNumberFormat })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FORMATS.map((f) => (
                    <SelectItem key={f.value} value={f.value}>
                      {f.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Posición</Label>
              <Select
                value={opts.position}
                onValueChange={(v) =>
                  setOpts({ ...opts, position: v as NumberPosition })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {POSITIONS.map((p) => (
                    <SelectItem key={p.value} value={p.value}>
                      {p.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Tamaño</Label>
              <Input
                type="number"
                min={6}
                max={48}
                value={opts.fontSize}
                onChange={(e) =>
                  setOpts({
                    ...opts,
                    fontSize: parseInt(e.target.value, 10) || 11,
                  })
                }
              />
            </div>
            <div className="space-y-2">
              <Label>Margen</Label>
              <Input
                type="number"
                min={0}
                max={120}
                value={opts.margin}
                onChange={(e) =>
                  setOpts({
                    ...opts,
                    margin: parseInt(e.target.value, 10) || 0,
                  })
                }
              />
            </div>
            <div className="space-y-2">
              <Label>Iniciar en</Label>
              <Input
                type="number"
                min={1}
                value={opts.startAtPage ?? 1}
                onChange={(e) =>
                  setOpts({
                    ...opts,
                    startAtPage: parseInt(e.target.value, 10) || 1,
                  })
                }
              />
            </div>
            <div className="flex items-end gap-2 pb-1">
              <Switch
                checked={opts.skipFirstPage ?? false}
                onCheckedChange={(v) =>
                  setOpts({ ...opts, skipFirstPage: v })
                }
                id="skipFirst"
              />
              <Label htmlFor="skipFirst">Saltar la primera</Label>
            </div>
          </div>
        </div>
        <DialogFooter className="gap-2">
          {existing && (
            <Button variant="ghost" onClick={remove} className="mr-auto">
              Quitar numeración
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
