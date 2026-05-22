"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import dynamic from "next/dynamic"
import { Upload } from "lucide-react"
import { toast } from "sonner"
import { useEditorStore } from "@/lib/editor/store"
import { EmptyState } from "./empty-state"
import { PageGrid } from "./page-grid"
import { SelectionToolbar } from "./selection-toolbar"
import { EditorToolbar } from "./editor-toolbar"

const ScanModal = dynamic(
  () => import("./scanner/scan-modal").then((m) => m.ScanModal),
  { ssr: false },
)

const MAX_FILE_SIZE_MB = 100
const MAX_FILE_SIZE = MAX_FILE_SIZE_MB * 1024 * 1024

export function PdfEditor() {
  const pageCount = useEditorStore((s) => s.pages.length)
  const addSources = useEditorStore((s) => s.addSources)
  const clearAll = useEditorStore((s) => s.clearAll)
  const selectAll = useEditorStore((s) => s.selectAll)
  const clearSelection = useEditorStore((s) => s.clearSelection)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [scanOpen, setScanOpen] = useState(false)
  const [isDragOver, setIsDragOver] = useState(false)
  const dragCounter = useRef(0)

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
    if (pageCount === 0) return

    const onDragEnter = (e: DragEvent) => {
      if (!e.dataTransfer?.types.includes("Files")) return
      e.preventDefault()
      dragCounter.current++
      if (dragCounter.current === 1) setIsDragOver(true)
    }
    const onDragOver = (e: DragEvent) => {
      if (!e.dataTransfer?.types.includes("Files")) return
      e.preventDefault()
    }
    const onDragLeave = (e: DragEvent) => {
      dragCounter.current--
      if (dragCounter.current === 0) setIsDragOver(false)
    }
    const onDrop = (e: DragEvent) => {
      e.preventDefault()
      dragCounter.current = 0
      setIsDragOver(false)
      const files = Array.from(e.dataTransfer?.files ?? []).filter(
        (f) => f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf") || f.type.startsWith("image/"),
      )
      if (files.length > 0) handleFilesAdded(files)
    }

    window.addEventListener("dragenter", onDragEnter)
    window.addEventListener("dragover", onDragOver)
    window.addEventListener("dragleave", onDragLeave)
    window.addEventListener("drop", onDrop)
    return () => {
      window.removeEventListener("dragenter", onDragEnter)
      window.removeEventListener("dragover", onDragOver)
      window.removeEventListener("dragleave", onDragLeave)
      window.removeEventListener("drop", onDrop)
    }
  }, [pageCount, handleFilesAdded])

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
      <>
        <EmptyState
          onFilesAdded={handleFilesAdded}
          inputRef={fileInputRef}
          maxSizeMb={MAX_FILE_SIZE_MB}
          onScan={() => setScanOpen(true)}
        />
        <ScanModal open={scanOpen} onOpenChange={setScanOpen} />
      </>
    )
  }

  return (
    <div className="relative space-y-4">
      {isDragOver && (
        <div className="pointer-events-none fixed inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-background/80 backdrop-blur-sm">
          <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-primary bg-primary/5 px-16 py-12">
            <Upload className="h-12 w-12 text-primary" />
            <p className="text-lg font-medium text-foreground">Soltá para agregar</p>
            <p className="text-sm text-muted-foreground">PDF o imágenes</p>
          </div>
        </div>
      )}
      <input
        ref={fileInputRef}
        type="file"
        accept="application/pdf,.pdf,image/png,image/jpeg,image/jpg"
        multiple
        onChange={(e) => {
          const picked = e.target.files ? Array.from(e.target.files) : []
          if (picked.length > 0) handleFilesAdded(picked)
          e.target.value = ""
        }}
        className="sr-only"
        aria-label="Seleccionar archivos PDF"
      />
      <EditorToolbar
        isMac={isMac}
        onAddFiles={() => fileInputRef.current?.click()}
        onClearAll={clearAll}
        onScan={() => setScanOpen(true)}
      />
      <ScanModal open={scanOpen} onOpenChange={setScanOpen} />
      <PageGrid onAddFiles={() => fileInputRef.current?.click()} />
      <SelectionToolbar />
    </div>
  )
}
