"use client"

import { useState, useCallback, useEffect, useMemo } from "react"
import {
  Layers,
  Scissors,
  Minimize2,
  RefreshCw,
  RotateCw,
  Lock,
  PenTool,
  ScanText,
  FileText,
  Loader2,
  Download,
  AlertCircle,
} from "lucide-react"
import { toast } from "sonner"
import { ToolCard } from "@/components/tool-card"
import { DropZone } from "@/components/drop-zone"
import { FileList, type FileItem } from "@/components/file-list"
import {
  OptionsPanel,
  type MergeOptions,
  type RotateOptions,
  type SplitOptions,
} from "@/components/options-panel"
import { Button } from "@/components/ui/button"
import {
  countPages,
  mergePDFs,
  rotatePDF,
  splitPDF,
  parseRanges,
  downloadBytes,
} from "@/lib/pdf-engine"

type ToolId =
  | "merge"
  | "split"
  | "compress"
  | "convert"
  | "rotate"
  | "protect"
  | "sign"
  | "ocr"

interface Tool {
  id: ToolId
  label: string
  icon: typeof Layers
  available: boolean
  multiple: boolean
  minFiles: number
  description: string
}

const TOOLS: Tool[] = [
  {
    id: "merge",
    label: "Unir PDF",
    icon: Layers,
    available: true,
    multiple: true,
    minFiles: 2,
    description: "Combina varios PDFs en uno solo. Reordená arrastrando.",
  },
  {
    id: "split",
    label: "Dividir PDF",
    icon: Scissors,
    available: true,
    multiple: false,
    minFiles: 1,
    description: "Extraé páginas o rangos en archivos separados.",
  },
  {
    id: "rotate",
    label: "Rotar PDF",
    icon: RotateCw,
    available: true,
    multiple: false,
    minFiles: 1,
    description: "Rotá todas las páginas del documento.",
  },
  {
    id: "compress",
    label: "Comprimir",
    icon: Minimize2,
    available: false,
    multiple: false,
    minFiles: 1,
    description: "Reducí el tamaño de tu PDF.",
  },
  {
    id: "convert",
    label: "Convertir",
    icon: RefreshCw,
    available: false,
    multiple: false,
    minFiles: 1,
    description: "Convertí PDFs a otros formatos.",
  },
  {
    id: "protect",
    label: "Proteger",
    icon: Lock,
    available: false,
    multiple: false,
    minFiles: 1,
    description: "Agregá contraseña a tu PDF.",
  },
  {
    id: "sign",
    label: "Firmar",
    icon: PenTool,
    available: false,
    multiple: false,
    minFiles: 1,
    description: "Firmá documentos digitalmente.",
  },
  {
    id: "ocr",
    label: "OCR",
    icon: ScanText,
    available: false,
    multiple: false,
    minFiles: 1,
    description: "Reconocé texto en PDFs escaneados.",
  },
]

const MAX_FILE_SIZE_MB = 100
const MAX_FILE_SIZE = MAX_FILE_SIZE_MB * 1024 * 1024

export default function PDFToolsPage() {
  const [selectedTool, setSelectedTool] = useState<ToolId>("merge")
  const [files, setFiles] = useState<FileItem[]>([])
  const [isDragging, setIsDragging] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)
  const [mergeOptions, setMergeOptions] = useState<MergeOptions>({ keepBookmarks: true })
  const [rotateOptions, setRotateOptions] = useState<RotateOptions>({ angle: 90 })
  const [splitOptions, setSplitOptions] = useState<SplitOptions>({ ranges: "" })

  const tool = useMemo(
    () => TOOLS.find((t) => t.id === selectedTool) ?? TOOLS[0],
    [selectedTool],
  )

  const handleSelectTool = useCallback((id: ToolId) => {
    const next = TOOLS.find((t) => t.id === id)
    if (!next || !next.available) return
    setSelectedTool(id)
    if (!next.multiple) {
      setFiles((prev) => prev.slice(0, 1))
    }
  }, [])

  const handleFilesAdded = useCallback(
    (incoming: File[]) => {
      const accepted: FileItem[] = []
      let rejectedSize = 0
      for (const file of incoming) {
        if (file.size > MAX_FILE_SIZE) {
          rejectedSize++
          continue
        }
        accepted.push({
          id: crypto.randomUUID(),
          file,
          fileName: file.name,
          pages: null,
        })
      }
      if (rejectedSize > 0) {
        toast.error(
          `${rejectedSize} archivo${rejectedSize > 1 ? "s" : ""} excede${rejectedSize > 1 ? "n" : ""} el límite de ${MAX_FILE_SIZE_MB} MB`,
        )
      }
      if (accepted.length === 0) return

      setFiles((prev) => {
        if (!tool.multiple) return accepted.slice(0, 1)
        return [...prev, ...accepted]
      })

      // Read page counts in the background
      for (const item of accepted) {
        countPages(item.file)
          .then((pages) => {
            setFiles((prev) =>
              prev.map((f) => (f.id === item.id ? { ...f, pages } : f)),
            )
          })
          .catch(() => {
            setFiles((prev) =>
              prev.map((f) =>
                f.id === item.id ? { ...f, pages: 0, error: "PDF inválido" } : f,
              ),
            )
          })
      }
    },
    [tool.multiple],
  )

  const handleRemoveFile = useCallback((id: string) => {
    setFiles((prev) => prev.filter((f) => f.id !== id))
  }, [])

  const handleClear = useCallback(() => setFiles([]), [])

  const canProcess = useMemo(() => {
    if (!tool.available) return false
    if (files.length < tool.minFiles) return false
    if (files.some((f) => f.error || f.pages === null)) return false
    if (tool.id === "split") {
      const file = files[0]
      if (!file || !file.pages) return false
      // Empty input is allowed (means: extract every page)
      if (!splitOptions.ranges.trim()) return true
      return parseRanges(splitOptions.ranges, file.pages).length > 0
    }
    return true
  }, [tool, files, splitOptions])

  const handleProcess = useCallback(async () => {
    if (!canProcess) return
    setIsProcessing(true)
    try {
      if (tool.id === "merge") {
        const bytes = await mergePDFs(files.map((f) => f.file))
        downloadBytes(bytes, "documento-unido.pdf")
        toast.success("PDF unido y descargado")
      } else if (tool.id === "rotate") {
        const bytes = await rotatePDF(files[0].file, rotateOptions.angle)
        const baseName = files[0].fileName.replace(/\.pdf$/i, "")
        downloadBytes(bytes, `${baseName}-rotado.pdf`)
        toast.success("PDF rotado y descargado")
      } else if (tool.id === "split") {
        const file = files[0]
        const total = file.pages ?? 0
        const ranges =
          splitOptions.ranges.trim().length > 0
            ? parseRanges(splitOptions.ranges, total)
            : Array.from({ length: total }, (_, i) => ({ from: i + 1, to: i + 1 }))
        if (ranges.length === 0) {
          toast.error("No se reconocieron rangos válidos")
          return
        }
        const results = await splitPDF(file.file, ranges)
        for (const r of results) {
          downloadBytes(r.bytes, r.name)
        }
        toast.success(`${results.length} archivo${results.length > 1 ? "s" : ""} descargado${results.length > 1 ? "s" : ""}`)
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Error procesando el PDF"
      toast.error(message)
    } finally {
      setIsProcessing(false)
    }
  }, [canProcess, tool.id, files, rotateOptions.angle, splitOptions.ranges])

  // Keyboard shortcut: Enter to process
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && canProcess && !isProcessing) {
        e.preventDefault()
        handleProcess()
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [canProcess, isProcessing, handleProcess])

  const actionLabel = useMemo(() => {
    if (isProcessing) return "Procesando..."
    if (tool.id === "merge") return "Unir y descargar"
    if (tool.id === "rotate") return "Rotar y descargar"
    if (tool.id === "split") return "Dividir y descargar"
    return tool.label
  }, [tool, isProcessing])

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-5xl mx-auto px-4 py-8 md:py-12">
        <header className="text-center mb-8 md:mb-12">
          <div className="flex items-center justify-center gap-3 mb-3">
            <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-primary">
              <FileText className="h-5 w-5 text-primary-foreground" />
            </div>
            <h1 className="text-2xl md:text-3xl font-semibold text-foreground">
              Herramientas PDF
            </h1>
          </div>
          <p className="text-muted-foreground">
            Rápido, gratis y privado. Tus archivos no salen de tu navegador.
          </p>
        </header>

        <section className="mb-8 md:mb-10">
          <div className="grid grid-cols-4 md:grid-cols-8 gap-2 md:gap-3">
            {TOOLS.map((t) => (
              <ToolCard
                key={t.id}
                icon={t.icon}
                label={t.label}
                isActive={selectedTool === t.id}
                comingSoon={!t.available}
                onClick={() => handleSelectTool(t.id)}
              />
            ))}
          </div>
        </section>

        <section className="mb-2">
          <p className="text-sm text-muted-foreground text-center">{tool.description}</p>
        </section>

        <section className="mb-6 mt-6">
          <DropZone
            onFilesAdded={handleFilesAdded}
            isDragging={isDragging}
            setIsDragging={setIsDragging}
            multiple={tool.multiple}
            hint={
              tool.multiple
                ? `o haz clic para seleccionar · máx. ${MAX_FILE_SIZE_MB} MB por archivo`
                : `o haz clic para seleccionar un archivo · máx. ${MAX_FILE_SIZE_MB} MB`
            }
          />
        </section>

        {files.length > 0 && (
          <section className="mb-6">
            <FileList
              files={files}
              reorderable={tool.multiple}
              onRemove={handleRemoveFile}
              onReorder={setFiles}
            />
          </section>
        )}

        {files.length > 0 && (
          <section className="mb-6">
            <OptionsPanel
              selectedTool={tool.id}
              mergeOptions={mergeOptions}
              rotateOptions={rotateOptions}
              splitOptions={splitOptions}
              onMergeChange={setMergeOptions}
              onRotateChange={setRotateOptions}
              onSplitChange={setSplitOptions}
            />
          </section>
        )}

        {files.length > 0 && (
          <section className="flex flex-col gap-4">
            {tool.id === "merge" && files.length < 2 && (
              <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/50 border">
                <AlertCircle className="h-4 w-4 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">
                  Agregá al menos 2 archivos para unir.
                </p>
              </div>
            )}

            <div className="flex flex-col sm:flex-row gap-3">
              <Button
                size="lg"
                className="flex-1"
                onClick={handleProcess}
                disabled={!canProcess || isProcessing}
              >
                {isProcessing ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    {actionLabel}
                  </>
                ) : (
                  <>
                    <Download className="h-4 w-4 mr-2" />
                    {actionLabel}
                  </>
                )}
              </Button>
              <Button
                size="lg"
                variant="outline"
                onClick={handleClear}
                disabled={isProcessing}
                className="sm:flex-none"
              >
                Limpiar
              </Button>
            </div>
          </section>
        )}
      </div>
    </div>
  )
}
