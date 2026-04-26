"use client"

import { useCallback, useMemo, useState } from "react"
import { toast } from "sonner"
import { FileList } from "@/components/file-list"
import { OptionsCard } from "@/components/options-card"
import { PageGrid } from "@/components/page-grid"
import { ActionBar } from "@/components/tools/action-bar"
import type { ToolPanelProps } from "@/components/tools/types"
import {
  downloadBytes,
  pagesToRanges,
  parseRanges,
  rangesEveryN,
  splitPDF,
  type SplitRange,
} from "@/lib/pdf"
import { usePersistentState } from "@/lib/storage"

type SplitMode = "ranges" | "everyN" | "visual"

export function SplitPanel({
  files,
  isProcessing,
  setIsProcessing,
  setFiles,
  onRemoveFile,
  onClearFiles,
}: ToolPanelProps) {
  const [mode, setMode] = usePersistentState<SplitMode>("opts:split:mode", "ranges")
  const [ranges, setRanges] = useState("")
  const [everyN, setEveryN] = usePersistentState("opts:split:everyN", 1)
  const [selectedPages, setSelectedPages] = useState<Set<number>>(new Set())

  const file = files[0]
  const totalPages = file?.pages ?? 0

  const computedRanges = useMemo<SplitRange[]>(() => {
    if (!file || !totalPages) return []
    if (mode === "ranges") {
      if (!ranges.trim()) {
        return Array.from({ length: totalPages }, (_, i) => ({
          from: i + 1,
          to: i + 1,
        }))
      }
      return parseRanges(ranges, totalPages)
    }
    if (mode === "everyN") return rangesEveryN(totalPages, Math.max(1, everyN))
    return pagesToRanges(Array.from(selectedPages))
  }, [mode, ranges, everyN, selectedPages, totalPages, file])

  const togglePage = useCallback((pageNumber: number) => {
    setSelectedPages((prev) => {
      const next = new Set(prev)
      if (next.has(pageNumber)) next.delete(pageNumber)
      else next.add(pageNumber)
      return next
    })
  }, [])

  const canProcess =
    !!file && !!totalPages && !file.error && computedRanges.length > 0

  const handleProcess = useCallback(async () => {
    if (!canProcess || !file) return
    setIsProcessing(true)
    try {
      const results = await splitPDF(file.file, computedRanges)
      for (const r of results) downloadBytes(r.bytes, r.name)
      toast.success(
        `${results.length} archivo${results.length > 1 ? "s" : ""} descargado${results.length > 1 ? "s" : ""}`,
      )
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error procesando el PDF")
    } finally {
      setIsProcessing(false)
    }
  }, [canProcess, file, computedRanges, setIsProcessing])

  const handleClear = useCallback(() => {
    onClearFiles()
    setSelectedPages(new Set())
    setRanges("")
    setEveryN(1)
  }, [onClearFiles])

  if (files.length === 0) return null

  return (
    <div className="space-y-6">
      <FileList
        files={files}
        reorderable={false}
        onRemove={onRemoveFile}
        onReorder={setFiles}
      />

      <OptionsCard>
        <div className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm text-foreground" htmlFor="opt-split-mode">
              Modo
            </label>
            <select
              id="opt-split-mode"
              value={mode}
              onChange={(e) => setMode(e.target.value as SplitMode)}
              className="w-full p-2 text-sm rounded-md border border-input bg-background text-foreground"
            >
              <option value="ranges">Por rangos</option>
              <option value="everyN">Cada N páginas</option>
              <option value="visual">Selección visual</option>
            </select>
          </div>
          {mode === "ranges" && (
            <div className="space-y-2">
              <label className="text-sm text-foreground" htmlFor="opt-split-ranges">
                Rangos de páginas
              </label>
              <input
                id="opt-split-ranges"
                type="text"
                placeholder="Ej: 1-3, 5, 7-9"
                value={ranges}
                onChange={(e) => setRanges(e.target.value)}
                className="w-full p-2 text-sm rounded-md border border-input bg-background text-foreground placeholder:text-muted-foreground"
              />
              <p className="text-xs text-muted-foreground">
                Cada rango se convierte en un PDF independiente. Vacío = una página por archivo.
              </p>
            </div>
          )}
          {mode === "everyN" && (
            <div className="space-y-2">
              <label className="text-sm text-foreground" htmlFor="opt-split-every">
                Tamaño del grupo
              </label>
              <input
                id="opt-split-every"
                type="number"
                min={1}
                max={500}
                value={everyN}
                onChange={(e) =>
                  setEveryN(Math.max(1, Number(e.target.value) || 1))
                }
                className="w-full p-2 text-sm rounded-md border border-input bg-background text-foreground"
              />
              <p className="text-xs text-muted-foreground">
                Genera un archivo cada {everyN} página
                {everyN === 1 ? "" : "s"}.
              </p>
            </div>
          )}
          {mode === "visual" && (
            <p className="text-xs text-muted-foreground">
              Seleccioná páginas haciendo click sobre las miniaturas.
            </p>
          )}
        </div>
      </OptionsCard>

      {file && totalPages > 0 && (
        <section className="space-y-3">
          {mode === "visual" && (
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                {selectedPages.size === 0
                  ? "Tocá las páginas que querés extraer."
                  : `${selectedPages.size} página${selectedPages.size === 1 ? "" : "s"} seleccionada${selectedPages.size === 1 ? "" : "s"} · ${computedRanges.length} archivo${computedRanges.length === 1 ? "" : "s"} resultado.`}
              </p>
              {selectedPages.size > 0 && (
                <button
                  type="button"
                  onClick={() => setSelectedPages(new Set())}
                  className="text-xs text-muted-foreground hover:text-foreground"
                >
                  Limpiar selección
                </button>
              )}
            </div>
          )}
          <PageGrid
            file={file.file}
            pageCount={totalPages}
            selectedPages={mode === "visual" ? selectedPages : undefined}
            onSelect={mode === "visual" ? togglePage : undefined}
          />
        </section>
      )}

      <ActionBar
        isProcessing={isProcessing}
        canProcess={canProcess}
        label="Dividir y descargar"
        onProcess={handleProcess}
        onClear={handleClear}
      />
    </div>
  )
}
