"use client"

import { useCallback, useMemo, useState } from "react"
import { toast } from "sonner"
import { FileList } from "@/components/file-list"
import { OptionsCard } from "@/components/options-card"
import { PageGrid } from "@/components/page-grid"
import { ProgressBar } from "@/components/progress-bar"
import { ActionBar } from "@/components/tools/action-bar"
import type { ToolPanelProps } from "@/components/tools/types"
import {
  convertToImages,
  downloadZip,
  triggerDownload,
  type ImageFormat,
} from "@/lib/pdf"

type DPIOption = 72 | 150 | 300

export function ConvertPanel({
  files,
  isProcessing,
  setIsProcessing,
  setFiles,
  onRemoveFile,
  onClearFiles,
}: ToolPanelProps) {
  const [format, setFormat] = useState<ImageFormat>("jpeg")
  const [dpi, setDpi] = useState<DPIOption>(150)
  const [quality, setQuality] = useState(0.92)
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(
    null,
  )

  const file = files[0]
  const totalPages = file?.pages ?? 0

  const canProcess = useMemo(
    () => !!file && !file.error && !!totalPages,
    [file, totalPages],
  )

  const handleProcess = useCallback(async () => {
    if (!canProcess || !file) return
    setIsProcessing(true)
    setProgress({ done: 0, total: totalPages })
    try {
      const results = await convertToImages(file.file, totalPages, {
        format,
        dpi,
        quality,
        onProgress: (done, total) => setProgress({ done, total }),
      })
      const baseName = file.fileName.replace(/\.pdf$/i, "")
      if (results.length === 1) {
        triggerDownload(results[0].blob, results[0].name)
      } else {
        await downloadZip(
          results.map((r) => ({ name: r.name, data: r.blob })),
          `${baseName}-${format}.zip`,
        )
      }
      toast.success(
        `${results.length} imagen${results.length > 1 ? "es" : ""} descargada${results.length > 1 ? "s" : ""}`,
      )
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error procesando el PDF")
    } finally {
      setIsProcessing(false)
      setProgress(null)
    }
  }, [canProcess, file, totalPages, format, dpi, quality, setIsProcessing])

  const handleClear = useCallback(() => {
    onClearFiles()
    setProgress(null)
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
            <label className="text-sm text-foreground" htmlFor="opt-format">
              Formato
            </label>
            <select
              id="opt-format"
              value={format}
              onChange={(e) => setFormat(e.target.value as ImageFormat)}
              className="w-full p-2 text-sm rounded-md border border-input bg-background text-foreground"
            >
              <option value="jpeg">JPG (más liviano)</option>
              <option value="png">PNG (sin pérdida)</option>
            </select>
          </div>
          <div className="space-y-2">
            <label className="text-sm text-foreground" htmlFor="opt-dpi">
              Resolución
            </label>
            <select
              id="opt-dpi"
              value={dpi}
              onChange={(e) => setDpi(Number(e.target.value) as DPIOption)}
              className="w-full p-2 text-sm rounded-md border border-input bg-background text-foreground"
            >
              <option value={72}>72 DPI (web, rápido)</option>
              <option value={150}>150 DPI (recomendado)</option>
              <option value={300}>300 DPI (impresión)</option>
            </select>
          </div>
          {format === "jpeg" && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-sm text-foreground" htmlFor="opt-quality">
                  Calidad
                </label>
                <span className="text-xs text-muted-foreground">
                  {Math.round(quality * 100)}%
                </span>
              </div>
              <input
                id="opt-quality"
                type="range"
                min={0.5}
                max={1}
                step={0.02}
                value={quality}
                onChange={(e) => setQuality(Number(e.target.value))}
                className="w-full accent-primary"
              />
            </div>
          )}
        </div>
      </OptionsCard>

      {file && totalPages > 0 && (
        <section>
          <PageGrid file={file.file} pageCount={totalPages} />
        </section>
      )}

      {progress && (
        <ProgressBar
          value={progress.done}
          max={progress.total}
          label={`Procesando ${progress.done} de ${progress.total}`}
        />
      )}

      <ActionBar
        isProcessing={isProcessing}
        canProcess={canProcess}
        label={
          totalPages > 1
            ? `Convertir y descargar ZIP (${totalPages})`
            : "Convertir y descargar"
        }
        onProcess={handleProcess}
        onClear={handleClear}
      />
    </div>
  )
}
