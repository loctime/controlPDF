"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { toast } from "sonner"
import { FileList } from "@/components/file-list"
import { OptionsCard } from "@/components/options-card"
import { ActionBar } from "@/components/tools/action-bar"
import type { ToolPanelProps } from "@/components/tools/types"
import { downloadBytes, readMetadata, setMetadata } from "@/lib/pdf"

interface MetadataForm {
  title: string
  author: string
  subject: string
  keywords: string
  creator: string
  producer: string
}

const EMPTY: MetadataForm = {
  title: "",
  author: "",
  subject: "",
  keywords: "",
  creator: "",
  producer: "",
}

export function MetadataPanel({
  files,
  isProcessing,
  setIsProcessing,
  setFiles,
  onRemoveFile,
  onClearFiles,
}: ToolPanelProps) {
  const [form, setForm] = useState<MetadataForm>(EMPTY)
  const loadedFor = useRef<string | null>(null)

  const file = files[0]
  const canProcess = !!file && !file.error

  useEffect(() => {
    if (!file) {
      loadedFor.current = null
      setForm(EMPTY)
      return
    }
    if (loadedFor.current === file.id) return
    loadedFor.current = file.id
    readMetadata(file.file)
      .then((m) =>
        setForm({
          title: m.title ?? "",
          author: m.author ?? "",
          subject: m.subject ?? "",
          keywords: (m.keywords ?? []).join(", "),
          creator: m.creator ?? "",
          producer: m.producer ?? "",
        }),
      )
      .catch(() => setForm(EMPTY))
  }, [file])

  const handleProcess = useCallback(async () => {
    if (!canProcess || !file) return
    setIsProcessing(true)
    try {
      const bytes = await setMetadata(file.file, {
        title: form.title,
        author: form.author,
        subject: form.subject,
        keywords: form.keywords
          .split(/[,;]/)
          .map((k) => k.trim())
          .filter(Boolean),
        creator: form.creator,
        producer: form.producer,
      })
      const baseName = file.fileName.replace(/\.pdf$/i, "")
      downloadBytes(bytes, `${baseName}.pdf`)
      toast.success("Metadatos guardados y descargados")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error procesando el PDF")
    } finally {
      setIsProcessing(false)
    }
  }, [canProcess, file, form, setIsProcessing])

  const handleField = (key: keyof MetadataForm) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) => setForm((prev) => ({ ...prev, [key]: e.target.value }))

  if (files.length === 0) return null

  return (
    <div className="space-y-6">
      <FileList
        files={files}
        reorderable={false}
        onRemove={onRemoveFile}
        onReorder={setFiles}
      />

      <OptionsCard title="Metadatos del documento">
        <div className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm text-foreground" htmlFor="md-title">
              Título
            </label>
            <input
              id="md-title"
              type="text"
              value={form.title}
              onChange={handleField("title")}
              className="w-full p-2 text-sm rounded-md border border-input bg-background text-foreground"
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm text-foreground" htmlFor="md-author">
              Autor
            </label>
            <input
              id="md-author"
              type="text"
              value={form.author}
              onChange={handleField("author")}
              className="w-full p-2 text-sm rounded-md border border-input bg-background text-foreground"
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm text-foreground" htmlFor="md-subject">
              Asunto
            </label>
            <input
              id="md-subject"
              type="text"
              value={form.subject}
              onChange={handleField("subject")}
              className="w-full p-2 text-sm rounded-md border border-input bg-background text-foreground"
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm text-foreground" htmlFor="md-keywords">
              Palabras clave (separadas por coma)
            </label>
            <input
              id="md-keywords"
              type="text"
              value={form.keywords}
              onChange={handleField("keywords")}
              placeholder="contrato, 2025, legal"
              className="w-full p-2 text-sm rounded-md border border-input bg-background text-foreground placeholder:text-muted-foreground"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <label className="text-sm text-foreground" htmlFor="md-creator">
                Creador
              </label>
              <input
                id="md-creator"
                type="text"
                value={form.creator}
                onChange={handleField("creator")}
                className="w-full p-2 text-sm rounded-md border border-input bg-background text-foreground"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm text-foreground" htmlFor="md-producer">
                Productor
              </label>
              <input
                id="md-producer"
                type="text"
                value={form.producer}
                onChange={handleField("producer")}
                className="w-full p-2 text-sm rounded-md border border-input bg-background text-foreground"
              />
            </div>
          </div>
        </div>
      </OptionsCard>

      <ActionBar
        isProcessing={isProcessing}
        canProcess={canProcess}
        label="Guardar metadatos"
        onProcess={handleProcess}
        onClear={onClearFiles}
      />
    </div>
  )
}
