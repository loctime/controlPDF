"use client"

import { useState, useCallback } from "react"
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
} from "lucide-react"
import { ToolCard } from "@/components/tool-card"
import { DropZone } from "@/components/drop-zone"
import { FileList, type FileItem } from "@/components/file-list"
import { OptionsPanel } from "@/components/options-panel"
import { Button } from "@/components/ui/button"

const tools = [
  { id: "merge", label: "Unir PDF", icon: Layers },
  { id: "split", label: "Dividir PDF", icon: Scissors },
  { id: "compress", label: "Comprimir PDF", icon: Minimize2 },
  { id: "convert", label: "Convertir PDF", icon: RefreshCw },
  { id: "rotate", label: "Rotar PDF", icon: RotateCw },
  { id: "protect", label: "Proteger PDF", icon: Lock },
  { id: "sign", label: "Firmar PDF", icon: PenTool },
  { id: "ocr", label: "OCR PDF", icon: ScanText },
]

export default function PDFToolsPage() {
  const [selectedTool, setSelectedTool] = useState("merge")
  const [files, setFiles] = useState<FileItem[]>([])
  const [isDragging, setIsDragging] = useState(false)

  const handleFilesAdded = useCallback((newFiles: File[]) => {
    const fileItems: FileItem[] = newFiles.map((file) => ({
      id: crypto.randomUUID(),
      file,
      pages: Math.floor(Math.random() * 20) + 1, // Simulado - en producción usarías pdf.js
    }))
    setFiles((prev) => [...prev, ...fileItems])
  }, [])

  const handleRemoveFile = useCallback((id: string) => {
    setFiles((prev) => prev.filter((f) => f.id !== id))
  }, [])

  const handleReorderFiles = useCallback((newFiles: FileItem[]) => {
    setFiles(newFiles)
  }, [])

  const getToolName = () => {
    const tool = tools.find((t) => t.id === selectedTool)
    return tool?.label || "Procesar PDF"
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-5xl mx-auto px-4 py-8 md:py-12">
        {/* Header */}
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
            Todas las herramientas que necesitas para trabajar con archivos PDF
          </p>
        </header>

        {/* Tool Grid */}
        <section className="mb-8 md:mb-10">
          <div className="grid grid-cols-4 md:grid-cols-8 gap-2 md:gap-3">
            {tools.map((tool) => (
              <ToolCard
                key={tool.id}
                icon={tool.icon}
                label={tool.label}
                isActive={selectedTool === tool.id}
                onClick={() => setSelectedTool(tool.id)}
              />
            ))}
          </div>
        </section>

        {/* Drop Zone */}
        <section className="mb-6">
          <DropZone
            onFilesAdded={handleFilesAdded}
            isDragging={isDragging}
            setIsDragging={setIsDragging}
          />
        </section>

        {/* File List */}
        {files.length > 0 && (
          <section className="mb-6">
            <FileList
              files={files}
              onRemove={handleRemoveFile}
              onReorder={handleReorderFiles}
            />
          </section>
        )}

        {/* Options Panel */}
        {files.length > 0 && (
          <section className="mb-6">
            <OptionsPanel selectedTool={selectedTool} />
          </section>
        )}

        {/* Action Buttons */}
        {files.length > 0 && (
          <section className="flex flex-col sm:flex-row gap-3">
            <Button size="lg" className="flex-1">
              {getToolName()}
            </Button>
            <Button size="lg" variant="outline" className="flex-1 sm:flex-none bg-transparent">
              Guardar en ControlFile
            </Button>
          </section>
        )}
      </div>
    </div>
  )
}
