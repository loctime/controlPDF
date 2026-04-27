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
import { Textarea } from "@/components/ui/textarea"
import type { MetadataOptions } from "@/lib/pdf"
import { useEditorStore } from "@/lib/editor/store"
import type { MetadataOp } from "@/lib/editor/types"

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
}

const empty: MetadataOptions = {
  title: "",
  author: "",
  subject: "",
  keywords: [],
  creator: "",
}

export function MetadataModal({ open, onOpenChange }: Props) {
  const existing = useEditorStore((s) => s.globalOps.metadata)
  const setGlobalOp = useEditorStore((s) => s.setGlobalOp)
  const clearGlobalOp = useEditorStore((s) => s.clearGlobalOp)

  const [opts, setOpts] = useState<MetadataOptions>(existing?.opts ?? empty)
  const [keywordsText, setKeywordsText] = useState(
    (existing?.opts.keywords ?? empty.keywords ?? []).join(", "),
  )

  const reset = () => {
    setOpts(existing?.opts ?? empty)
    setKeywordsText((existing?.opts.keywords ?? empty.keywords ?? []).join(", "))
  }

  const save = () => {
    const keywords = keywordsText
      .split(",")
      .map((k) => k.trim())
      .filter(Boolean)
    const op: MetadataOp = {
      enabled: true,
      opts: { ...opts, keywords },
    }
    setGlobalOp("metadata", op)
    onOpenChange(false)
  }

  const remove = () => {
    clearGlobalOp("metadata")
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
          <DialogTitle>Metadatos</DialogTitle>
          <DialogDescription>
            Título, autor, asunto y palabras clave del PDF.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="space-y-2">
            <Label>Título</Label>
            <Input
              value={opts.title ?? ""}
              onChange={(e) => setOpts({ ...opts, title: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label>Autor</Label>
            <Input
              value={opts.author ?? ""}
              onChange={(e) => setOpts({ ...opts, author: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label>Asunto</Label>
            <Input
              value={opts.subject ?? ""}
              onChange={(e) => setOpts({ ...opts, subject: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label>Palabras clave</Label>
            <Textarea
              rows={2}
              value={keywordsText}
              onChange={(e) => setKeywordsText(e.target.value)}
              placeholder="separadas por coma"
            />
          </div>
          <div className="space-y-2">
            <Label>Aplicación</Label>
            <Input
              value={opts.creator ?? ""}
              onChange={(e) => setOpts({ ...opts, creator: e.target.value })}
              placeholder="ej. controlPDF"
            />
          </div>
        </div>
        <DialogFooter className="gap-2">
          {existing && (
            <Button variant="ghost" onClick={remove} className="mr-auto">
              Quitar metadatos
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
