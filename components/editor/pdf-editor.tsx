"use client"

import { useCallback, useEffect, useMemo, useRef } from "react"
import { Trash2 } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { useEditorStore } from "@/lib/editor/store"
import { EmptyState } from "./empty-state"
import { PageGrid } from "./page-grid"
import { SourceChipBar } from "./source-chip-bar"
import { SelectionToolbar } from "./selection-toolbar"
import { DownloadButton } from "./download-button"
import { UndoRedo } from "./undo-redo"

const MAX_FILE_SIZE_MB = 100
const MAX_FILE_SIZE = MAX_FILE_SIZE_MB * 1024 * 1024

export function PdfEditor() {
  const pageCount = useEditorStore((s) => s.pages.length)
  const visibleCount = useEditorStore(
    (s) => s.pages.filter((p) => !p.deleted).length,
  )
  const sourceCount = useEditorStore((s) => s.sourceOrder.length)
  const addSources = useEditorStore((s) => s.addSources)
  const clearAll = useEditorStore((s) => s.clearAll)
  const selectAll = useEditorStore((s) => s.selectAll)
  const clearSelection = useEditorStore((s) => s.clearSelection)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const isMac = useMemo(
    () =>
      typeof navigator !== "undefined" &&
      /Mac|iPhone|iPad|iPod/.test(navigator.platform),
    [],
  )

  const handleFilesAdded = useCallback(
    (incoming: File[]) => {
      const accepted: File[] = []
      let rejected = 0
      for (const file of incoming) {
        if (file.size > MAX_FILE_SIZE) {
          rejected++
          continue
        }
        accepted.push(file)
      }
      if (rejected > 0) {
        toast.error(
          `${rejected} archivo${rejected > 1 ? "s" : ""} excede${rejected > 1 ? "n" : ""} el límite de ${MAX_FILE_SIZE_MB} MB`,
        )
      }
      if (accepted.length > 0) addSources(accepted)
    },
    [addSources],
  )

  useEffect(() => {
    return () => {
      useEditorStore.getState().clearAll()
    }
  }, [])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null
      const isEditable =
        !!target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable)
      const mod = isMac ? e.metaKey : e.ctrlKey

      if (mod && e.key.toLowerCase() === "o") {
        e.preventDefault()
        fileInputRef.current?.click()
        return
      }
      if (mod && e.key.toLowerCase() === "a" && pageCount > 0 && !isEditable) {
        e.preventDefault()
        selectAll()
        return
      }
      if (e.key === "Escape" && !isEditable) {
        if (useEditorStore.getState().selection.pageIds.size > 0) {
          clearSelection()
        } else if (pageCount > 0) {
          clearAll()
        }
      }
    }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [pageCount, isMac, selectAll, clearSelection, clearAll])

  if (pageCount === 0) {
    return (
      <EmptyState
        onFilesAdded={handleFilesAdded}
        inputRef={fileInputRef}
        maxSizeMb={MAX_FILE_SIZE_MB}
      />
    )
  }

  return (
    <div className="space-y-4">
      <input
        ref={fileInputRef}
        type="file"
        accept="application/pdf,.pdf"
        multiple
        onChange={(e) => {
          const picked = e.target.files ? Array.from(e.target.files) : []
          if (picked.length > 0) handleFilesAdded(picked)
          e.target.value = ""
        }}
        className="sr-only"
        aria-label="Seleccionar archivos PDF"
      />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <UndoRedo isMac={isMac} />
          <div className="h-5 w-px bg-border" />
          <Button
            variant="ghost"
            size="sm"
            onClick={() => fileInputRef.current?.click()}
          >
            Agregar PDF
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={clearAll}
            className="text-muted-foreground"
          >
            <Trash2 className="h-4 w-4" />
            Limpiar todo
          </Button>
        </div>
        <DownloadButton />
      </div>
      <SourceChipBar />
      <div className="text-xs text-muted-foreground">
        {sourceCount} {sourceCount === 1 ? "archivo" : "archivos"} ·{" "}
        {visibleCount} de {pageCount} {pageCount === 1 ? "página" : "páginas"}
      </div>
      <PageGrid />
      <SelectionToolbar />
    </div>
  )
}
