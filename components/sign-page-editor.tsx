"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Loader2 } from "lucide-react"
import { renderThumbnail } from "@/lib/pdf"
import { cn } from "@/lib/utils"

export interface SignaturePosition {
  xRatio: number
  yRatio: number
  widthRatio: number
}

interface SignPageEditorProps {
  file: File
  pageNumber: number
  signatureSrc: string
  signatureAspect: number
  position: SignaturePosition
  onPositionChange: (next: SignaturePosition) => void
  className?: string
}

export function SignPageEditor({
  file,
  pageNumber,
  signatureSrc,
  signatureAspect,
  position,
  onPositionChange,
  className,
}: SignPageEditorProps) {
  const [bgSrc, setBgSrc] = useState<string | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const dragStart = useRef<{
    pointerId: number
    startX: number
    startY: number
    originX: number
    originY: number
    rect: DOMRect
  } | null>(null)

  useEffect(() => {
    let active = true
    setBgSrc(null)
    renderThumbnail(file, pageNumber, { width: 720 })
      .then((url) => {
        if (active) setBgSrc(url)
      })
      .catch(() => {})
    return () => {
      active = false
    }
  }, [file, pageNumber])

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const container = containerRef.current
      if (!container) return
      const rect = container.getBoundingClientRect()
      ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
      dragStart.current = {
        pointerId: e.pointerId,
        startX: e.clientX,
        startY: e.clientY,
        originX: position.xRatio,
        originY: position.yRatio,
        rect,
      }
    },
    [position.xRatio, position.yRatio],
  )

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const drag = dragStart.current
      if (!drag) return
      const dx = (e.clientX - drag.startX) / drag.rect.width
      const dy = (e.clientY - drag.startY) / drag.rect.height
      const heightRatio = position.widthRatio * signatureAspect *
        (drag.rect.width / drag.rect.height)
      const xRatio = Math.max(
        0,
        Math.min(1 - position.widthRatio, drag.originX + dx),
      )
      const yRatio = Math.max(0, Math.min(1 - heightRatio, drag.originY + dy))
      onPositionChange({ ...position, xRatio, yRatio })
    },
    [position, signatureAspect, onPositionChange],
  )

  const onPointerUp = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      ;(e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId)
      dragStart.current = null
    },
    [],
  )

  const overlayStyle = useMemo<React.CSSProperties>(() => {
    return {
      left: `${position.xRatio * 100}%`,
      top: `${position.yRatio * 100}%`,
      width: `${position.widthRatio * 100}%`,
      aspectRatio: `${1 / signatureAspect}`,
    }
  }, [position, signatureAspect])

  return (
    <div
      ref={containerRef}
      className={cn(
        "relative w-full overflow-hidden rounded-lg border bg-muted",
        className,
      )}
      style={{ aspectRatio: "210 / 297" }}
    >
      {bgSrc ? (
        <img
          src={bgSrc}
          alt={`Página ${pageNumber}`}
          className="absolute inset-0 h-full w-full object-contain bg-white"
          draggable={false}
        />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      )}
      <div
        role="button"
        tabIndex={0}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        className="absolute cursor-move touch-none rounded outline outline-2 outline-primary/60 outline-offset-1"
        style={overlayStyle}
      >
        <img
          src={signatureSrc}
          alt="Firma"
          className="block h-full w-full select-none object-contain"
          draggable={false}
        />
      </div>
    </div>
  )
}
