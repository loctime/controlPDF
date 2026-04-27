"use client"

import { useState } from "react"
import { Download, Loader2 } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { useEditorStore } from "@/lib/editor/store"
import { exportEditor } from "@/lib/editor/export"
import { downloadBytes } from "@/lib/pdf"

export function DownloadButton() {
  const [busy, setBusy] = useState(false)
  const visibleCount = useEditorStore(
    (s) => s.pages.filter((p) => !p.deleted).length,
  )

  const handleClick = async () => {
    setBusy(true)
    try {
      const state = useEditorStore.getState()
      const { name, bytes } = await exportEditor(state)
      downloadBytes(bytes, name)
      toast.success("Descarga lista")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al exportar")
    } finally {
      setBusy(false)
    }
  }

  return (
    <Button
      onClick={handleClick}
      disabled={busy || visibleCount === 0}
      size="sm"
    >
      {busy ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <Download className="h-4 w-4" />
      )}
      Descargar PDF
    </Button>
  )
}
