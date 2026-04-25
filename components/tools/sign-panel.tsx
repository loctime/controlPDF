"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { ImagePlus, PenTool, Type } from "lucide-react"
import { toast } from "sonner"
import { FileList } from "@/components/file-list"
import { OptionsCard } from "@/components/options-card"
import { PageGrid } from "@/components/page-grid"
import {
  SignaturePad,
  type SignaturePadHandle,
} from "@/components/signature-pad"
import {
  SignPageEditor,
  type SignaturePosition,
} from "@/components/sign-page-editor"
import { ActionBar } from "@/components/tools/action-bar"
import type { ToolPanelProps } from "@/components/tools/types"
import {
  applySignature,
  downloadBytes,
  renderTextSignatureToDataUrl,
} from "@/lib/pdf"

type SignatureMode = "draw" | "upload" | "text"

const DEFAULT_POSITION: SignaturePosition = {
  xRatio: 0.55,
  yRatio: 0.85,
  widthRatio: 0.35,
}

async function imageDataUrlAspect(dataUrl: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      if (!img.naturalWidth) {
        reject(new Error("Imagen vacía"))
        return
      }
      resolve(img.naturalHeight / img.naturalWidth)
    }
    img.onerror = () => reject(new Error("Imagen inválida"))
    img.src = dataUrl
  })
}

async function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error ?? new Error("read error"))
    reader.readAsDataURL(file)
  })
}

export function SignPanel({
  files,
  isProcessing,
  setIsProcessing,
  setFiles,
  onRemoveFile,
  onClearFiles,
}: ToolPanelProps) {
  const [mode, setMode] = useState<SignatureMode>("draw")
  const [signatureSrc, setSignatureSrc] = useState<string | null>(null)
  const [signatureAspect, setSignatureAspect] = useState(0.3)
  const [textValue, setTextValue] = useState("")
  const [pageNumber, setPageNumber] = useState<number | null>(null)
  const [position, setPosition] = useState<SignaturePosition>(DEFAULT_POSITION)
  const padRef = useRef<SignaturePadHandle>(null)

  const file = files[0]
  const totalPages = file?.pages ?? 0

  // Auto-pick first page when a file loads
  useEffect(() => {
    if (file && totalPages > 0 && pageNumber === null) {
      setPageNumber(1)
    }
    if (!file) setPageNumber(null)
  }, [file, totalPages, pageNumber])

  // Update text signature live
  useEffect(() => {
    if (mode !== "text") return
    if (!textValue.trim()) {
      setSignatureSrc(null)
      return
    }
    const dataUrl = renderTextSignatureToDataUrl(textValue.trim())
    setSignatureSrc(dataUrl)
    imageDataUrlAspect(dataUrl)
      .then(setSignatureAspect)
      .catch(() => {})
  }, [textValue, mode])

  const handleCaptureDrawn = useCallback(async () => {
    const handle = padRef.current
    if (!handle || handle.isEmpty()) {
      toast.error("Dibujá una firma primero")
      return
    }
    const url = handle.toDataURL()
    setSignatureSrc(url)
    try {
      const aspect = await imageDataUrlAspect(url)
      setSignatureAspect(aspect)
    } catch {
      setSignatureAspect(0.3)
    }
  }, [])

  const handleUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    e.target.value = ""
    if (!f) return
    if (!f.type.startsWith("image/")) {
      toast.error("Subí una imagen (PNG o JPG)")
      return
    }
    try {
      const url = await fileToDataUrl(f)
      setSignatureSrc(url)
      const aspect = await imageDataUrlAspect(url)
      setSignatureAspect(aspect)
    } catch {
      toast.error("No se pudo leer la imagen")
    }
  }, [])

  const canProcess = useMemo(
    () =>
      !!file &&
      !file.error &&
      !!totalPages &&
      !!signatureSrc &&
      pageNumber !== null,
    [file, totalPages, signatureSrc, pageNumber],
  )

  const handleProcess = useCallback(async () => {
    if (!canProcess || !file || !signatureSrc || pageNumber === null) return
    setIsProcessing(true)
    try {
      const bytes = await applySignature(file.file, signatureSrc, {
        pageNumber,
        xRatio: position.xRatio,
        yRatio: position.yRatio,
        widthRatio: position.widthRatio,
      })
      const baseName = file.fileName.replace(/\.pdf$/i, "")
      downloadBytes(bytes, `${baseName}-firmado.pdf`)
      toast.success("PDF firmado y descargado")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error procesando el PDF")
    } finally {
      setIsProcessing(false)
    }
  }, [canProcess, file, signatureSrc, pageNumber, position, setIsProcessing])

  const handleClear = useCallback(() => {
    onClearFiles()
    setSignatureSrc(null)
    setTextValue("")
    setPageNumber(null)
    setPosition(DEFAULT_POSITION)
    padRef.current?.clear()
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

      <OptionsCard title="Crear firma">
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-2 rounded-md border p-1">
            <ModeButton
              active={mode === "draw"}
              onClick={() => setMode("draw")}
              icon={<PenTool className="h-4 w-4" />}
              label="Dibujar"
            />
            <ModeButton
              active={mode === "upload"}
              onClick={() => setMode("upload")}
              icon={<ImagePlus className="h-4 w-4" />}
              label="Imagen"
            />
            <ModeButton
              active={mode === "text"}
              onClick={() => setMode("text")}
              icon={<Type className="h-4 w-4" />}
              label="Texto"
            />
          </div>

          {mode === "draw" && (
            <div className="space-y-2">
              <SignaturePad
                ref={padRef}
                onChange={(empty) => empty && setSignatureSrc(null)}
              />
              <button
                type="button"
                onClick={handleCaptureDrawn}
                className="text-xs text-primary hover:underline"
              >
                Usar esta firma
              </button>
            </div>
          )}

          {mode === "upload" && (
            <div className="space-y-2">
              <input
                type="file"
                accept="image/png,image/jpeg"
                onChange={handleUpload}
                className="block w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-primary file:px-3 file:py-1.5 file:text-primary-foreground file:cursor-pointer"
              />
              <p className="text-xs text-muted-foreground">
                Recomendado: PNG con fondo transparente.
              </p>
            </div>
          )}

          {mode === "text" && (
            <div className="space-y-2">
              <input
                type="text"
                value={textValue}
                onChange={(e) => setTextValue(e.target.value)}
                placeholder="Escribí tu nombre"
                className="w-full p-2 text-sm rounded-md border border-input bg-background text-foreground"
              />
            </div>
          )}

          {signatureSrc && (
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Vista previa</p>
              <div className="flex items-center justify-center rounded-md border bg-muted/30 p-3">
                <img
                  src={signatureSrc}
                  alt="Firma"
                  className="max-h-24 max-w-full object-contain"
                />
              </div>
            </div>
          )}
        </div>
      </OptionsCard>

      {file && totalPages > 0 && (
        <OptionsCard title="Elegí la página">
          <PageGrid
            file={file.file}
            pageCount={totalPages}
            selectedPages={
              pageNumber !== null ? new Set([pageNumber]) : undefined
            }
            onSelect={(pn) => setPageNumber(pn)}
          />
        </OptionsCard>
      )}

      {file && pageNumber !== null && signatureSrc && (
        <OptionsCard title="Posicioná la firma">
          <div className="space-y-4">
            <div className="mx-auto max-w-md">
              <SignPageEditor
                file={file.file}
                pageNumber={pageNumber}
                signatureSrc={signatureSrc}
                signatureAspect={signatureAspect}
                position={position}
                onPositionChange={setPosition}
              />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-foreground">Tamaño</span>
                <span className="text-xs text-muted-foreground">
                  {Math.round(position.widthRatio * 100)}% del ancho
                </span>
              </div>
              <input
                type="range"
                min={0.1}
                max={0.9}
                step={0.05}
                value={position.widthRatio}
                onChange={(e) =>
                  setPosition((p) => ({
                    ...p,
                    widthRatio: Number(e.target.value),
                  }))
                }
                className="w-full accent-primary"
              />
              <p className="text-xs text-muted-foreground">
                Arrastrá la firma sobre la página para ajustar la posición.
              </p>
            </div>
          </div>
        </OptionsCard>
      )}

      <ActionBar
        isProcessing={isProcessing}
        canProcess={canProcess}
        label="Firmar y descargar"
        onProcess={handleProcess}
        onClear={handleClear}
        warning={
          !signatureSrc ? (
            <p className="text-xs text-muted-foreground">
              Creá una firma para continuar.
            </p>
          ) : null
        }
      />
    </div>
  )
}

function ModeButton({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean
  onClick: () => void
  icon: React.ReactNode
  label: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center justify-center gap-2 rounded-sm px-3 py-2 text-sm transition-colors ${
        active ? "bg-primary text-primary-foreground" : "hover:bg-muted/60"
      }`}
    >
      {icon}
      {label}
    </button>
  )
}
