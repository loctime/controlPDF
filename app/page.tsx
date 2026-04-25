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
import { PageGrid } from "@/components/page-grid"
import { Button } from "@/components/ui/button"
import {
  getPageCount,
  releaseDocument,
  mergePDFs,
  rotatePDF,
  rotatePagesIndividually,
  splitPDF,
  parseRanges,
  rangesEveryN,
  pagesToRanges,
  downloadBytes,
  type MergeInput,
  type SplitRange,
} from "@/lib/pdf"

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
    description: "Rotá todo el documento o página por página.",
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

const DEFAULT_MERGE: MergeOptions = { keepBookmarks: true }
const DEFAULT_ROTATE: RotateOptions = { mode: "all", angle: 90 }
const DEFAULT_SPLIT: SplitOptions = { mode: "ranges", ranges: "", everyN: 1 }

export default function PDFToolsPage() {
  const [selectedTool, setSelectedTool] = useState<ToolId>("merge")
  const [files, setFiles] = useState<FileItem[]>([])
  const [isDragging, setIsDragging] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)
  const [mergeOptions, setMergeOptions] = useState<MergeOptions>(DEFAULT_MERGE)
  const [rotateOptions, setRotateOptions] = useState<RotateOptions>(DEFAULT_ROTATE)
  const [splitOptions, setSplitOptions] = useState<SplitOptions>(DEFAULT_SPLIT)
  const [selectedPages, setSelectedPages] = useState<Set<number>>(new Set())
  const [perPageRotations, setPerPageRotations] = useState<Map<number, number>>(
    new Map(),
  )
  const [mergeRemovedPages, setMergeRemovedPages] = useState<
    Map<string, Set<number>>
  >(new Map())

  const tool = useMemo(
    () => TOOLS.find((t) => t.id === selectedTool) ?? TOOLS[0],
    [selectedTool],
  )

  const resetPageState = useCallback(() => {
    setSelectedPages(new Set())
    setPerPageRotations(new Map())
    setMergeRemovedPages(new Map())
  }, [])

  const toggleMergePageRemoval = useCallback(
    (fileId: string, pageNumber: number) => {
      setMergeRemovedPages((prev) => {
        const next = new Map(prev)
        const current = new Set(next.get(fileId) ?? [])
        if (current.has(pageNumber)) current.delete(pageNumber)
        else current.add(pageNumber)
        if (current.size === 0) next.delete(fileId)
        else next.set(fileId, current)
        return next
      })
    },
    [],
  )

  const handleSelectTool = useCallback(
    (id: ToolId) => {
      const next = TOOLS.find((t) => t.id === id)
      if (!next || !next.available) return
      setSelectedTool(id)
      resetPageState()
      if (!next.multiple) {
        setFiles((prev) => prev.slice(0, 1))
      }
    },
    [resetPageState],
  )

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
      resetPageState()

      for (const item of accepted) {
        getPageCount(item.file)
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
    [tool.multiple, resetPageState],
  )

  const handleRemoveFile = useCallback(
    (id: string) => {
      setFiles((prev) => {
        const removed = prev.find((f) => f.id === id)
        if (removed) releaseDocument(removed.file)
        return prev.filter((f) => f.id !== id)
      })
      setMergeRemovedPages((prev) => {
        if (!prev.has(id)) return prev
        const next = new Map(prev)
        next.delete(id)
        return next
      })
      setSelectedPages(new Set())
      setPerPageRotations(new Map())
    },
    [],
  )

  const handleClear = useCallback(() => {
    setFiles((prev) => {
      for (const f of prev) releaseDocument(f.file)
      return []
    })
    resetPageState()
  }, [resetPageState])

  useEffect(() => {
    return () => {
      for (const f of files) releaseDocument(f.file)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const togglePageSelection = useCallback((pageNumber: number) => {
    setSelectedPages((prev) => {
      const next = new Set(prev)
      if (next.has(pageNumber)) next.delete(pageNumber)
      else next.add(pageNumber)
      return next
    })
  }, [])

  const incrementPageRotation = useCallback((pageNumber: number) => {
    setPerPageRotations((prev) => {
      const next = new Map(prev)
      const current = next.get(pageNumber) ?? 0
      const updated = (current + 90) % 360
      if (updated === 0) next.delete(pageNumber)
      else next.set(pageNumber, updated)
      return next
    })
  }, [])

  const computeSplitRanges = useCallback((): SplitRange[] => {
    const file = files[0]
    if (!file || !file.pages) return []
    const total = file.pages
    if (splitOptions.mode === "ranges") {
      if (!splitOptions.ranges.trim()) {
        return Array.from({ length: total }, (_, i) => ({
          from: i + 1,
          to: i + 1,
        }))
      }
      return parseRanges(splitOptions.ranges, total)
    }
    if (splitOptions.mode === "everyN") {
      return rangesEveryN(total, Math.max(1, splitOptions.everyN))
    }
    if (splitOptions.mode === "visual") {
      return pagesToRanges(Array.from(selectedPages))
    }
    return []
  }, [files, splitOptions, selectedPages])

  const computeMergeInputs = useCallback((): MergeInput[] => {
    return files
      .filter((f) => f.pages && !f.error)
      .map((f) => {
        const removed = mergeRemovedPages.get(f.id)
        if (!removed || removed.size === 0) {
          return { file: f.file }
        }
        const total = f.pages ?? 0
        const includePages: number[] = []
        for (let n = 1; n <= total; n++) {
          if (!removed.has(n)) includePages.push(n)
        }
        return { file: f.file, includePages }
      })
      .filter((m) => !m.includePages || m.includePages.length > 0)
  }, [files, mergeRemovedPages])

  const canProcess = useMemo(() => {
    if (!tool.available) return false
    if (files.length < tool.minFiles) return false
    if (files.some((f) => f.error || f.pages === null)) return false
    if (tool.id === "split") {
      return computeSplitRanges().length > 0
    }
    if (tool.id === "rotate" && rotateOptions.mode === "perPage") {
      return perPageRotations.size > 0
    }
    if (tool.id === "merge") {
      return computeMergeInputs().length >= 2
    }
    return true
  }, [
    tool,
    files,
    computeSplitRanges,
    rotateOptions.mode,
    perPageRotations,
    computeMergeInputs,
  ])

  const handleProcess = useCallback(async () => {
    if (!canProcess) return
    setIsProcessing(true)
    try {
      if (tool.id === "merge") {
        const inputs = computeMergeInputs()
        const bytes = await mergePDFs(inputs)
        downloadBytes(bytes, "documento-unido.pdf")
        toast.success("PDF unido y descargado")
      } else if (tool.id === "rotate") {
        const file = files[0]
        const baseName = file.fileName.replace(/\.pdf$/i, "")
        const bytes =
          rotateOptions.mode === "perPage"
            ? await rotatePagesIndividually(file.file, perPageRotations)
            : await rotatePDF(file.file, rotateOptions.angle)
        downloadBytes(bytes, `${baseName}-rotado.pdf`)
        toast.success("PDF rotado y descargado")
      } else if (tool.id === "split") {
        const file = files[0]
        const ranges = computeSplitRanges()
        if (ranges.length === 0) {
          toast.error("No se reconocieron rangos válidos")
          return
        }
        const results = await splitPDF(file.file, ranges)
        for (const r of results) {
          downloadBytes(r.bytes, r.name)
        }
        toast.success(
          `${results.length} archivo${results.length > 1 ? "s" : ""} descargado${results.length > 1 ? "s" : ""}`,
        )
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Error procesando el PDF"
      toast.error(message)
    } finally {
      setIsProcessing(false)
    }
  }, [
    canProcess,
    tool.id,
    files,
    rotateOptions,
    perPageRotations,
    computeSplitRanges,
    computeMergeInputs,
  ])

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

  const showVisualSplit =
    tool.id === "split" && splitOptions.mode === "visual" && files.length === 1
  const showPerPageRotate =
    tool.id === "rotate" && rotateOptions.mode === "perPage" && files.length === 1
  const showPlainGrid =
    !tool.multiple &&
    files.length === 1 &&
    (files[0].pages ?? 0) > 0 &&
    !showVisualSplit &&
    !showPerPageRotate

  const splitPreviewCount = useMemo(() => {
    if (tool.id !== "split") return 0
    return computeSplitRanges().length
  }, [tool.id, computeSplitRanges])

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
              renderExpanded={
                tool.id === "merge"
                  ? (item) => {
                      const removed =
                        mergeRemovedPages.get(item.id) ?? new Set<number>()
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
                                onClick={() =>
                                  setMergeRemovedPages((prev) => {
                                    const next = new Map(prev)
                                    next.delete(item.id)
                                    return next
                                  })
                                }
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
                            onRemove={(pn) => toggleMergePageRemoval(item.id, pn)}
                          />
                        </div>
                      )
                    }
                  : undefined
              }
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

        {showVisualSplit && (
          <section className="mb-6 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                {selectedPages.size === 0
                  ? "Tocá las páginas que querés extraer."
                  : `${selectedPages.size} página${selectedPages.size === 1 ? "" : "s"} seleccionada${selectedPages.size === 1 ? "" : "s"} · ${splitPreviewCount} archivo${splitPreviewCount === 1 ? "" : "s"} resultado.`}
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
            <PageGrid
              file={files[0].file}
              pageCount={files[0].pages ?? 0}
              selectedPages={selectedPages}
              onSelect={togglePageSelection}
            />
          </section>
        )}

        {showPerPageRotate && (
          <section className="mb-6 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                {perPageRotations.size === 0
                  ? "Pasá el mouse y tocá el icono ↻ en cada página que quieras girar."
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
            <PageGrid
              file={files[0].file}
              pageCount={files[0].pages ?? 0}
              rotations={perPageRotations}
              onRotate={incrementPageRotation}
            />
          </section>
        )}

        {showPlainGrid && (
          <section className="mb-6">
            <PageGrid file={files[0].file} pageCount={files[0].pages ?? 0} />
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
