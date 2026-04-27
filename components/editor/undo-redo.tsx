"use client"

import { useEffect } from "react"
import { Redo2, Undo2 } from "lucide-react"
import { useShallow } from "zustand/react/shallow"
import { Button } from "@/components/ui/button"
import { useEditorStore } from "@/lib/editor/store"

interface UndoRedoProps {
  isMac: boolean
}

export function UndoRedo({ isMac }: UndoRedoProps) {
  const { undo, redo, canUndo, canRedo } = useEditorStore(
    useShallow((s) => ({
      undo: s.undo,
      redo: s.redo,
      canUndo: s.history.length > 0,
      canRedo: s.future.length > 0,
    })),
  )

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null
      const isEditable =
        !!target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable)
      if (isEditable) return
      const mod = isMac ? e.metaKey : e.ctrlKey
      if (!mod) return
      if (e.key.toLowerCase() === "z" && !e.shiftKey) {
        e.preventDefault()
        undo()
      } else if (
        (e.key.toLowerCase() === "z" && e.shiftKey) ||
        e.key.toLowerCase() === "y"
      ) {
        e.preventDefault()
        redo()
      }
    }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [undo, redo, isMac])

  return (
    <div className="flex items-center gap-1">
      <Button
        variant="ghost"
        size="icon-sm"
        onClick={undo}
        disabled={!canUndo}
        aria-label="Deshacer"
        title={`Deshacer (${isMac ? "⌘" : "Ctrl"}+Z)`}
      >
        <Undo2 className="h-4 w-4" />
      </Button>
      <Button
        variant="ghost"
        size="icon-sm"
        onClick={redo}
        disabled={!canRedo}
        aria-label="Rehacer"
        title={`Rehacer (${isMac ? "⌘" : "Ctrl"}+Shift+Z)`}
      >
        <Redo2 className="h-4 w-4" />
      </Button>
    </div>
  )
}
