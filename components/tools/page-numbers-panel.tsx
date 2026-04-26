"use client"

import { useCallback, useState } from "react"
import { toast } from "sonner"
import { FileList } from "@/components/file-list"
import { OptionsCard } from "@/components/options-card"
import { PageGrid } from "@/components/page-grid"
import { ActionBar } from "@/components/tools/action-bar"
import type { ToolPanelProps } from "@/components/tools/types"
import {
  addPageNumbers,
  downloadBytes,
  type PageNumberFormat,
  type PageNumberOptions,
} from "@/lib/pdf"
import { usePersistentState } from "@/lib/storage"

type Position = PageNumberOptions["position"]

const POSITIONS: Array<{ value: Position; label: string }> = [
  { value: "bottomCenter", label: "Inferior centro" },
  { value: "bottomRight", label: "Inferior derecha" },
  { value: "bottomLeft", label: "Inferior izquierda" },
  { value: "topCenter", label: "Superior centro" },
  { value: "topRight", label: "Superior derecha" },
  { value: "topLeft", label: "Superior izquierda" },
]

const FORMATS: Array<{ value: PageNumberFormat; label: string }> = [
  { value: "n", label: "1" },
  { value: "n-of-total", label: "1 / N" },
  { value: "page-n", label: "Página 1" },
  { value: "page-n-of-total", label: "Página 1 de N" },
]

export function PageNumbersPanel({
  files,
  isProcessing,
  setIsProcessing,
  setFiles,
  onRemoveFile,
  onClearFiles,
}: ToolPanelProps) {
  const [position, setPosition] = usePersistentState<Position>(
    "opts:pageNumbers:position",
    "bottomCenter",
  )
  const [format, setFormat] = usePersistentState<PageNumberFormat>(
    "opts:pageNumbers:format",
    "n-of-total",
  )
  const [fontSize, setFontSize] = usePersistentState("opts:pageNumbers:fontSize", 10)
  const [margin, setMargin] = usePersistentState("opts:pageNumbers:margin", 30)
  const [skipFirstPage, setSkipFirstPage] = usePersistentState(
    "opts:pageNumbers:skipFirstPage",
    false,
  )
  const [startAtPage, setStartAtPage] = usePersistentState("opts:pageNumbers:startAtPage", 1)

  const file = files[0]
  const totalPages = file?.pages ?? 0
  const canProcess = !!file && !file.error && !!totalPages

  const handleProcess = useCallback(async () => {
    if (!canProcess || !file) return
    setIsProcessing(true)
    try {
      const bytes = await addPageNumbers(file.file, {
        position,
        format,
        fontSize,
        margin,
        skipFirstPage,
        startAtPage: Math.max(1, startAtPage),
      })
      const baseName = file.fileName.replace(/\.pdf$/i, "")
      downloadBytes(bytes, `${baseName}-numerado.pdf`)
      toast.success("PDF numerado y descargado")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error procesando el PDF")
    } finally {
      setIsProcessing(false)
    }
  }, [
    canProcess,
    file,
    position,
    format,
    fontSize,
    margin,
    skipFirstPage,
    startAtPage,
    setIsProcessing,
  ])

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
            <label className="text-sm text-foreground" htmlFor="opt-pn-position">
              Posición
            </label>
            <select
              id="opt-pn-position"
              value={position}
              onChange={(e) => setPosition(e.target.value as Position)}
              className="w-full p-2 text-sm rounded-md border border-input bg-background text-foreground"
            >
              {POSITIONS.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <label className="text-sm text-foreground" htmlFor="opt-pn-format">
              Formato
            </label>
            <select
              id="opt-pn-format"
              value={format}
              onChange={(e) => setFormat(e.target.value as PageNumberFormat)}
              className="w-full p-2 text-sm rounded-md border border-input bg-background text-foreground"
            >
              {FORMATS.map((f) => (
                <option key={f.value} value={f.value}>
                  {f.label}
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <label className="text-sm text-foreground" htmlFor="opt-pn-font">
                Tamaño (pt)
              </label>
              <input
                id="opt-pn-font"
                type="number"
                min={6}
                max={48}
                value={fontSize}
                onChange={(e) =>
                  setFontSize(Math.max(6, Math.min(48, Number(e.target.value) || 10)))
                }
                className="w-full p-2 text-sm rounded-md border border-input bg-background text-foreground"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm text-foreground" htmlFor="opt-pn-margin">
                Margen (pt)
              </label>
              <input
                id="opt-pn-margin"
                type="number"
                min={0}
                max={150}
                value={margin}
                onChange={(e) =>
                  setMargin(Math.max(0, Math.min(150, Number(e.target.value) || 30)))
                }
                className="w-full p-2 text-sm rounded-md border border-input bg-background text-foreground"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <label className="text-sm text-foreground" htmlFor="opt-pn-start">
                Empezar en
              </label>
              <input
                id="opt-pn-start"
                type="number"
                min={1}
                value={startAtPage}
                onChange={(e) => setStartAtPage(Math.max(1, Number(e.target.value) || 1))}
                className="w-full p-2 text-sm rounded-md border border-input bg-background text-foreground"
              />
            </div>
            <label className="flex items-end gap-2 pb-1 text-sm text-foreground">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-input accent-primary"
                checked={skipFirstPage}
                onChange={(e) => setSkipFirstPage(e.target.checked)}
              />
              Saltear primera página
            </label>
          </div>
        </div>
      </OptionsCard>

      {file && totalPages > 0 && (
        <section>
          <PageGrid file={file.file} pageCount={totalPages} />
        </section>
      )}

      <ActionBar
        isProcessing={isProcessing}
        canProcess={canProcess}
        label="Numerar y descargar"
        onProcess={handleProcess}
        onClear={onClearFiles}
      />
    </div>
  )
}
