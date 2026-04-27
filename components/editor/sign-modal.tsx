"use client"

import { useCallback, useState } from "react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { useEditorStore } from "@/lib/editor/store"
import type { PageId, PageSignature } from "@/lib/editor/types"
import { SignatureCreator } from "./signature-creator"
import { SignPlacement } from "./sign-placement"

interface SignModalProps {
  pageId: PageId | null
  onClose: () => void
}

export function SignModal({ pageId, onClose }: SignModalProps) {
  const open = pageId !== null
  const entry = useEditorStore((s) =>
    pageId ? s.pages.find((p) => p.id === pageId) : null,
  )
  const file = useEditorStore((s) =>
    entry ? s.sources[entry.sourceId]?.file ?? null : null,
  )
  const setPageSignature = useEditorStore((s) => s.setPageSignature)
  const clearPageSignature = useEditorStore((s) => s.clearPageSignature)

  const [draftDataUrl, setDraftDataUrl] = useState<string | null>(null)
  const [draftPlacement, setDraftPlacement] = useState<PageSignature | null>(
    null,
  )

  // Reset whenever the dialog opens for a different page.
  const reset = () => {
    setDraftDataUrl(entry?.signature?.dataUrl ?? null)
    setDraftPlacement(entry?.signature ?? null)
  }

  const save = () => {
    if (!pageId || !draftPlacement || !draftDataUrl) return
    setPageSignature(pageId, { ...draftPlacement, dataUrl: draftDataUrl })
    onClose()
  }

  const remove = () => {
    if (!pageId) return
    clearPageSignature(pageId)
    onClose()
  }

  const dataUrl = draftDataUrl ?? entry?.signature?.dataUrl ?? null

  const handlePlacementChange = useCallback((p: PageSignature) => {
    setDraftPlacement(p)
  }, [])

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (o) reset()
        if (!o) onClose()
      }}
    >
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            Firmar página {entry ? entry.sourcePageIndex + 1 : ""}
          </DialogTitle>
          <DialogDescription>
            Creá la firma y posicionala arrastrando sobre la página. Se aplica
            al descargar.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          {!dataUrl ? (
            <SignatureCreator
              onCreated={(url) => {
                setDraftDataUrl(url)
                setDraftPlacement({
                  dataUrl: url,
                  xRatio: 0.55,
                  yRatio: 0.7,
                  widthRatio: 0.3,
                })
              }}
            />
          ) : (
            <>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">
                  Firma lista. Arrastrala sobre la página.
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setDraftDataUrl(null)
                    setDraftPlacement(null)
                  }}
                >
                  Cambiar firma
                </Button>
              </div>
              {file && entry && (
                <SignPlacement
                  file={file}
                  pageNumber={entry.sourcePageIndex + 1}
                  rotation={entry.rotation}
                  signatureDataUrl={dataUrl}
                  initialPlacement={draftPlacement ?? undefined}
                  onChange={handlePlacementChange}
                />
              )}
            </>
          )}
        </div>
        <DialogFooter className="gap-2">
          {entry?.signature && (
            <Button variant="ghost" onClick={remove} className="mr-auto">
              Quitar firma
            </Button>
          )}
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            onClick={save}
            disabled={!draftDataUrl || !draftPlacement}
          >
            Guardar firma
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
