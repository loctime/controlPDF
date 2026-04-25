"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
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
  Hash,
  Droplet,
  Info,
} from "lucide-react"
import { toast } from "sonner"
import { ToolCard } from "@/components/tool-card"
import { DropZone } from "@/components/drop-zone"
import type { FileItem } from "@/components/file-list"
import { MergePanel } from "@/components/tools/merge-panel"
import { SplitPanel } from "@/components/tools/split-panel"
import { RotatePanel } from "@/components/tools/rotate-panel"
import { ConvertPanel } from "@/components/tools/convert-panel"
import { CompressPanel } from "@/components/tools/compress-panel"
import { ProtectPanel } from "@/components/tools/protect-panel"
import { PageNumbersPanel } from "@/components/tools/page-numbers-panel"
import { WatermarkPanel } from "@/components/tools/watermark-panel"
import { MetadataPanel } from "@/components/tools/metadata-panel"
import { getPageCount, releaseDocument } from "@/lib/pdf"

type ToolId =
  | "merge"
  | "split"
  | "compress"
  | "convert"
  | "rotate"
  | "protect"
  | "sign"
  | "ocr"
  | "pageNumbers"
  | "watermark"
  | "metadata"

interface Tool {
  id: ToolId
  label: string
  icon: typeof Layers
  available: boolean
  multiple: boolean
  description: string
}

const TOOLS: Tool[] = [
  {
    id: "merge",
    label: "Unir PDF",
    icon: Layers,
    available: true,
    multiple: true,
    description: "Combina varios PDFs en uno solo. Reordená arrastrando.",
  },
  {
    id: "split",
    label: "Dividir PDF",
    icon: Scissors,
    available: true,
    multiple: false,
    description: "Extraé páginas o rangos en archivos separados.",
  },
  {
    id: "rotate",
    label: "Rotar PDF",
    icon: RotateCw,
    available: true,
    multiple: false,
    description: "Rotá todo el documento o página por página.",
  },
  {
    id: "compress",
    label: "Comprimir",
    icon: Minimize2,
    available: true,
    multiple: false,
    description: "Reducí el tamaño rasterizando cada página como imagen.",
  },
  {
    id: "convert",
    label: "PDF a imagen",
    icon: RefreshCw,
    available: true,
    multiple: false,
    description: "Convertí cada página en una imagen JPG o PNG.",
  },
  {
    id: "protect",
    label: "Proteger",
    icon: Lock,
    available: true,
    multiple: false,
    description: "Agregá o quitá contraseña y permisos del PDF.",
  },
  {
    id: "sign",
    label: "Firmar",
    icon: PenTool,
    available: false,
    multiple: false,
    description: "Firmá documentos digitalmente.",
  },
  {
    id: "ocr",
    label: "OCR",
    icon: ScanText,
    available: false,
    multiple: false,
    description: "Reconocé texto en PDFs escaneados.",
  },
  {
    id: "pageNumbers",
    label: "Numerar",
    icon: Hash,
    available: true,
    multiple: false,
    description: "Agregá números de página con formato y posición a elección.",
  },
  {
    id: "watermark",
    label: "Marca de agua",
    icon: Droplet,
    available: true,
    multiple: false,
    description: "Aplicá un sello de texto en todas las páginas.",
  },
  {
    id: "metadata",
    label: "Metadatos",
    icon: Info,
    available: true,
    multiple: false,
    description: "Editá título, autor, asunto y palabras clave del PDF.",
  },
]

const MAX_FILE_SIZE_MB = 100
const MAX_FILE_SIZE = MAX_FILE_SIZE_MB * 1024 * 1024

export default function PDFToolsPage() {
  const [selectedTool, setSelectedTool] = useState<ToolId>("merge")
  const [files, setFiles] = useState<FileItem[]>([])
  const [isDragging, setIsDragging] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)

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

      setFiles((prev) =>
        tool.multiple ? [...prev, ...accepted] : accepted.slice(0, 1),
      )

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
    [tool.multiple],
  )

  const handleRemoveFile = useCallback((id: string) => {
    setFiles((prev) => {
      const removed = prev.find((f) => f.id === id)
      if (removed) releaseDocument(removed.file)
      return prev.filter((f) => f.id !== id)
    })
  }, [])

  const handleClearFiles = useCallback(() => {
    setFiles((prev) => {
      for (const f of prev) releaseDocument(f.file)
      return []
    })
  }, [])

  useEffect(() => {
    return () => {
      for (const f of files) releaseDocument(f.file)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const panelProps = {
    files,
    isProcessing,
    setIsProcessing,
    setFiles,
    onRemoveFile: handleRemoveFile,
    onClearFiles: handleClearFiles,
  }

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
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-6 gap-2 md:gap-3">
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
          <p className="text-sm text-muted-foreground text-center">
            {tool.description}
          </p>
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

        {selectedTool === "merge" && <MergePanel key="merge" {...panelProps} />}
        {selectedTool === "split" && <SplitPanel key="split" {...panelProps} />}
        {selectedTool === "rotate" && <RotatePanel key="rotate" {...panelProps} />}
        {selectedTool === "convert" && (
          <ConvertPanel key="convert" {...panelProps} />
        )}
        {selectedTool === "compress" && (
          <CompressPanel key="compress" {...panelProps} />
        )}
        {selectedTool === "protect" && (
          <ProtectPanel key="protect" {...panelProps} />
        )}
        {selectedTool === "pageNumbers" && (
          <PageNumbersPanel key="pageNumbers" {...panelProps} />
        )}
        {selectedTool === "watermark" && (
          <WatermarkPanel key="watermark" {...panelProps} />
        )}
        {selectedTool === "metadata" && (
          <MetadataPanel key="metadata" {...panelProps} />
        )}
      </div>
    </div>
  )
}
