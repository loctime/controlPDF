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
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import type { TextPosition, WatermarkOptions } from "@/lib/pdf"
import { useEditorStore } from "@/lib/editor/store"
import type { PageScope, WatermarkOp } from "@/lib/editor/types"
import { PageScopeSelector } from "../page-scope-selector"

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
}

const POSITIONS: Array<{ value: TextPosition; label: string }> = [
  { value: "center", label: "Centro" },
  { value: "topLeft", label: "Arriba-izquierda" },
  { value: "topCenter", label: "Arriba-centro" },
  { value: "topRight", label: "Arriba-derecha" },
  { value: "bottomLeft", label: "Abajo-izquierda" },
  { value: "bottomCenter", label: "Abajo-centro" },
  { value: "bottomRight", label: "Abajo-derecha" },
]

const defaultOpts: WatermarkOptions = {
  text: "CONFIDENCIAL",
  fontSize: 48,
  opacity: 0.3,
  rotation: -30,
  position: "center",
}

export function WatermarkModal({ open, onOpenChange }: Props) {
  const existing = useEditorStore((s) => s.globalOps.watermark)
  const setGlobalOp = useEditorStore((s) => s.setGlobalOp)
  const clearGlobalOp = useEditorStore((s) => s.clearGlobalOp)

  const [scope, setScope] = useState<PageScope>(
    existing?.scope ?? { kind: "all" },
  )
  const [opts, setOpts] = useState<WatermarkOptions>(
    existing?.opts ?? defaultOpts,
  )

  const reset = () => {
    setScope(existing?.scope ?? { kind: "all" })
    setOpts(existing?.opts ?? defaultOpts)
  }

  const save = () => {
    if (!opts.text.trim()) return
    const op: WatermarkOp = { enabled: true, scope, opts }
    setGlobalOp("watermark", op)
    onOpenChange(false)
  }

  const remove = () => {
    clearGlobalOp("watermark")
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
          <DialogTitle>Marca de agua</DialogTitle>
          <DialogDescription>
            Texto superpuesto al exportar. Se aplica al descargar.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <PageScopeSelector scope={scope} onChange={setScope} />
          <div className="space-y-2">
            <Label>Texto</Label>
            <Input
              value={opts.text}
              onChange={(e) => setOpts({ ...opts, text: e.target.value })}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Tamaño</Label>
              <Input
                type="number"
                min={8}
                max={200}
                value={opts.fontSize}
                onChange={(e) =>
                  setOpts({
                    ...opts,
                    fontSize: parseInt(e.target.value, 10) || 48,
                  })
                }
              />
            </div>
            <div className="space-y-2">
              <Label>Opacidad</Label>
              <Input
                type="number"
                min={0.05}
                max={1}
                step={0.05}
                value={opts.opacity}
                onChange={(e) =>
                  setOpts({
                    ...opts,
                    opacity: parseFloat(e.target.value) || 0.3,
                  })
                }
              />
            </div>
            <div className="space-y-2">
              <Label>Rotación</Label>
              <Input
                type="number"
                min={-180}
                max={180}
                value={opts.rotation}
                onChange={(e) =>
                  setOpts({
                    ...opts,
                    rotation: parseInt(e.target.value, 10) || 0,
                  })
                }
              />
            </div>
            <div className="space-y-2">
              <Label>Posición</Label>
              <Select
                value={opts.position}
                onValueChange={(v) =>
                  setOpts({ ...opts, position: v as TextPosition })
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
          </div>
        </div>
        <DialogFooter className="gap-2">
          {existing && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" onClick={remove} className="mr-auto">
                  Quitar marca de agua
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Eliminar la marca de agua actual</p>
              </TooltipContent>
            </Tooltip>
          )}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Cancelar
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Cerrar sin aplicar cambios</p>
            </TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button onClick={save} disabled={!opts.text.trim()}>
                {existing ? "Guardar" : "Aplicar"}
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>{existing ? "Guardar cambios" : "Aplicar marca de agua"}</p>
            </TooltipContent>
          </Tooltip>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
