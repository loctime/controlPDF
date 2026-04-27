"use client"

import { FileText, Loader2, X } from "lucide-react"
import { useShallow } from "zustand/react/shallow"
import { useEditorStore } from "@/lib/editor/store"
import { formatFileSize } from "@/lib/pdf"

export function SourceChipBar() {
  const sources = useEditorStore(
    useShallow((s) => s.sourceOrder.map((id) => s.sources[id]).filter(Boolean)),
  )
  const removeSource = useEditorStore((s) => s.removeSource)

  if (sources.length === 0) return null

  return (
    <div className="flex flex-wrap items-center gap-2">
      {sources.map((src) => (
        <div
          key={src.id}
          className="flex items-center gap-2 rounded-full border bg-card pl-3 pr-1 py-1 text-xs"
        >
          <FileText className="h-3.5 w-3.5 text-primary" />
          <span className="font-medium text-foreground max-w-[200px] truncate">
            {src.fileName}
          </span>
          <span className="text-muted-foreground">
            {formatFileSize(src.file.size)}
          </span>
          <span className="text-muted-foreground">·</span>
          {src.pageCount === null ? (
            <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
          ) : (
            <span className="text-muted-foreground">
              {src.pageCount} {src.pageCount === 1 ? "página" : "páginas"}
            </span>
          )}
          {src.error && (
            <span className="text-destructive">{src.error}</span>
          )}
          <button
            type="button"
            onClick={() => removeSource(src.id)}
            aria-label={`Quitar ${src.fileName}`}
            className="flex h-6 w-6 items-center justify-center rounded-full hover:bg-destructive/10"
          >
            <X className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive" />
          </button>
        </div>
      ))}
    </div>
  )
}
