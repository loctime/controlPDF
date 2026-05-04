"use client"

import { useState, type RefObject } from "react"
import { Camera } from "lucide-react"
import { DropZone } from "@/components/drop-zone"

interface EmptyStateProps {
  onFilesAdded: (files: File[]) => void
  inputRef?: RefObject<HTMLInputElement | null>
  maxSizeMb: number
  onScan: () => void
}

export function EmptyState({ onFilesAdded, inputRef, maxSizeMb, onScan }: EmptyStateProps) {
  const [isDragging, setIsDragging] = useState(false)
  return (
    <div className="space-y-4">
      <DropZone
        onFilesAdded={onFilesAdded}
        isDragging={isDragging}
        setIsDragging={setIsDragging}
        multiple
        inputRef={inputRef}
        hint={`o haz clic para seleccionar · máx. ${maxSizeMb} MB por archivo`}
      />
      <div className="flex items-center gap-3">
        <div className="flex-1 h-px bg-border" />
        <span className="text-xs text-muted-foreground">o</span>
        <div className="flex-1 h-px bg-border" />
      </div>
      <button
        onClick={onScan}
        className="w-full flex items-center gap-4 p-5 rounded-xl border-2 border-dashed border-border hover:border-primary/40 hover:bg-primary/5 transition-all duration-200 cursor-pointer text-left"
      >
        <div className="flex items-center justify-center w-10 h-10 rounded-full bg-muted shrink-0">
          <Camera className="h-5 w-5 text-muted-foreground" />
        </div>
        <div>
          <p className="text-sm font-medium">Escanear documento</p>
          <p className="text-xs text-muted-foreground">
            Usá la cámara para capturar y digitalizar — sin subir nada a ningún servidor
          </p>
        </div>
      </button>
    </div>
  )
}
