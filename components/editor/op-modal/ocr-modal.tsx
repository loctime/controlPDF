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
import { OCR_LANGUAGE_LABELS, type OCRLanguage } from "@/lib/pdf"
import { useEditorStore } from "@/lib/editor/store"
import type { OcrOp, PageScope } from "@/lib/editor/types"
import { PageScopeSelector } from "../page-scope-selector"

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
}

const LANGS = Object.keys(OCR_LANGUAGE_LABELS) as OCRLanguage[]

export function OcrModal({ open, onOpenChange }: Props) {
  const existing = useEditorStore((s) => s.globalOps.ocr)
  const setGlobalOp = useEditorStore((s) => s.setGlobalOp)
  const clearGlobalOp = useEditorStore((s) => s.clearGlobalOp)

  const [scope, setScope] = useState<PageScope>(
    existing?.scope ?? { kind: "all" },
  )
  const [language, setLanguage] = useState<OCRLanguage>(
    existing?.language ?? "spa",
  )
  const [dpi, setDpi] = useState<number>(existing?.dpi ?? 200)

  const [mode, setMode] = useState<"overlay" | "reconstruct">(
    existing?.mode ?? "overlay"
  )

  const reset = () => {
    setScope(existing?.scope ?? { kind: "all" })
    setLanguage(existing?.language ?? "spa")
    setDpi(existing?.dpi ?? 200)
    setMode(existing?.mode ?? "overlay")
  }

  const save = () => {
    const op: OcrOp = { enabled: true, scope, language, dpi, mode }
    setGlobalOp("ocr", op)
    onOpenChange(false)
  }

  const remove = () => {
    clearGlobalOp("ocr")
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
          <DialogTitle>OCR (texto buscable)</DialogTitle>
          <DialogDescription>
            Reconoce el texto de las páginas escaneadas. Puede agregar una capa
            invisible sobre la imagen original o reconstruir el documento.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <PageScopeSelector scope={scope} onChange={setScope} />
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Idioma</Label>
              <Select
                value={language}
                onValueChange={(v) => setLanguage(v as OCRLanguage)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {LANGS.map((l) => (
                    <SelectItem key={l} value={l}>
                      {OCR_LANGUAGE_LABELS[l]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>DPI</Label>
              <Input
                type="number"
                min={100}
                max={400}
                value={dpi}
                onChange={(e) => setDpi(parseInt(e.target.value, 10) || 200)}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Modo de Conversión</Label>
            <Select
              value={mode}
              onValueChange={(v) => setMode(v as "overlay" | "reconstruct")}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="overlay">Capa oculta (Recomendado)</SelectItem>
                <SelectItem value="reconstruct">Reconstrucción Visual (Solo texto visible)</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter className="gap-2">
          {existing && (
            <Button variant="ghost" onClick={remove} className="mr-auto">
              Quitar OCR
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
