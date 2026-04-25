"use client"

import React, { useCallback } from "react"
import { FileText, GripVertical, X, Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"
import { formatFileSize } from "@/lib/pdf-engine"

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
  onRemove: (id: string) => void
  onReorder?: (files: FileItem[]) => void
}

export function FileList({ files, reorderable = true, onRemove, onReorder }: FileListProps) {
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
        {files.map((item, index) => (
          <div
            key={item.id}
            draggable={reorderable}
            onDragStart={(e) => handleDragStart(e, index)}
            onDragOver={handleDragOver}
            onDrop={(e) => handleDrop(e, index)}
            className={cn(
              "flex items-center gap-3 p-3 rounded-lg border bg-card transition-all duration-200",
              reorderable && "hover:border-border/80 hover:shadow-sm cursor-grab active:cursor-grabbing",
              item.error && "border-destructive/40",
            )}
          >
            {reorderable && (
              <GripVertical className="h-4 w-4 text-muted-foreground/50 flex-shrink-0" />
            )}
            <div className="flex items-center justify-center w-10 h-10 rounded-md bg-primary/10 flex-shrink-0">
              <FileText className="h-5 w-5 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-foreground truncate">{item.fileName}</p>
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
        ))}
      </div>
    </div>
  )
}
