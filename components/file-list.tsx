"use client"

import React from "react"

import { useCallback } from "react"
import { FileText, GripVertical, X } from "lucide-react"
import { cn } from "@/lib/utils"

export interface FileItem {
  id: string
  file?: File
  fileId?: string
  pages: number
  fileName: string
}

interface FileListProps {
  files: FileItem[]
  onRemove: (id: string) => void
  onReorder: (files: FileItem[]) => void
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function FileList({ files, onRemove, onReorder }: FileListProps) {
  const handleDragStart = useCallback(
    (e: React.DragEvent, index: number) => {
      e.dataTransfer.setData("text/plain", index.toString())
      e.dataTransfer.effectAllowed = "move"
    },
    []
  )

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = "move"
  }, [])

  const handleDrop = useCallback(
    (e: React.DragEvent, dropIndex: number) => {
      e.preventDefault()
      const dragIndex = parseInt(e.dataTransfer.getData("text/plain"), 10)
      if (dragIndex === dropIndex) return

      const newFiles = [...files]
      const [draggedItem] = newFiles.splice(dragIndex, 1)
      newFiles.splice(dropIndex, 0, draggedItem)
      onReorder(newFiles)
    },
    [files, onReorder]
  )

  if (files.length === 0) return null

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-foreground">
          Archivos seleccionados ({files.length})
        </h3>
        <p className="text-xs text-muted-foreground">
          Arrastra para reordenar
        </p>
      </div>
      <div className="space-y-2">
        {files.map((item, index) => (
          <div
            key={item.id}
            draggable
            onDragStart={(e) => handleDragStart(e, index)}
            onDragOver={handleDragOver}
            onDrop={(e) => handleDrop(e, index)}
            className={cn(
              "flex items-center gap-3 p-3 rounded-lg border bg-card transition-all duration-200",
              "hover:border-border/80 hover:shadow-sm cursor-grab active:cursor-grabbing"
            )}
          >
            <GripVertical className="h-4 w-4 text-muted-foreground/50 flex-shrink-0" />
            <div className="flex items-center justify-center w-10 h-10 rounded-md bg-primary/10 flex-shrink-0">
              <FileText className="h-5 w-5 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-foreground truncate">
                {item.fileName}
              </p>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                {item.file && <span>{formatFileSize(item.file.size)}</span>}
                {item.file && <span>•</span>}
                <span>{item.pages} {item.pages === 1 ? "página" : "páginas"}</span>
              </div>
            </div>
            <button
              onClick={() => onRemove(item.id)}
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
