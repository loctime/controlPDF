"use client"

import { useRef, useState } from "react"
import { Download, Loader2 } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { useEditorStore } from "@/lib/editor/store"
import { exportEditor, exportZipName } from "@/lib/editor/export"
import type { ExportProgress } from "@/lib/editor/export"
import { downloadBytes, downloadZip, triggerDownload } from "@/lib/pdf"
import {
  ExportProgressDialog,
  type ExportProgressInfo,
} from "./export-progress-dialog"

export function DownloadButton() {
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState<ExportProgressInfo | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  const visibleCount = useEditorStore(
    (s) => s.pages.filter((p) => !p.deleted).length,
  )
  const groupCount = useEditorStore((s) => s.groupOrder.length)
  const convertEnabled = useEditorStore((s) => !!s.globalOps.convert?.enabled)

  const handleClick = async () => {
    setBusy(true)
    setProgress({ message: "Preparando…", current: 0, total: 1 })
    const controller = new AbortController()
    abortRef.current = controller
    try {
      const state = useEditorStore.getState()
      const onProgress = (info: ExportProgress) => setProgress(info)
      const { pdfs, images } = await exportEditor(state, {
        onProgress,
        signal: controller.signal,
      })

      const needsZip = pdfs.length + images.length > 1
      if (!needsZip) {
        if (pdfs.length === 1) {
          downloadBytes(pdfs[0].bytes, pdfs[0].name)
        } else if (images.length === 1) {
          triggerDownload(images[0].blob, images[0].name)
        }
      } else {
        const entries: Array<{ name: string; data: Uint8Array | Blob }> = [
          ...pdfs.map((p) => ({ name: p.name, data: p.bytes })),
          ...images.map((i) => ({ name: i.name, data: i.blob })),
        ]
        await downloadZip(entries, exportZipName(state))
      }

      toast.success(
        needsZip
          ? `Descarga lista (${pdfs.length} PDF${pdfs.length !== 1 ? "s" : ""}${
              images.length > 0
                ? ` + ${images.length} imagen${images.length !== 1 ? "es" : ""}`
                : ""
            } en ZIP)`
          : "Descarga lista",
      )
    } catch (err) {
      if (err instanceof Error && err.message === "Cancelado") {
        toast.info("Exportación cancelada")
      } else {
        toast.error(err instanceof Error ? err.message : "Error al exportar")
      }
    } finally {
      setBusy(false)
      setProgress(null)
      abortRef.current = null
    }
  }

  const cancel = () => abortRef.current?.abort()

  const label =
    groupCount > 0 || convertEnabled ? "Descargar ZIP" : "Descargar PDF"

  return (
    <>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button onClick={handleClick} disabled={busy || visibleCount === 0} size="sm">
            {busy ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Download className="h-4 w-4" />
            )}
            {label}
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          <p>
            {visibleCount === 0
              ? "No hay páginas para descargar"
              : groupCount > 0 || convertEnabled
              ? "Descargar todos los archivos como ZIP"
              : "Descargar el PDF editado"}
          </p>
        </TooltipContent>
      </Tooltip>
      <ExportProgressDialog
        open={busy}
        progress={progress}
        onCancel={cancel}
      />
    </>
  )
}
