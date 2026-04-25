"use client"

import { useState } from "react"
import { ChevronDown, ChevronUp, Settings2 } from "lucide-react"
import { cn } from "@/lib/utils"
import type { RotationAngle } from "@/lib/pdf-engine"

export type MergeOptions = { keepBookmarks: boolean }
export type RotateOptions = { angle: RotationAngle }
export type SplitOptions = { ranges: string }

export type ToolOptions =
  | { tool: "merge"; options: MergeOptions }
  | { tool: "rotate"; options: RotateOptions }
  | { tool: "split"; options: SplitOptions }

interface OptionsPanelProps {
  selectedTool: string
  mergeOptions: MergeOptions
  rotateOptions: RotateOptions
  splitOptions: SplitOptions
  onMergeChange: (o: MergeOptions) => void
  onRotateChange: (o: RotateOptions) => void
  onSplitChange: (o: SplitOptions) => void
}

export function OptionsPanel({
  selectedTool,
  mergeOptions,
  rotateOptions,
  splitOptions,
  onMergeChange,
  onRotateChange,
  onSplitChange,
}: OptionsPanelProps) {
  const [isExpanded, setIsExpanded] = useState(false)

  const renderOptions = () => {
    switch (selectedTool) {
      case "merge":
        return (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <label className="text-sm text-foreground" htmlFor="opt-keep-bookmarks">
                Mantener marcadores
              </label>
              <input
                id="opt-keep-bookmarks"
                type="checkbox"
                className="h-4 w-4 rounded border-input accent-primary"
                checked={mergeOptions.keepBookmarks}
                onChange={(e) => onMergeChange({ keepBookmarks: e.target.checked })}
              />
            </div>
          </div>
        )
      case "rotate":
        return (
          <div className="space-y-2">
            <label className="text-sm text-foreground" htmlFor="opt-rotate-angle">
              Rotación
            </label>
            <select
              id="opt-rotate-angle"
              value={rotateOptions.angle}
              onChange={(e) =>
                onRotateChange({ angle: Number(e.target.value) as RotationAngle })
              }
              className="w-full p-2 text-sm rounded-md border border-input bg-background text-foreground"
            >
              <option value={90}>90° a la derecha</option>
              <option value={180}>180°</option>
              <option value={270}>90° a la izquierda</option>
            </select>
          </div>
        )
      case "split":
        return (
          <div className="space-y-2">
            <label className="text-sm text-foreground" htmlFor="opt-split-ranges">
              Rangos de páginas
            </label>
            <input
              id="opt-split-ranges"
              type="text"
              placeholder="Ej: 1-3, 5, 7-9"
              value={splitOptions.ranges}
              onChange={(e) => onSplitChange({ ranges: e.target.value })}
              className="w-full p-2 text-sm rounded-md border border-input bg-background text-foreground placeholder:text-muted-foreground"
            />
            <p className="text-xs text-muted-foreground">
              Cada rango se convierte en un PDF independiente. Dejá vacío para extraer cada página.
            </p>
          </div>
        )
      default:
        return null
    }
  }

  const options = renderOptions()
  if (!options) return null

  return (
    <div className="rounded-lg border bg-card overflow-hidden">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex items-center justify-between w-full p-4 hover:bg-muted/50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Settings2 className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium text-foreground">Opciones</span>
        </div>
        {isExpanded ? (
          <ChevronUp className="h-4 w-4 text-muted-foreground" />
        ) : (
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        )}
      </button>
      <div
        className={cn(
          "overflow-hidden transition-all duration-300",
          isExpanded ? "max-h-96 opacity-100" : "max-h-0 opacity-0",
        )}
      >
        <div className="p-4 pt-0 border-t">{options}</div>
      </div>
    </div>
  )
}
