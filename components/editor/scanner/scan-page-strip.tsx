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
        // El padding superior y derecho deja lugar para el boton de borrar, que
        // sobresale de la miniatura y necesita un area tocable decente.
        <div key={page.id} className="relative flex-shrink-0 pt-2 pr-2">
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
            aria-label={`Borrar página ${i + 1}`}
            className="absolute top-0 right-0 h-7 w-7 rounded-full p-0 shadow-sm"
            onClick={() => onRemove(page.id)}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      ))}
    </div>
  )
}
