"use client"

import { useState } from "react"
import { ChevronDown, ChevronUp, Settings2 } from "lucide-react"
import { cn } from "@/lib/utils"

interface OptionsPanelProps {
  selectedTool: string
}

export function OptionsPanel({ selectedTool }: OptionsPanelProps) {
  const [isExpanded, setIsExpanded] = useState(false)

  const getToolOptions = () => {
    switch (selectedTool) {
      case "merge":
        return (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <label className="text-sm text-foreground">Mantener marcadores</label>
              <input type="checkbox" className="h-4 w-4 rounded border-input accent-primary" defaultChecked />
            </div>
          </div>
        )
      case "split":
        return (
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm text-foreground">Dividir por</label>
              <select className="w-full p-2 text-sm rounded-md border border-input bg-background text-foreground">
                <option value="pages">Páginas específicas</option>
                <option value="range">Rango de páginas</option>
                <option value="size">Tamaño máximo</option>
              </select>
            </div>
          </div>
        )
      case "compress":
        return (
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm text-foreground">Nivel de compresión</label>
              <select className="w-full p-2 text-sm rounded-md border border-input bg-background text-foreground">
                <option value="low">Baja (mejor calidad)</option>
                <option value="medium">Media (recomendado)</option>
                <option value="high">Alta (menor tamaño)</option>
              </select>
            </div>
          </div>
        )
      case "convert":
        return (
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm text-foreground">Formato de salida</label>
              <select className="w-full p-2 text-sm rounded-md border border-input bg-background text-foreground">
                <option value="word">Word (.docx)</option>
                <option value="excel">Excel (.xlsx)</option>
                <option value="image">Imagen (.jpg)</option>
                <option value="ppt">PowerPoint (.pptx)</option>
              </select>
            </div>
          </div>
        )
      case "rotate":
        return (
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm text-foreground">Rotación</label>
              <select className="w-full p-2 text-sm rounded-md border border-input bg-background text-foreground">
                <option value="90">90° a la derecha</option>
                <option value="180">180°</option>
                <option value="270">90° a la izquierda</option>
              </select>
            </div>
          </div>
        )
      case "protect":
        return (
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm text-foreground">Contraseña</label>
              <input
                type="password"
                placeholder="Ingresa una contraseña"
                className="w-full p-2 text-sm rounded-md border border-input bg-background text-foreground placeholder:text-muted-foreground"
              />
            </div>
            <div className="flex items-center justify-between">
              <label className="text-sm text-foreground">Permitir impresión</label>
              <input type="checkbox" className="h-4 w-4 rounded border-input accent-primary" defaultChecked />
            </div>
          </div>
        )
      case "sign":
        return (
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm text-foreground">Tipo de firma</label>
              <select className="w-full p-2 text-sm rounded-md border border-input bg-background text-foreground">
                <option value="draw">Dibujar firma</option>
                <option value="image">Cargar imagen</option>
                <option value="text">Texto como firma</option>
              </select>
            </div>
          </div>
        )
      case "ocr":
        return (
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm text-foreground">Idioma del documento</label>
              <select className="w-full p-2 text-sm rounded-md border border-input bg-background text-foreground">
                <option value="es">Español</option>
                <option value="en">Inglés</option>
                <option value="fr">Francés</option>
                <option value="de">Alemán</option>
              </select>
            </div>
          </div>
        )
      default:
        return null
    }
  }

  const options = getToolOptions()
  if (!options) return null

  return (
    <div className="rounded-lg border bg-card overflow-hidden">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex items-center justify-between w-full p-4 hover:bg-muted/50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Settings2 className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium text-foreground">Opciones avanzadas</span>
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
          isExpanded ? "max-h-96 opacity-100" : "max-h-0 opacity-0"
        )}
      >
        <div className="p-4 pt-0 border-t">{options}</div>
      </div>
    </div>
  )
}
