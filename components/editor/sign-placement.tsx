"use client"

import { useEffect, useRef, useState } from "react"
import { Loader2, Minus, Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { renderPageToCanvas } from "@/lib/pdf"
import type { PageSignature } from "@/lib/editor/types"
import { cn } from "@/lib/utils"

interface SignPlacementProps {
  file: File
  pageNumber: number
  rotation: number
  signatureDataUrl: string
  initialPlacement?: PageSignature
  onChange: (placement: PageSignature) => void
}

export function SignPlacement({
  file,
  pageNumber,
  rotation,
  signatureDataUrl,
  initialPlacement,
  onChange,
}: SignPlacementProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [aspect, setAspect] = useState<number | null>(null)
  const [renderSize, setRenderSize] = useState<{ w: number; h: number } | null>(
    null,
  )

  const [placement, setPlacement] = useState<PageSignature>(() => ({
    dataUrl: signatureDataUrl,
    xRatio: initialPlacement?.xRatio ?? 0.5,
    yRatio: initialPlacement?.yRatio ?? 0.7,
    widthRatio: initialPlacement?.widthRatio ?? 0.3,
  }))

  // Render the page preview.
  useEffect(() => {
    let cancelled = false
    setRenderSize(null)
    ;(async () => {
      const canvas = await renderPageToCanvas(file, pageNumber, {
        width: 800,
        rotation,
      })
      if (cancelled) return
      const target = canvasRef.current
      if (!target) return
      target.width = canvas.width
      target.height = canvas.height
      const ctx = target.getContext("2d")
      if (!ctx) return
      ctx.drawImage(canvas, 0, 0)
      setRenderSize({ w: canvas.width, h: canvas.height })
    })()
    return () => {
      cancelled = true
    }
  }, [file, pageNumber, rotation])

  // Read signature aspect.
  useEffect(() => {
    const img = new Image()
    img.onload = () => {
      if (img.naturalWidth > 0) setAspect(img.naturalHeight / img.naturalWidth)
    }
    img.src = signatureDataUrl
  }, [signatureDataUrl])

  // Propagate up.
  useEffect(() => {
    onChange(placement)
  }, [placement, onChange])

  const dragRef = useRef<{
    startX: number
    startY: number
    startXRatio: number
    startYRatio: number
  } | null>(null)

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!renderSize) return
    e.currentTarget.setPointerCapture(e.pointerId)
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      startXRatio: placement.xRatio,
      startYRatio: placement.yRatio,
    }
  }

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current || !renderSize || !containerRef.current) return
    const rect = containerRef.current.getBoundingClientRect()
    const dxRatio = (e.clientX - dragRef.current.startX) / rect.width
    const dyRatio = (e.clientY - dragRef.current.startY) / rect.height
    setPlacement((p) => ({
      ...p,
      xRatio: clamp01(dragRef.current!.startXRatio + dxRatio),
      yRatio: clamp01(dragRef.current!.startYRatio + dyRatio),
    }))
  }

  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    e.currentTarget.releasePointerCapture(e.pointerId)
    dragRef.current = null
  }

  const adjustWidth = (delta: number) => {
    setPlacement((p) => ({
      ...p,
      widthRatio: Math.max(0.05, Math.min(0.9, p.widthRatio + delta)),
    }))
  }

  const sigDisplayWidthPx = renderSize ? renderSize.w * placement.widthRatio : 0
  const sigDisplayHeightPx =
    aspect !== null && renderSize ? sigDisplayWidthPx * aspect : 0
  const xRatioForLeft = renderSize
    ? Math.min(
        Math.max(placement.xRatio, 0),
        renderSize.w > 0 ? 1 - placement.widthRatio : 1,
      )
    : placement.xRatio
  const yRatioForTop =
    renderSize && aspect !== null
      ? Math.min(
          Math.max(placement.yRatio, 0),
          renderSize.h > 0
            ? 1 - sigDisplayHeightPx / renderSize.h
            : 1,
        )
      : placement.yRatio

  return (
    <div className="space-y-3">
      <div
        ref={containerRef}
        className="relative w-full max-h-[60vh] overflow-auto rounded-md border bg-muted/30 flex items-start justify-center"
      >
        <div className="relative">
          <canvas
            ref={canvasRef}
            className="block max-w-full"
            style={{ aspectRatio: "210 / 297" }}
          />
          {!renderSize && (
            <div className="absolute inset-0 flex items-center justify-center text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          )}
          {renderSize && (
            <div
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
              className={cn(
                "absolute cursor-grab active:cursor-grabbing border-2 border-dashed border-primary/60 bg-primary/5 hover:bg-primary/10 transition-colors touch-none",
              )}
              style={{
                left: `${xRatioForLeft * 100}%`,
                top: `${yRatioForTop * 100}%`,
                width: `${placement.widthRatio * 100}%`,
                aspectRatio: aspect !== null ? `${1} / ${aspect}` : "3 / 1",
              }}
            >
              <img
                src={signatureDataUrl}
                alt="Firma"
                className="h-full w-full object-contain pointer-events-none"
                draggable={false}
              />
            </div>
          )}
        </div>
      </div>
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>Arrastrá la firma sobre la página.</span>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => adjustWidth(-0.05)}
            aria-label="Achicar"
          >
            <Minus className="h-3.5 w-3.5" />
          </Button>
          <span className="tabular-nums w-10 text-center">
            {Math.round(placement.widthRatio * 100)}%
          </span>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => adjustWidth(0.05)}
            aria-label="Agrandar"
          >
            <Plus className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    </div>
  )
}

function clamp01(v: number) {
  return Math.max(0, Math.min(1, v))
}
