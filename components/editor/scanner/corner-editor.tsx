"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import type { Corners, Point } from "@/lib/scanner/types"

const HANDLE_RADIUS = 14
const LOUPE_SIZE = 96
const LOUPE_ZOOM = 2.5
/** Paso de ajuste por teclado, en px de la imagen original. */
const KEY_STEP = 5
const KEY_STEP_LARGE = 25

const CORNER_LABELS = [
  "Esquina superior izquierda",
  "Esquina superior derecha",
  "Esquina inferior derecha",
  "Esquina inferior izquierda",
]

interface CornerEditorProps {
  /** URL de la foto original (objectURL). */
  imageUrl: string
  corners: Corners
  onChange: (corners: Corners) => void
}

/**
 * Muestra la foto con cuatro manijas arrastrables. Las coordenadas de las
 * esquinas siempre están en el espacio de la imagen original; la conversión
 * a pantalla se hace al dibujar.
 */
export function CornerEditor({ imageUrl, corners, onChange }: CornerEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const imgRef = useRef<HTMLImageElement>(null)
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null)
  const [box, setBox] = useState<{ w: number; h: number }>({ w: 0, h: 0 })
  const [dragging, setDragging] = useState<number | null>(null)

  // Medir el tamaño renderizado de la imagen para mapear coordenadas.
  useEffect(() => {
    const el = imgRef.current
    if (!el) return
    const measure = () => setBox({ w: el.clientWidth, h: el.clientHeight })
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
  }, [natural])

  // Si la imagen ya está en caché del navegador, `onLoad` puede no disparar
  // nunca (el evento ya ocurrió antes de que este componente montara). Sin
  // esto la foto queda sin esquinas dibujadas hasta que el usuario interactúe.
  useEffect(() => {
    const el = imgRef.current
    if (el && el.complete && el.naturalWidth > 0) {
      setNatural({ w: el.naturalWidth, h: el.naturalHeight })
    }
  }, [imageUrl])

  const toScreen = useCallback(
    (p: Point): Point => {
      if (!natural || box.w === 0) return { x: 0, y: 0 }
      return { x: (p.x / natural.w) * box.w, y: (p.y / natural.h) * box.h }
    },
    [natural, box],
  )

  const toImage = useCallback(
    (clientX: number, clientY: number): Point => {
      const el = imgRef.current
      if (!el || !natural) return { x: 0, y: 0 }
      const rect = el.getBoundingClientRect()
      const sx = Math.min(Math.max(clientX - rect.left, 0), rect.width)
      const sy = Math.min(Math.max(clientY - rect.top, 0), rect.height)
      return {
        x: Math.round((sx / rect.width) * natural.w),
        y: Math.round((sy / rect.height) * natural.h),
      }
    },
    [natural],
  )

  const handlePointerDown = (index: number) => (event: React.PointerEvent) => {
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    setDragging(index)
  }

  const handlePointerMove = (index: number) => (event: React.PointerEvent) => {
    if (dragging !== index) return
    const next = [...corners] as Corners
    next[index] = toImage(event.clientX, event.clientY)
    onChange(next)
  }

  const handlePointerUp = (event: React.PointerEvent) => {
    // En algunos navegadores móviles el pointercancel ya liberó la captura
    // antes de que este handler corra; liberar de nuevo tira una excepción.
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    setDragging(null)
  }

  // Ajuste fino por teclado: las flechas mueven la esquina enfocada en el
  // espacio de la imagen original. Sin esto el rol "slider" quedaría vacío
  // de contenido para quien navega sin mouse.
  const handleKeyDown = (index: number) => (event: React.KeyboardEvent) => {
    if (!natural) return
    const step = event.shiftKey ? KEY_STEP_LARGE : KEY_STEP
    let dx = 0
    let dy = 0
    switch (event.key) {
      case "ArrowLeft":
        dx = -step
        break
      case "ArrowRight":
        dx = step
        break
      case "ArrowUp":
        dy = -step
        break
      case "ArrowDown":
        dy = step
        break
      default:
        return
    }
    event.preventDefault()
    const current = corners[index]
    const next = [...corners] as Corners
    next[index] = {
      x: Math.min(Math.max(current.x + dx, 0), natural.w),
      y: Math.min(Math.max(current.y + dy, 0), natural.h),
    }
    onChange(next)
  }

  const screenCorners = corners.map(toScreen)
  const polygon = screenCorners.map((p) => `${p.x},${p.y}`).join(" ")

  return (
    <div ref={containerRef} className="relative w-full select-none touch-none">
      <img
        ref={imgRef}
        src={imageUrl}
        alt="Documento capturado"
        className="w-full h-auto rounded-lg"
        onLoad={(e) => {
          const el = e.currentTarget
          setNatural({ w: el.naturalWidth, h: el.naturalHeight })
        }}
      />

      {natural && box.w > 0 && (
        <>
          <svg
            className="absolute inset-0 pointer-events-none"
            width={box.w}
            height={box.h}
          >
            <polygon
              points={polygon}
              fill="rgba(56,189,248,0.15)"
              stroke="rgb(56,189,248)"
              strokeWidth={2}
            />
          </svg>

          {screenCorners.map((p, i) => (
            <div
              key={i}
              role="button"
              tabIndex={0}
              aria-label={CORNER_LABELS[i]}
              onPointerDown={handlePointerDown(i)}
              onPointerMove={handlePointerMove(i)}
              onPointerUp={handlePointerUp}
              onPointerCancel={handlePointerUp}
              onKeyDown={handleKeyDown(i)}
              className="absolute rounded-full border-2 border-sky-400 bg-sky-400/30 backdrop-blur-sm cursor-grab active:cursor-grabbing focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-400"
              style={{
                width: HANDLE_RADIUS * 2,
                height: HANDLE_RADIUS * 2,
                left: p.x - HANDLE_RADIUS,
                top: p.y - HANDLE_RADIUS,
                touchAction: "none",
              }}
            />
          ))}

          {/* Lupa: se posiciona en la esquina opuesta para no taparse con el dedo. */}
          {dragging !== null && (
            <div
              className="absolute rounded-full border-2 border-sky-400 overflow-hidden shadow-lg pointer-events-none"
              style={{
                width: LOUPE_SIZE,
                height: LOUPE_SIZE,
                left: screenCorners[dragging].x > box.w / 2 ? 8 : box.w - LOUPE_SIZE - 8,
                top: screenCorners[dragging].y > box.h / 2 ? 8 : box.h - LOUPE_SIZE - 8,
                backgroundImage: `url(${imageUrl})`,
                backgroundRepeat: "no-repeat",
                backgroundSize: `${box.w * LOUPE_ZOOM}px ${box.h * LOUPE_ZOOM}px`,
                backgroundPosition: `${LOUPE_SIZE / 2 - screenCorners[dragging].x * LOUPE_ZOOM}px ${LOUPE_SIZE / 2 - screenCorners[dragging].y * LOUPE_ZOOM}px`,
              }}
            >
              <div className="absolute left-1/2 top-1/2 w-4 h-px -translate-x-1/2 bg-sky-400" />
              <div className="absolute left-1/2 top-1/2 h-4 w-px -translate-y-1/2 bg-sky-400" />
            </div>
          )}
        </>
      )}
    </div>
  )
}
