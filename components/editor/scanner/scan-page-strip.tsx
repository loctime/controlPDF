"use client"

import { X } from "lucide-react"
import { Button } from "@/components/ui/button"

interface ScannedPageThumb {
  id: string
  dataUrl: string
}

interface ScanPageStripProps {
  pages: ScannedPageThumb[]
  onRemove: (id: string) => void
}

export function ScanPageStrip({ pages, onRemove }: ScanPageStripProps) {
  if (pages.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-2 text-center">
        Sin páginas aún — capturá la primera hoja
      </p>
    )
  }

  return (
    <div className="flex gap-2 overflow-x-auto pb-1">
      {pages.map((page, i) => (
        <div key={page.id} className="relative flex-shrink-0">
          <div className="w-[60px] h-[84px] rounded border border-border overflow-hidden bg-muted">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={page.dataUrl}
              alt={`Página ${i + 1}`}
              className="w-full h-full object-cover"
              draggable={false}
            />
          </div>
          <span className="absolute bottom-0 left-0 right-0 text-center text-[10px] bg-black/50 text-white rounded-b leading-tight py-0.5">
            {i + 1}
          </span>
          <Button
            variant="destructive"
            size="icon"
            className="absolute -top-1.5 -right-1.5 h-4 w-4 rounded-full p-0"
            onClick={() => onRemove(page.id)}
          >
            <X className="h-2.5 w-2.5" />
          </Button>
        </div>
      ))}
    </div>
  )
}
