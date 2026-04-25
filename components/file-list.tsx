"use client"

import React, { useCallback, useState, type ReactNode } from "react"
import { ChevronDown, ChevronRight, FileText, GripVertical, X, Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"
import { formatFileSize } from "@/lib/pdf"

export interface FileItem {
  id: string
  file: File
  fileName: string
  pages: number | null
  error?: string
}

interface FileListProps {
  files: FileItem[]
  reorderable?: boolean
  renderExpanded?: (file: FileItem) => ReactNode
  onRemove: (id: string) => void
  onReorder?: (files: FileItem[]) => void
}

export function FileList({
  files,
  reorderable = true,
  renderExpanded,
  onRemove,
  onReorder,
}: FileListProps) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  const toggleExpanded = useCallback((id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const handleDragStart = useCallback((e: React.DragEvent, index: number) => {
    e.dataTransfer.setData("text/plain", index.toString())
    e.dataTransfer.effectAllowed = "move"
  }, [])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = "move"
  }, [])

  const handleDrop = useCallback(
    (e: React.DragEvent, dropIndex: number) => {
      e.preventDefault()
      if (!onReorder) return
      const dragIndex = parseInt(e.dataTransfer.getData("text/plain"), 10)
      if (Number.isNaN(dragIndex) || dragIndex === dropIndex) return
      const next = [...files]
      const [moved] = next.splice(dragIndex, 1)
      next.splice(dropIndex, 0, moved)
      onReorder(next)
    },
    [files, onReorder],
  )

  if (files.length === 0) return null

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-foreground">
          Archivos ({files.length})
        </h3>
        {reorderable && files.length > 1 && (
          <p className="text-xs text-muted-foreground">Arrastra para reordenar</p>
        )}
      </div>
      <div className="space-y-2">
        {files.map((item, index) => {
          const isExpanded = expanded.has(item.id)
          const canExpand =
            !!renderExpanded && (item.pages ?? 0) > 0 && !item.error
          return (
            <div key={item.id} className="space-y-2">
              <div
                draggable={reorderable}
                onDragStart={(e) => handleDragStart(e, index)}
                onDragOver={handleDragOver}
                onDrop={(e) => handleDrop(e, index)}
                className={cn(
                  "flex items-center gap-3 p-3 rounded-lg border bg-card transition-all duration-200",
                  reorderable &&
                    "hover:border-border/80 hover:shadow-sm cursor-grab active:cursor-grabbing",
                  item.error && "border-destructive/40",
                )}
              >
                {reorderable && (
                  <GripVertical className="h-4 w-4 text-muted-foreground/50 flex-shrink-0" />
                )}
                {canExpand && (
                  <button
                    type="button"
                    onClick={() => toggleExpanded(item.id)}
                    aria-label={isExpanded ? "Contraer" : "Expandir"}
                    aria-expanded={isExpanded}
                    className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-muted/60 flex-shrink-0"
                  >
                    {isExpanded ? (
                      <ChevronDown className="h-4 w-4" />
                    ) : (
                      <ChevronRight className="h-4 w-4" />
                    )}
                  </button>
                )}
                <div className="flex items-center justify-center w-10 h-10 rounded-md bg-primary/10 flex-shrink-0">
                  <FileText className="h-5 w-5 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">
                    {item.fileName}
                  </p>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span>{formatFileSize(item.file.size)}</span>
                    <span>•</span>
                    {item.pages === null ? (
                      <span className="flex items-center gap-1">
                        <Loader2 className="h-3 w-3 animate-spin" />
                        leyendo…
                      </span>
                    ) : (
                      <span>
                        {item.pages} {item.pages === 1 ? "página" : "páginas"}
                      </span>
                    )}
                    {item.error && (
                      <>
                        <span>•</span>
                        <span className="text-destructive">{item.error}</span>
                      </>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => onRemove(item.id)}
                  aria-label={`Quitar ${item.fileName}`}
                  className="flex items-center justify-center w-8 h-8 rounded-md hover:bg-destructive/10 transition-colors"
                >
                  <X className="h-4 w-4 text-muted-foreground hover:text-destructive" />
                </button>
              </div>
              {canExpand && isExpanded && (
                <div className="rounded-lg border bg-muted/30 p-3">
                  {renderExpanded(item)}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
