"use client"

import { useEffect, useRef, useState } from "react"
import { Copy, Loader2, PenTool, RotateCw, X, FileWarning } from "lucide-react"
import { cn } from "@/lib/utils"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { renderThumbnail } from "@/lib/pdf"

export interface PageThumbnailProps {
  file: File
  pageNumber: number
  rotation?: number
  width?: number
  selected?: boolean
  removed?: boolean
  onClick?: (e: React.MouseEvent) => void
  onRotate?: () => void
  onRemove?: () => void
  onDuplicate?: () => void
  onSign?: () => void
  signed?: boolean
  className?: string
  lazy?: boolean
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
  onDuplicate,
  onSign,
  signed,
  className,
  lazy = true,
}: PageThumbnailProps) {
  const [src, setSrc] = useState<string | null>(null)
  const [error, setError] = useState(false)
  const [inView, setInView] = useState(!lazy)
  const containerRef = useRef<HTMLDivElement>(null)
  const mounted = useRef(true)

  useEffect(() => {
    if (!lazy || inView) return
    const el = containerRef.current
    if (!el) return
    if (typeof IntersectionObserver === "undefined") {
      setInView(true)
      return
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setInView(true)
          observer.disconnect()
        }
      },
      { rootMargin: "200px 0px" },
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [lazy, inView])

  useEffect(() => {
    mounted.current = true
    if (!inView) return
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
  }, [file, pageNumber, width, rotation, inView])

  return (
    <div
      ref={containerRef}
      onClick={onClick}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={(e) => {
        if (!onClick) return
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault()
          onClick(e as unknown as React.MouseEvent)
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
        ) : inView ? (
          <div className="flex h-full w-full items-center justify-center text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : (
          <div className="h-full w-full" aria-hidden="true" />
        )}
        {(onRotate || onRemove || onDuplicate || onSign) && (
          <div className="absolute top-1 right-1 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
            {onRotate && (
              <Tooltip>
                <TooltipTrigger asChild>
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
                </TooltipTrigger>
                <TooltipContent>
                  <p>Rotar página</p>
                </TooltipContent>
              </Tooltip>
            )}
            {onSign && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      onSign()
                    }}
                    aria-label={`Firmar página ${pageNumber}`}
                    className="flex h-6 w-6 items-center justify-center rounded-md bg-background/90 text-foreground shadow hover:bg-background"
                  >
                    <PenTool className="h-3.5 w-3.5" />
                  </button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Firmar página</p>
                </TooltipContent>
              </Tooltip>
            )}
            {onDuplicate && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      onDuplicate()
                    }}
                    aria-label={`Duplicar página ${pageNumber}`}
                    className="flex h-6 w-6 items-center justify-center rounded-md bg-background/90 text-foreground shadow hover:bg-background"
                  >
                    <Copy className="h-3.5 w-3.5" />
                  </button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Duplicar página</p>
                </TooltipContent>
              </Tooltip>
            )}
            {onRemove && (
              <Tooltip>
                <TooltipTrigger asChild>
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
                </TooltipTrigger>
                <TooltipContent>
                  <p>Eliminar página</p>
                </TooltipContent>
              </Tooltip>
            )}
          </div>
        )}
        {signed && (
          <div
            className="absolute bottom-1 left-1 flex h-5 items-center gap-1 rounded-full bg-primary px-1.5 text-[10px] font-medium text-primary-foreground shadow"
            title="Esta página tiene firma"
          >
            <PenTool className="h-3 w-3" />
            <span>Firmada</span>
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
