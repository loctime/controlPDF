"use client"

import { useCallback, useState } from "react"
import { toast } from "sonner"
import { FileList } from "@/components/file-list"
import { OptionsCard } from "@/components/options-card"
import { PageGrid } from "@/components/page-grid"
import { ActionBar } from "@/components/tools/action-bar"
import type { ToolPanelProps } from "@/components/tools/types"
import { addTextWatermark, downloadBytes, type TextPosition } from "@/lib/pdf"

const POSITIONS: Array<{ value: TextPosition; label: string }> = [
  { value: "center", label: "Centro" },
  { value: "topCenter", label: "Superior centro" },
  { value: "bottomCenter", label: "Inferior centro" },
  { value: "topLeft", label: "Superior izquierda" },
  { value: "topRight", label: "Superior derecha" },
  { value: "bottomLeft", label: "Inferior izquierda" },
  { value: "bottomRight", label: "Inferior derecha" },
]

function hexToRgb(hex: string) {
  const sanitized = hex.replace("#", "")
  const value = parseInt(sanitized, 16)
  return {
    r: ((value >> 16) & 0xff) / 255,
    g: ((value >> 8) & 0xff) / 255,
    b: (value & 0xff) / 255,
  }
}

export function WatermarkPanel({
  files,
  isProcessing,
  setIsProcessing,
  setFiles,
  onRemoveFile,
  onClearFiles,
}: ToolPanelProps) {
  const [text, setText] = useState("CONFIDENCIAL")
  const [fontSize, setFontSize] = useState(72)
  const [opacity, setOpacity] = useState(0.25)
  const [rotation, setRotation] = useState(-30)
  const [position, setPosition] = useState<TextPosition>("center")
  const [color, setColor] = useState("#9ca3af")

  const file = files[0]
  const totalPages = file?.pages ?? 0
  const canProcess = !!file && !file.error && !!totalPages && text.trim().length > 0

  const handleProcess = useCallback(async () => {
    if (!canProcess || !file) return
    setIsProcessing(true)
    try {
      const bytes = await addTextWatermark(file.file, {
        text: text.trim(),
        fontSize,
        opacity,
        rotation,
        position,
        color: hexToRgb(color),
      })
      const baseName = file.fileName.replace(/\.pdf$/i, "")
      downloadBytes(bytes, `${baseName}-marca-de-agua.pdf`)
      toast.success("PDF con marca de agua descargado")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error procesando el PDF")
    } finally {
      setIsProcessing(false)
    }
  }, [
    canProcess,
    file,
    text,
    fontSize,
    opacity,
    rotation,
    position,
    color,
    setIsProcessing,
  ])

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
            <label className="text-sm text-foreground" htmlFor="opt-wm-text">
              Texto
            </label>
            <input
              id="opt-wm-text"
              type="text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="CONFIDENCIAL"
              className="w-full p-2 text-sm rounded-md border border-input bg-background text-foreground"
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm text-foreground" htmlFor="opt-wm-position">
              Posición
            </label>
            <select
              id="opt-wm-position"
              value={position}
              onChange={(e) => setPosition(e.target.value as TextPosition)}
              className="w-full p-2 text-sm rounded-md border border-input bg-background text-foreground"
            >
              {POSITIONS.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <label className="text-sm text-foreground" htmlFor="opt-wm-size">
                Tamaño (pt)
              </label>
              <input
                id="opt-wm-size"
                type="number"
                min={8}
                max={300}
                value={fontSize}
                onChange={(e) =>
                  setFontSize(
                    Math.max(8, Math.min(300, Number(e.target.value) || 72)),
                  )
                }
                className="w-full p-2 text-sm rounded-md border border-input bg-background text-foreground"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm text-foreground" htmlFor="opt-wm-color">
                Color
              </label>
              <input
                id="opt-wm-color"
                type="color"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                className="h-9 w-full rounded-md border border-input bg-background"
              />
            </div>
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-sm text-foreground" htmlFor="opt-wm-opacity">
                Opacidad
              </label>
              <span className="text-xs text-muted-foreground">
                {Math.round(opacity * 100)}%
              </span>
            </div>
            <input
              id="opt-wm-opacity"
              type="range"
              min={0.05}
              max={1}
              step={0.05}
              value={opacity}
              onChange={(e) => setOpacity(Number(e.target.value))}
              className="w-full accent-primary"
            />
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-sm text-foreground" htmlFor="opt-wm-rotation">
                Rotación
              </label>
              <span className="text-xs text-muted-foreground">{rotation}°</span>
            </div>
            <input
              id="opt-wm-rotation"
              type="range"
              min={-90}
              max={90}
              step={5}
              value={rotation}
              onChange={(e) => setRotation(Number(e.target.value))}
              className="w-full accent-primary"
            />
          </div>
        </div>
      </OptionsCard>

      {file && totalPages > 0 && (
        <section>
          <PageGrid file={file.file} pageCount={totalPages} />
        </section>
      )}

      <ActionBar
        isProcessing={isProcessing}
        canProcess={canProcess}
        label="Aplicar marca de agua"
        onProcess={handleProcess}
        onClear={onClearFiles}
      />
    </div>
  )
}
