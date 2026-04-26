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
  rotatePDF,
  rotatePagesIndividually,
  type RotationAngle,
} from "@/lib/pdf"
import { usePersistentState } from "@/lib/storage"

type RotateMode = "all" | "perPage"

export function RotatePanel({
  files,
  isProcessing,
  setIsProcessing,
  setFiles,
  onRemoveFile,
  onClearFiles,
}: ToolPanelProps) {
  const [mode, setMode] = usePersistentState<RotateMode>("opts:rotate:mode", "all")
  const [angle, setAngle] = usePersistentState<RotationAngle>("opts:rotate:angle", 90)
  const [perPageRotations, setPerPageRotations] = useState<Map<number, number>>(
    new Map(),
  )

  const file = files[0]
  const totalPages = file?.pages ?? 0

  const incrementRotation = useCallback((pageNumber: number) => {
    setPerPageRotations((prev) => {
      const next = new Map(prev)
      const current = next.get(pageNumber) ?? 0
      const updated = (current + 90) % 360
      if (updated === 0) next.delete(pageNumber)
      else next.set(pageNumber, updated)
      return next
    })
  }, [])

  const canProcess = useMemo(() => {
    if (!file || file.error || file.pages === null) return false
    if (mode === "perPage") return perPageRotations.size > 0
    return true
  }, [file, mode, perPageRotations])

  const handleProcess = useCallback(async () => {
    if (!canProcess || !file) return
    setIsProcessing(true)
    try {
      const baseName = file.fileName.replace(/\.pdf$/i, "")
      const bytes =
        mode === "perPage"
          ? await rotatePagesIndividually(file.file, perPageRotations)
          : await rotatePDF(file.file, angle)
      downloadBytes(bytes, `${baseName}-rotado.pdf`)
      toast.success("PDF rotado y descargado")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error procesando el PDF")
    } finally {
      setIsProcessing(false)
    }
  }, [canProcess, file, mode, angle, perPageRotations, setIsProcessing])

  const handleClear = useCallback(() => {
    onClearFiles()
    setPerPageRotations(new Map())
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
            <label className="text-sm text-foreground" htmlFor="opt-rotate-mode">
              Modo
            </label>
            <select
              id="opt-rotate-mode"
              value={mode}
              onChange={(e) => setMode(e.target.value as RotateMode)}
              className="w-full p-2 text-sm rounded-md border border-input bg-background text-foreground"
            >
              <option value="all">Todas las páginas</option>
              <option value="perPage">Página por página</option>
            </select>
          </div>
          {mode === "all" && (
            <div className="space-y-2">
              <label className="text-sm text-foreground" htmlFor="opt-rotate-angle">
                Rotación
              </label>
              <select
                id="opt-rotate-angle"
                value={angle}
                onChange={(e) => setAngle(Number(e.target.value) as RotationAngle)}
                className="w-full p-2 text-sm rounded-md border border-input bg-background text-foreground"
              >
                <option value={90}>90° a la derecha</option>
                <option value={180}>180°</option>
                <option value={270}>90° a la izquierda</option>
              </select>
            </div>
          )}
          {mode === "perPage" && (
            <p className="text-xs text-muted-foreground">
              Pasá el mouse sobre cada miniatura y tocá el icono de rotar para girarla 90°.
            </p>
          )}
        </div>
      </OptionsCard>

      {file && totalPages > 0 && (
        <section className="space-y-3">
          {mode === "perPage" && (
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                {perPageRotations.size === 0
                  ? "Pasá el mouse y tocá ↻ en cada página que quieras girar."
                  : `${perPageRotations.size} página${perPageRotations.size === 1 ? "" : "s"} con rotación pendiente.`}
              </p>
              {perPageRotations.size > 0 && (
                <button
                  type="button"
                  onClick={() => setPerPageRotations(new Map())}
                  className="text-xs text-muted-foreground hover:text-foreground"
                >
                  Resetear rotaciones
                </button>
              )}
            </div>
          )}
          <PageGrid
            file={file.file}
            pageCount={totalPages}
            rotations={mode === "perPage" ? perPageRotations : undefined}
            onRotate={mode === "perPage" ? incrementRotation : undefined}
          />
        </section>
      )}

      <ActionBar
        isProcessing={isProcessing}
        canProcess={canProcess}
        label="Rotar y descargar"
        onProcess={handleProcess}
        onClear={handleClear}
      />
    </div>
  )
}
