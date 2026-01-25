"use client"

import React from "react"

import { useCallback } from "react"
import { Upload } from "lucide-react"
import { cn } from "@/lib/utils"

interface DropZoneProps {
  onFilesAdded: (files: File[]) => void
  isDragging: boolean
  setIsDragging: (dragging: boolean) => void
}

export function DropZone({ onFilesAdded, isDragging, setIsDragging }: DropZoneProps) {
  const handleDragOver = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setIsDragging(true)
    },
    [setIsDragging]
  )

  const handleDragLeave = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setIsDragging(false)
    },
    [setIsDragging]
  )

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setIsDragging(false)
      const files = Array.from(e.dataTransfer.files).filter(
        (file) => file.type === "application/pdf"
      )
      if (files.length > 0) {
        onFilesAdded(files)
      }
    },
    [onFilesAdded, setIsDragging]
  )

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files ? Array.from(e.target.files) : []
      if (files.length > 0) {
        onFilesAdded(files)
      }
      e.target.value = ""
    },
    [onFilesAdded]
  )

  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={cn(
        "relative flex flex-col items-center justify-center gap-4 p-12 rounded-xl border-2 border-dashed transition-all duration-300",
        "bg-card hover:border-primary/50 cursor-pointer",
        isDragging ? "border-primary bg-primary/5 scale-[1.01]" : "border-border"
      )}
    >
      <input
        type="file"
        accept=".pdf"
        multiple
        onChange={handleFileInput}
        className="absolute inset-0 opacity-0 cursor-pointer"
      />
      <div
        className={cn(
          "flex items-center justify-center w-16 h-16 rounded-full transition-colors",
          isDragging ? "bg-primary/10" : "bg-muted"
        )}
      >
        <Upload
          className={cn(
            "h-8 w-8 transition-colors",
            isDragging ? "text-primary" : "text-muted-foreground"
          )}
        />
      </div>
      <div className="text-center">
        <p className="text-lg font-medium text-foreground">
          Arrastra tus archivos PDF aquí
        </p>
        <p className="text-sm text-muted-foreground mt-1">
          o haz clic para seleccionar
        </p>
      </div>
    </div>
  )
}
