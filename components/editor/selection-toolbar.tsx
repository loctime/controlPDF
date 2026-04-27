"use client"

import { Copy, RotateCcw, RotateCw, Trash2, X } from "lucide-react"
import { useShallow } from "zustand/react/shallow"
import { Button } from "@/components/ui/button"
import { useEditorStore } from "@/lib/editor/store"

export function SelectionToolbar() {
  const count = useEditorStore((s) => s.selection.pageIds.size)
  const { rotateSelected, deleteSelected, clearSelection, duplicatePage, selection } =
    useEditorStore(
      useShallow((s) => ({
        rotateSelected: s.rotateSelected,
        deleteSelected: s.deleteSelected,
        clearSelection: s.clearSelection,
        duplicatePage: s.duplicatePage,
        selection: s.selection,
      })),
    )

  if (count === 0) return null

  const handleDuplicate = () => {
    Array.from(selection.pageIds).forEach((id) => duplicatePage(id))
  }

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-30 flex items-center gap-1 rounded-lg border bg-card shadow-lg px-2 py-1.5">
      <span className="text-xs text-muted-foreground px-2">
        {count} {count === 1 ? "página" : "páginas"}
      </span>
      <div className="h-5 w-px bg-border mx-1" />
      <Button
        variant="ghost"
        size="sm"
        onClick={() => rotateSelected(-90)}
        aria-label="Rotar selección -90°"
      >
        <RotateCcw className="h-4 w-4" />
      </Button>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => rotateSelected(90)}
        aria-label="Rotar selección +90°"
      >
        <RotateCw className="h-4 w-4" />
      </Button>
      <Button variant="ghost" size="sm" onClick={handleDuplicate} aria-label="Duplicar selección">
        <Copy className="h-4 w-4" />
      </Button>
      <Button
        variant="ghost"
        size="sm"
        onClick={deleteSelected}
        aria-label="Eliminar selección"
        className="text-destructive hover:text-destructive"
      >
        <Trash2 className="h-4 w-4" />
      </Button>
      <div className="h-5 w-px bg-border mx-1" />
      <Button
        variant="ghost"
        size="sm"
        onClick={clearSelection}
        aria-label="Limpiar selección"
      >
        <X className="h-4 w-4" />
      </Button>
    </div>
  )
}
