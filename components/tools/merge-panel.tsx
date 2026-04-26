"use client"

import { useCallback, useMemo, useState } from "react"
import { AlertCircle } from "lucide-react"
import { toast } from "sonner"
import { FileList } from "@/components/file-list"
import { OptionsCard } from "@/components/options-card"
import { PageGrid } from "@/components/page-grid"
import { ActionBar } from "@/components/tools/action-bar"
import type { ToolPanelProps } from "@/components/tools/types"
import { downloadBytes, mergePDFs, type MergeInput } from "@/lib/pdf"
import { usePersistentState } from "@/lib/storage"

export function MergePanel({
  files,
  isProcessing,
  setIsProcessing,
  setFiles,
  onRemoveFile,
  onClearFiles,
}: ToolPanelProps) {
  const [keepBookmarks, setKeepBookmarks] = usePersistentState("opts:merge:keepBookmarks", true)
  const [removedPages, setRemovedPages] = useState<Map<string, Set<number>>>(
    new Map(),
  )

  const togglePageRemoval = useCallback((fileId: string, pageNumber: number) => {
    setRemovedPages((prev) => {
      const next = new Map(prev)
      const current = new Set(next.get(fileId) ?? [])
      if (current.has(pageNumber)) current.delete(pageNumber)
      else current.add(pageNumber)
      if (current.size === 0) next.delete(fileId)
      else next.set(fileId, current)
      return next
    })
  }, [])

  const restoreFile = useCallback((fileId: string) => {
    setRemovedPages((prev) => {
      if (!prev.has(fileId)) return prev
      const next = new Map(prev)
      next.delete(fileId)
      return next
    })
  }, [])

  const inputs = useMemo<MergeInput[]>(() => {
    return files
      .filter((f) => f.pages && !f.error)
      .map((f) => {
        const removed = removedPages.get(f.id)
        if (!removed || removed.size === 0) return { file: f.file }
        const total = f.pages ?? 0
        const includePages: number[] = []
        for (let n = 1; n <= total; n++) {
          if (!removed.has(n)) includePages.push(n)
        }
        return { file: f.file, includePages }
      })
      .filter((m) => !m.includePages || m.includePages.length > 0)
  }, [files, removedPages])

  const canProcess = useMemo(() => {
    if (files.some((f) => f.error || f.pages === null)) return false
    return inputs.length >= 2
  }, [files, inputs])

  const handleProcess = useCallback(async () => {
    if (!canProcess) return
    setIsProcessing(true)
    try {
      const bytes = await mergePDFs(inputs)
      downloadBytes(bytes, "documento-unido.pdf")
      toast.success("PDF unido y descargado")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error procesando el PDF")
    } finally {
      setIsProcessing(false)
    }
  }, [canProcess, inputs, setIsProcessing])

  const handleClear = useCallback(() => {
    onClearFiles()
    setRemovedPages(new Map())
  }, [onClearFiles])

  const handleRemove = useCallback(
    (id: string) => {
      onRemoveFile(id)
      setRemovedPages((prev) => {
        if (!prev.has(id)) return prev
        const next = new Map(prev)
        next.delete(id)
        return next
      })
    },
    [onRemoveFile],
  )

  if (files.length === 0) return null

  return (
    <div className="space-y-6">
      <FileList
        files={files}
        reorderable
        onRemove={handleRemove}
        onReorder={setFiles}
        renderExpanded={(item) => {
          const removed = removedPages.get(item.id) ?? new Set<number>()
          const remaining = (item.pages ?? 0) - removed.size
          return (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>
                  {remaining}/{item.pages} página
                  {item.pages === 1 ? "" : "s"} se incluirán
                </span>
                {removed.size > 0 && (
                  <button
                    type="button"
                    onClick={() => restoreFile(item.id)}
                    className="hover:text-foreground"
                  >
                    Restaurar todas
                  </button>
                )}
              </div>
              <PageGrid
                file={item.file}
                pageCount={item.pages ?? 0}
                removedPages={removed}
                onRemove={(pn) => togglePageRemoval(item.id, pn)}
              />
            </div>
          )
        }}
      />

      <OptionsCard>
        <div className="flex items-center justify-between">
          <label className="text-sm text-foreground" htmlFor="opt-keep-bookmarks">
            Mantener marcadores
          </label>
          <input
            id="opt-keep-bookmarks"
            type="checkbox"
            className="h-4 w-4 rounded border-input accent-primary"
            checked={keepBookmarks}
            onChange={(e) => setKeepBookmarks(e.target.checked)}
          />
        </div>
      </OptionsCard>

      <ActionBar
        isProcessing={isProcessing}
        canProcess={canProcess}
        label="Unir y descargar"
        onProcess={handleProcess}
        onClear={handleClear}
        warning={
          files.length < 2 ? (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/50 border">
              <AlertCircle className="h-4 w-4 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                Agregá al menos 2 archivos para unir.
              </p>
            </div>
          ) : null
        }
      />
    </div>
  )
}
