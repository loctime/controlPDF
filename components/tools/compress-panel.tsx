"use client"

import { useCallback, useState } from "react"
import { TriangleAlert } from "lucide-react"
import { toast } from "sonner"
import { FileList } from "@/components/file-list"
import { OptionsCard } from "@/components/options-card"
import { ProgressBar } from "@/components/progress-bar"
import { ActionBar } from "@/components/tools/action-bar"
import type { ToolPanelProps } from "@/components/tools/types"
import {
  compressPDF,
  downloadBytes,
  formatFileSize,
  type CompressLevel,
} from "@/lib/pdf"

const LEVEL_LABEL: Record<CompressLevel, string> = {
  low: "Baja (mejor calidad)",
  medium: "Media (recomendado)",
  high: "Alta (menor tamaño)",
}

export function CompressPanel({
  files,
  isProcessing,
  setIsProcessing,
  setFiles,
  onRemoveFile,
  onClearFiles,
}: ToolPanelProps) {
  const [level, setLevel] = useState<CompressLevel>("medium")
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(
    null,
  )
  const [stats, setStats] = useState<{
    original: number
    compressed: number
  } | null>(null)

  const file = files[0]
  const totalPages = file?.pages ?? 0
  const canProcess = !!file && !file.error && !!totalPages

  const handleProcess = useCallback(async () => {
    if (!canProcess || !file) return
    setIsProcessing(true)
    setStats(null)
    setProgress({ done: 0, total: totalPages })
    try {
      const result = await compressPDF(file.file, totalPages, {
        level,
        onProgress: (done, total) => setProgress({ done, total }),
      })
      const baseName = file.fileName.replace(/\.pdf$/i, "")
      downloadBytes(result.bytes, `${baseName}-comprimido.pdf`)
      setStats({
        original: result.originalSize,
        compressed: result.compressedSize,
      })
      const reduction = Math.max(
        0,
        Math.round((1 - result.compressedSize / result.originalSize) * 100),
      )
      toast.success(
        reduction > 0
          ? `PDF comprimido: -${reduction}% (${formatFileSize(result.compressedSize)})`
          : "PDF procesado y descargado",
      )
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error procesando el PDF")
    } finally {
      setIsProcessing(false)
      setProgress(null)
    }
  }, [canProcess, file, totalPages, level, setIsProcessing])

  const handleClear = useCallback(() => {
    onClearFiles()
    setProgress(null)
    setStats(null)
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
            <label className="text-sm text-foreground" htmlFor="opt-cmp-level">
              Nivel de compresión
            </label>
            <select
              id="opt-cmp-level"
              value={level}
              onChange={(e) => setLevel(e.target.value as CompressLevel)}
              className="w-full p-2 text-sm rounded-md border border-input bg-background text-foreground"
            >
              {(["low", "medium", "high"] as CompressLevel[]).map((l) => (
                <option key={l} value={l}>
                  {LEVEL_LABEL[l]}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-start gap-2 p-3 rounded-md bg-amber-50 border border-amber-200 text-amber-800 dark:bg-amber-950 dark:border-amber-900 dark:text-amber-200">
            <TriangleAlert className="h-4 w-4 mt-0.5 flex-shrink-0" />
            <p className="text-xs leading-relaxed">
              La compresión rasteriza cada página: el PDF resultante pesa menos
              pero el texto deja de ser seleccionable. Ideal para escaneos y PDFs
              con muchas imágenes.
            </p>
          </div>
        </div>
      </OptionsCard>

      {progress && (
        <ProgressBar
          value={progress.done}
          max={progress.total}
          label={`Procesando ${progress.done} de ${progress.total}`}
        />
      )}

      {stats && !progress && (
        <div className="rounded-lg border bg-card p-3">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Original</span>
            <span className="font-medium">{formatFileSize(stats.original)}</span>
          </div>
          <div className="flex items-center justify-between text-sm mt-1">
            <span className="text-muted-foreground">Comprimido</span>
            <span className="font-medium text-primary">
              {formatFileSize(stats.compressed)} (
              -
              {Math.max(
                0,
                Math.round((1 - stats.compressed / stats.original) * 100),
              )}
              %)
            </span>
          </div>
        </div>
      )}

      <ActionBar
        isProcessing={isProcessing}
        canProcess={canProcess}
        label="Comprimir y descargar"
        processingLabel="Comprimiendo..."
        onProcess={handleProcess}
        onClear={handleClear}
      />
    </div>
  )
}
