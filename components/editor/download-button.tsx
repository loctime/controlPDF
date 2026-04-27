"use client"

import { useState } from "react"
import { Download, Loader2 } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { useEditorStore } from "@/lib/editor/store"
import { exportEditor, exportZipName } from "@/lib/editor/export"
import { downloadBytes, downloadZip } from "@/lib/pdf"

export function DownloadButton() {
  const [busy, setBusy] = useState(false)
  const visibleCount = useEditorStore(
    (s) => s.pages.filter((p) => !p.deleted).length,
  )
  const groupCount = useEditorStore((s) => s.groupOrder.length)

  const handleClick = async () => {
    setBusy(true)
    try {
      const state = useEditorStore.getState()
      const { pdfs } = await exportEditor(state)
      if (pdfs.length === 1) {
        downloadBytes(pdfs[0].bytes, pdfs[0].name)
      } else {
        await downloadZip(
          pdfs.map((p) => ({ name: p.name, data: p.bytes })),
          exportZipName(state),
        )
      }
      toast.success(
        pdfs.length === 1
          ? "Descarga lista"
          : `Descarga lista (${pdfs.length} PDFs en ZIP)`,
      )
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al exportar")
    } finally {
      setBusy(false)
    }
  }

  const label =
    groupCount > 0
      ? `Descargar ZIP`
      : visibleCount === 0
        ? "Descargar PDF"
        : "Descargar PDF"

  return (
    <Button onClick={handleClick} disabled={busy || visibleCount === 0} size="sm">
      {busy ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <Download className="h-4 w-4" />
      )}
      {label}
    </Button>
  )
}
