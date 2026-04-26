"use client"

import { useCallback, useRef, useState } from "react"
import { TriangleAlert } from "lucide-react"
import { toast } from "sonner"
import { FileList } from "@/components/file-list"
import { OptionsCard } from "@/components/options-card"
import { ProgressBar } from "@/components/progress-bar"
import { Button } from "@/components/ui/button"
import { ActionBar } from "@/components/tools/action-bar"
import type { ToolPanelProps } from "@/components/tools/types"
import {
  OCR_LANGUAGE_LABELS,
  downloadBytes,
  ocrPDF,
  type OCRLanguage,
} from "@/lib/pdf"
import { usePersistentState } from "@/lib/storage"

const LANGUAGES: OCRLanguage[] = ["spa", "eng", "por", "fra", "deu", "ita"]

export function OcrPanel({
  files,
  isProcessing,
  setIsProcessing,
  setFiles,
  onRemoveFile,
  onClearFiles,
}: ToolPanelProps) {
  const [language, setLanguage] = usePersistentState<OCRLanguage>("opts:ocr:language", "spa")
  const [dpi, setDpi] = usePersistentState("opts:ocr:dpi", 200)
  const [progress, setProgress] = useState<{
    phase: "init" | "recognize" | "build"
    done: number
    total: number
  } | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  const file = files[0]
  const totalPages = file?.pages ?? 0
  const canProcess = !!file && !file.error && !!totalPages

  const handleProcess = useCallback(async () => {
    if (!canProcess || !file) return
    const controller = new AbortController()
    abortRef.current = controller
    setIsProcessing(true)
    setProgress({ phase: "init", done: 0, total: 1 })
    try {
      const bytes = await ocrPDF(file.file, totalPages, {
        language,
        dpi,
        signal: controller.signal,
        onProgress: (phase, done, total) =>
          setProgress({ phase, done, total }),
      })
      const baseName = file.fileName.replace(/\.pdf$/i, "")
      downloadBytes(bytes, `${baseName}-ocr.pdf`)
      toast.success("PDF con OCR descargado")
    } catch (err) {
      if (controller.signal.aborted) {
        toast.message("OCR cancelado")
      } else {
        toast.error(err instanceof Error ? err.message : "Error procesando el PDF")
      }
    } finally {
      setIsProcessing(false)
      setProgress(null)
      abortRef.current = null
    }
  }, [canProcess, file, totalPages, language, dpi, setIsProcessing])

  const handleCancel = useCallback(() => {
    abortRef.current?.abort()
  }, [])

  const handleClear = useCallback(() => {
    onClearFiles()
    setProgress(null)
  }, [onClearFiles])

  if (files.length === 0) return null

  const phaseLabel =
    progress?.phase === "init"
      ? "Cargando modelo de idioma…"
      : progress?.phase === "build"
        ? "Generando PDF…"
        : `Reconociendo página ${progress?.done ?? 0} de ${progress?.total ?? totalPages}`

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
            <label className="text-sm text-foreground" htmlFor="opt-ocr-lang">
              Idioma del documento
            </label>
            <select
              id="opt-ocr-lang"
              value={language}
              onChange={(e) => setLanguage(e.target.value as OCRLanguage)}
              className="w-full p-2 text-sm rounded-md border border-input bg-background text-foreground"
            >
              {LANGUAGES.map((l) => (
                <option key={l} value={l}>
                  {OCR_LANGUAGE_LABELS[l]}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <label className="text-sm text-foreground" htmlFor="opt-ocr-dpi">
              Resolución de análisis
            </label>
            <select
              id="opt-ocr-dpi"
              value={dpi}
              onChange={(e) => setDpi(Number(e.target.value))}
              className="w-full p-2 text-sm rounded-md border border-input bg-background text-foreground"
            >
              <option value={150}>150 DPI (rápido)</option>
              <option value={200}>200 DPI (recomendado)</option>
              <option value={300}>300 DPI (preciso, lento)</option>
            </select>
          </div>
          <div className="flex items-start gap-2 p-3 rounded-md bg-amber-50 border border-amber-200 text-amber-800 dark:bg-amber-950 dark:border-amber-900 dark:text-amber-200">
            <TriangleAlert className="h-4 w-4 mt-0.5 flex-shrink-0" />
            <p className="text-xs leading-relaxed">
              El OCR corre 100% en tu navegador. Para PDFs grandes puede tardar
              varios minutos. La primera vez se descarga el modelo del idioma
              (~5 MB).
            </p>
          </div>
        </div>
      </OptionsCard>

      {progress && (
        <div className="space-y-2">
          <ProgressBar
            value={progress.done}
            max={Math.max(1, progress.total)}
            label={phaseLabel}
          />
          <Button variant="outline" size="sm" onClick={handleCancel}>
            Cancelar
          </Button>
        </div>
      )}

      <ActionBar
        isProcessing={isProcessing}
        canProcess={canProcess}
        label="Aplicar OCR y descargar"
        processingLabel="Procesando OCR..."
        onProcess={handleProcess}
        onClear={handleClear}
      />
    </div>
  )
}
