"use client"

import { useEffect, useRef, useState } from "react"
import { Loader2, RotateCw, X, FileWarning } from "lucide-react"
import { cn } from "@/lib/utils"
import { renderThumbnail } from "@/lib/pdf"

export interface PageThumbnailProps {
  file: File
  pageNumber: number
  rotation?: number
  width?: number
  selected?: boolean
  removed?: boolean
  onClick?: () => void
  onRotate?: () => void
  onRemove?: () => void
  className?: string
}

export function PageThumbnail({
  file,
  pageNumber,
  rotation = 0,
  width = 160,
  selected,
  removed,
  onClick,
  onRotate,
  onRemove,
  className,
}: PageThumbnailProps) {
  const [src, setSrc] = useState<string | null>(null)
  const [error, setError] = useState(false)
  const mounted = useRef(true)

  useEffect(() => {
    mounted.current = true
    setSrc(null)
    setError(false)
    renderThumbnail(file, pageNumber, { width, rotation })
      .then((url) => {
        if (mounted.current) setSrc(url)
      })
      .catch(() => {
        if (mounted.current) setError(true)
      })
    return () => {
      mounted.current = false
    }
  }, [file, pageNumber, width, rotation])

  return (
    <div
      onClick={onClick}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={(e) => {
        if (!onClick) return
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault()
          onClick()
        }
      }}
      className={cn(
        "group relative rounded-lg border bg-card transition-all duration-150",
        onClick && "cursor-pointer hover:border-primary/60 hover:shadow-sm",
        selected && "border-primary ring-2 ring-primary/40",
        removed && "opacity-40",
        className,
      )}
      style={{ width }}
    >
      <div
        className="relative w-full overflow-hidden rounded-t-lg bg-muted"
        style={{ aspectRatio: "210 / 297" }}
      >
        {src ? (
          <img
            src={src}
            alt={`Página ${pageNumber}`}
            className="h-full w-full object-contain bg-white"
            draggable={false}
          />
        ) : error ? (
          <div className="flex h-full w-full flex-col items-center justify-center gap-1 text-destructive">
            <FileWarning className="h-5 w-5" />
            <span className="text-[10px]">Error</span>
          </div>
        ) : (
          <div className="flex h-full w-full items-center justify-center text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        )}
        {(onRotate || onRemove) && (
          <div className="absolute top-1 right-1 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
            {onRotate && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  onRotate()
                }}
                aria-label={`Rotar página ${pageNumber}`}
                className="flex h-6 w-6 items-center justify-center rounded-md bg-background/90 text-foreground shadow hover:bg-background"
              >
                <RotateCw className="h-3.5 w-3.5" />
              </button>
            )}
            {onRemove && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  onRemove()
                }}
                aria-label={`Quitar página ${pageNumber}`}
                className="flex h-6 w-6 items-center justify-center rounded-md bg-background/90 text-foreground shadow hover:bg-destructive hover:text-destructive-foreground"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        )}
      </div>
      <div className="flex items-center justify-center px-2 py-1 text-xs text-muted-foreground">
        {pageNumber}
        {rotation !== 0 && (
          <span className="ml-1 text-[10px] text-primary">· {rotation}°</span>
        )}
      </div>
    </div>
  )
}
