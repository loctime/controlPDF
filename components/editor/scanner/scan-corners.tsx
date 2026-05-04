"use client"

import { useRef, useState, useCallback, useEffect } from "react"
import { Button } from "@/components/ui/button"
import {
  applyPerspectiveTransform,
  enhanceDocument,
  type Point,
  type ScanMode,
} from "@/lib/pdf/scanner"

const MODE_LABELS: Record<ScanMode, string> = {
  document: "Documento",
  color: "Color",
  bw: "B&N",
  photo: "Foto",
}

interface ScanCornersProps {
  imageDataUrl: string
  initialCorners: Point[]
  imageSize: { w: number; h: number }
  mode: ScanMode
  onModeChange: (m: ScanMode) => void
  onApply: (enhanced: HTMLCanvasElement) => void
  onBack: () => void
}

export function ScanCorners({
  imageDataUrl,
  initialCorners,
  imageSize,
  mode,
  onModeChange,
  onApply,
  onBack,
}: ScanCornersProps) {
  const [corners, setCorners] = useState<Point[]>(initialCorners)
  const [processing, setProcessing] = useState(false)
  const containerRef = useRef<SVGSVGElement>(null)
  const dragRef = useRef<{ idx: number } | null>(null)

  // Sincronizar si cambian las initialCorners desde fuera
  useEffect(() => {
    setCorners(initialCorners)
  }, [initialCorners])

  const svgCoordsFromPointer = useCallback(
    (e: React.PointerEvent) => {
      const svg = containerRef.current
      if (!svg) return null
      const rect = svg.getBoundingClientRect()
      const x = ((e.clientX - rect.left) / rect.width) * imageSize.w
      const y = ((e.clientY - rect.top) / rect.height) * imageSize.h
      return {
        x: Math.min(Math.max(x, 0), imageSize.w),
        y: Math.min(Math.max(y, 0), imageSize.h),
      }
    },
    [imageSize],
  )

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<SVGCircleElement>, idx: number) => {
      e.preventDefault()
      ;(e.currentTarget as SVGCircleElement).setPointerCapture(e.pointerId)
      dragRef.current = { idx }
    },
    [],
  )

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<SVGCircleElement>) => {
      if (!dragRef.current) return
      const pos = svgCoordsFromPointer(e)
      if (!pos) return
      const { idx } = dragRef.current
      setCorners((prev) => prev.map((c, i) => (i === idx ? pos : c)))
    },
    [svgCoordsFromPointer],
  )

  const handlePointerUp = useCallback(() => {
    dragRef.current = null
  }, [])

  const handleApply = useCallback(async () => {
    setProcessing(true)
    try {
      await new Promise<void>((resolve) => {
        const img = new Image()
        img.onload = async () => {
          const srcCanvas = document.createElement("canvas")
          srcCanvas.width = img.naturalWidth
          srcCanvas.height = img.naturalHeight
          srcCanvas.getContext("2d")!.drawImage(img, 0, 0)
          const rectified = applyPerspectiveTransform(srcCanvas, corners)
          const enhanced = enhanceDocument(rectified, mode)
          onApply(enhanced)
          resolve()
        }
        img.onerror = () => resolve()
        img.src = imageDataUrl
      })
    } finally {
      setProcessing(false)
    }
  }, [corners, imageDataUrl, mode, onApply])

  const polygonPoints = corners.map((p) => `${p.x},${p.y}`).join(" ")

  return (
    <div className="space-y-4">
      {/* Imagen con overlay SVG de corners */}
      <div className="relative rounded-lg overflow-hidden border border-border bg-black select-none">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={imageDataUrl}
          alt="Captura"
          className="w-full pointer-events-none"
          draggable={false}
        />
        <svg
          ref={containerRef}
          className="absolute inset-0 w-full h-full"
          viewBox={`0 0 ${imageSize.w} ${imageSize.h}`}
          preserveAspectRatio="none"
          style={{ touchAction: "none" }}
        >
          {/* Área oscura fuera del cuadrilátero */}
          <defs>
            <mask id="scan-mask">
              <rect width={imageSize.w} height={imageSize.h} fill="white" />
              <polygon points={polygonPoints} fill="black" />
            </mask>
          </defs>
          <rect
            width={imageSize.w}
            height={imageSize.h}
            fill="black"
            fillOpacity="0.45"
            mask="url(#scan-mask)"
          />

          {/* Polígono del recorte */}
          <polygon
            points={polygonPoints}
            fill="rgba(59,130,246,0.12)"
            stroke="#3b82f6"
            strokeWidth="3"
            strokeLinejoin="round"
          />

          {/* Handles arrastrables */}
          {corners.map((c, i) => (
            <g key={i}>
              <circle
                cx={c.x}
                cy={c.y}
                r={16}
                fill="transparent"
                style={{ cursor: "grab", touchAction: "none" }}
                onPointerDown={(e) => handlePointerDown(e, i)}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
              />
              <circle
                cx={c.x}
                cy={c.y}
                r={8}
                fill="white"
                stroke="#3b82f6"
                strokeWidth="2.5"
                style={{ pointerEvents: "none" }}
              />
            </g>
          ))}
        </svg>
      </div>

      {/* Selector de modo */}
      <div className="flex gap-2 flex-wrap">
        {(Object.keys(MODE_LABELS) as ScanMode[]).map((m) => (
          <Button
            key={m}
            variant={mode === m ? "default" : "outline"}
            size="sm"
            onClick={() => onModeChange(m)}
            className="flex-1 min-w-[80px]"
          >
            {MODE_LABELS[m]}
          </Button>
        ))}
      </div>

      {/* Acciones */}
      <div className="flex gap-2">
        <Button variant="outline" onClick={onBack} className="flex-1" disabled={processing}>
          Volver a cámara
        </Button>
        <Button onClick={handleApply} disabled={processing} className="flex-1">
          {processing ? "Procesando…" : "Agregar página"}
        </Button>
      </div>
    </div>
  )
}
