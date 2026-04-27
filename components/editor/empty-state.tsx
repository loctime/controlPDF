"use client"

import { useState, type RefObject } from "react"
import { DropZone } from "@/components/drop-zone"

interface EmptyStateProps {
  onFilesAdded: (files: File[]) => void
  inputRef?: RefObject<HTMLInputElement | null>
  maxSizeMb: number
}

export function EmptyState({ onFilesAdded, inputRef, maxSizeMb }: EmptyStateProps) {
  const [isDragging, setIsDragging] = useState(false)
  return (
    <DropZone
      onFilesAdded={onFilesAdded}
      isDragging={isDragging}
      setIsDragging={setIsDragging}
      multiple
      inputRef={inputRef}
      hint={`o haz clic para seleccionar · máx. ${maxSizeMb} MB por archivo`}
    />
  )
}
