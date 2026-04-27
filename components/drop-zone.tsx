"use client"

import React, { useCallback } from "react"
import { Upload } from "lucide-react"
import { cn } from "@/lib/utils"

interface DropZoneProps {
  onFilesAdded: (files: File[]) => void
  isDragging: boolean
  setIsDragging: (dragging: boolean) => void
  multiple?: boolean
  hint?: string
  inputRef?: React.RefObject<HTMLInputElement | null>
}

export function DropZone({
  onFilesAdded,
  isDragging,
  setIsDragging,
  multiple = true,
  hint,
  inputRef,
}: DropZoneProps) {
  const handleDragOver = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setIsDragging(true)
    },
    [setIsDragging],
  )

  const handleDragLeave = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setIsDragging(false)
    },
    [setIsDragging],
  )

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setIsDragging(false)
      const dropped = Array.from(e.dataTransfer.files).filter(
        (f) =>
          f.type === "application/pdf" ||
          f.name.toLowerCase().endsWith(".pdf") ||
          f.type.startsWith("image/"),
      )
      if (dropped.length === 0) return
      onFilesAdded(multiple ? dropped : dropped.slice(0, 1))
    },
    [onFilesAdded, setIsDragging, multiple],
  )

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const picked = e.target.files ? Array.from(e.target.files) : []
      if (picked.length > 0) onFilesAdded(multiple ? picked : picked.slice(0, 1))
      e.target.value = ""
    },
    [onFilesAdded, multiple],
  )

  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={cn(
        "relative flex flex-col items-center justify-center gap-4 p-12 rounded-xl border-2 border-dashed transition-all duration-300",
        "bg-card hover:border-primary/50 cursor-pointer",
        isDragging ? "border-primary bg-primary/5 scale-[1.01]" : "border-border",
      )}
    >
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf,.pdf,image/png,image/jpeg,image/jpg"
        multiple={multiple}
        onChange={handleFileInput}
        className="absolute inset-0 opacity-0 cursor-pointer"
        aria-label="Seleccionar archivos PDF o imágenes"
      />
      <div
        className={cn(
          "flex items-center justify-center w-16 h-16 rounded-full transition-colors",
          isDragging ? "bg-primary/10" : "bg-muted",
        )}
      >
        <Upload
          className={cn(
            "h-8 w-8 transition-colors",
            isDragging ? "text-primary" : "text-muted-foreground",
          )}
        />
      </div>
      <div className="text-center">
        <p className="text-lg font-medium text-foreground">
          {multiple ? "Arrastra tus archivos aquí" : "Arrastra un archivo aquí"}
        </p>
        <p className="text-sm text-muted-foreground mt-1">
          {hint ?? "o haz clic para seleccionar"}
        </p>
      </div>
    </div>
  )
}
