"use client"

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react"
import { Eraser } from "lucide-react"

export interface SignaturePadHandle {
  isEmpty: () => boolean
  clear: () => void
  toDataURL: () => string
}

interface SignaturePadProps {
  width?: number
  height?: number
  strokeColor?: string
  strokeWidth?: number
  className?: string
  onChange?: (isEmpty: boolean) => void
}

export const SignaturePad = forwardRef<SignaturePadHandle, SignaturePadProps>(
  (
    {
      width = 640,
      height = 200,
      strokeColor = "#0f172a",
      strokeWidth = 2.5,
      className,
      onChange,
    },
    ref,
  ) => {
    const canvasRef = useRef<HTMLCanvasElement>(null)
    const drawing = useRef(false)
    const lastPoint = useRef<{ x: number; y: number } | null>(null)
    const [empty, setEmpty] = useState(true)

    const ctx = useCallback(() => {
      const canvas = canvasRef.current
      if (!canvas) return null
      return canvas.getContext("2d")
    }, [])

    const reset = useCallback(() => {
      const c = canvasRef.current
      if (!c) return
      const context = c.getContext("2d")
      if (!context) return
      context.clearRect(0, 0, c.width, c.height)
      setEmpty(true)
      onChange?.(true)
    }, [onChange])

    useEffect(() => {
      reset()
    }, [reset])

    useImperativeHandle(
      ref,
      () => ({
        isEmpty: () => empty,
        clear: reset,
        toDataURL: () => {
          const c = canvasRef.current
          if (!c) return ""
          return c.toDataURL("image/png")
        },
      }),
      [empty, reset],
    )

    const getPoint = (e: React.PointerEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current
      if (!canvas) return { x: 0, y: 0 }
      const rect = canvas.getBoundingClientRect()
      const scaleX = canvas.width / rect.width
      const scaleY = canvas.height / rect.height
      return {
        x: (e.clientX - rect.left) * scaleX,
        y: (e.clientY - rect.top) * scaleY,
      }
    }

    const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
      e.preventDefault()
      const canvas = canvasRef.current
      if (!canvas) return
      canvas.setPointerCapture(e.pointerId)
      drawing.current = true
      const p = getPoint(e)
      lastPoint.current = p
      const c = ctx()
      if (!c) return
      c.beginPath()
      c.fillStyle = strokeColor
      c.arc(p.x, p.y, strokeWidth / 2, 0, Math.PI * 2)
      c.fill()
      if (empty) {
        setEmpty(false)
        onChange?.(false)
      }
    }

    const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (!drawing.current) return
      const c = ctx()
      const last = lastPoint.current
      if (!c || !last) return
      const p = getPoint(e)
      c.strokeStyle = strokeColor
      c.lineWidth = strokeWidth
      c.lineCap = "round"
      c.lineJoin = "round"
      c.beginPath()
      c.moveTo(last.x, last.y)
      c.lineTo(p.x, p.y)
      c.stroke()
      lastPoint.current = p
    }

    const onPointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
      drawing.current = false
      lastPoint.current = null
      canvasRef.current?.releasePointerCapture(e.pointerId)
    }

    return (
      <div className={className}>
        <div className="relative rounded-md border bg-white">
          <canvas
            ref={canvasRef}
            width={width}
            height={height}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerLeave={onPointerUp}
            className="block w-full touch-none rounded-md"
            style={{ aspectRatio: `${width} / ${height}` }}
          />
          <button
            type="button"
            onClick={reset}
            className="absolute top-2 right-2 inline-flex items-center gap-1 rounded-md bg-background/90 px-2 py-1 text-xs text-foreground shadow hover:bg-background"
          >
            <Eraser className="h-3.5 w-3.5" />
            Limpiar
          </button>
        </div>
      </div>
    )
  },
)
SignaturePad.displayName = "SignaturePad"
