"use client"

import { useState, forwardRef } from "react"
import {
  Droplet,
  FileImage,
  Hash,
  Info,
  Lock,
  Minimize2,
  ScanText,
  Trash2,
} from "lucide-react"
import { useShallow } from "zustand/react/shallow"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { useEditorStore } from "@/lib/editor/store"
import { cn } from "@/lib/utils"
import type { GlobalOpKey } from "@/lib/editor/types"
import { UndoRedo } from "./undo-redo"
import { DownloadButton } from "./download-button"
import { WatermarkModal } from "./op-modal/watermark-modal"
import { PageNumbersModal } from "./op-modal/page-numbers-modal"
import { ProtectModal } from "./op-modal/protect-modal"
import { MetadataModal } from "./op-modal/metadata-modal"
import { CompressModal } from "./op-modal/compress-modal"
import { ConvertModal } from "./op-modal/convert-modal"
import { OcrModal } from "./op-modal/ocr-modal"

interface EditorToolbarProps {
  isMac: boolean
  onAddFiles: () => void
  onClearAll: () => void
}

export function EditorToolbar({
  isMac,
  onAddFiles,
  onClearAll,
}: EditorToolbarProps) {
  const ops = useEditorStore(
    useShallow((s) => ({
      watermark: !!s.globalOps.watermark,
      pageNumbers: !!s.globalOps.pageNumbers,
      protect: !!s.globalOps.protect,
      metadata: !!s.globalOps.metadata,
      compress: !!s.globalOps.compress,
      convert: !!s.globalOps.convert,
      ocr: !!s.globalOps.ocr,
    })),
  )
  const [open, setOpen] = useState<GlobalOpKey | null>(null)

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1">
          <UndoRedo isMac={isMac} />
          <Divider />
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="sm" onClick={onAddFiles}>
                Agregar PDF
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Agregar nuevos archivos PDF al editor</p>
            </TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                onClick={onClearAll}
                className="text-muted-foreground"
              >
                <Trash2 className="h-4 w-4" />
                Limpiar
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Eliminar todos los archivos del editor</p>
            </TooltipContent>
          </Tooltip>
          <Divider />
          <Tooltip>
            <TooltipTrigger asChild>
              <OpButton
                label="Marca de agua"
                icon={Droplet}
                active={ops.watermark}
                onClick={() => setOpen("watermark")}
              />
            </TooltipTrigger>
            <TooltipContent>
              <p>Agregar marca de agua a las páginas</p>
            </TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <OpButton
                label="Numerar"
                icon={Hash}
                active={ops.pageNumbers}
                onClick={() => setOpen("pageNumbers")}
              />
            </TooltipTrigger>
            <TooltipContent>
              <p>Agregar números de página</p>
            </TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <OpButton
                label="Comprimir"
                icon={Minimize2}
                active={ops.compress}
                onClick={() => setOpen("compress")}
              />
            </TooltipTrigger>
            <TooltipContent>
              <p>Reducir el tamaño del archivo PDF</p>
            </TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <OpButton
                label="A imagen"
                icon={FileImage}
                active={ops.convert}
                onClick={() => setOpen("convert")}
              />
            </TooltipTrigger>
            <TooltipContent>
              <p>Convertir páginas a imágenes</p>
            </TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <OpButton
                label="OCR"
                icon={ScanText}
                active={ops.ocr}
                onClick={() => setOpen("ocr")}
              />
            </TooltipTrigger>
            <TooltipContent>
              <p>Reconocer texto en las páginas</p>
            </TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <OpButton
                label="Proteger"
                icon={Lock}
                active={ops.protect}
                onClick={() => setOpen("protect")}
              />
            </TooltipTrigger>
            <TooltipContent>
              <p>Agregar contraseña y permisos</p>
            </TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <OpButton
                label="Metadatos"
                icon={Info}
                active={ops.metadata}
                onClick={() => setOpen("metadata")}
              />
            </TooltipTrigger>
            <TooltipContent>
              <p>Editar información del documento</p>
            </TooltipContent>
          </Tooltip>
        </div>
        <DownloadButton />
      </div>
      <WatermarkModal
        open={open === "watermark"}
        onOpenChange={(o) => setOpen(o ? "watermark" : null)}
      />
      <PageNumbersModal
        open={open === "pageNumbers"}
        onOpenChange={(o) => setOpen(o ? "pageNumbers" : null)}
      />
      <CompressModal
        open={open === "compress"}
        onOpenChange={(o) => setOpen(o ? "compress" : null)}
      />
      <ConvertModal
        open={open === "convert"}
        onOpenChange={(o) => setOpen(o ? "convert" : null)}
      />
      <OcrModal
        open={open === "ocr"}
        onOpenChange={(o) => setOpen(o ? "ocr" : null)}
      />
      <ProtectModal
        open={open === "protect"}
        onOpenChange={(o) => setOpen(o ? "protect" : null)}
      />
      <MetadataModal
        open={open === "metadata"}
        onOpenChange={(o) => setOpen(o ? "metadata" : null)}
      />
    </>
  )
}

function Divider() {
  return <div className="h-5 w-px bg-border mx-1" />
}

const OpButton = forwardRef<
  HTMLButtonElement,
  {
    label: string
    icon: typeof Droplet
    active: boolean
    onClick: () => void
  }
>(({ label, icon: Icon, active, onClick, ...props }, ref) => {
  return (
    <Button
      ref={ref}
      variant="ghost"
      size="sm"
      onClick={onClick}
      className={cn("relative", active && "text-primary")}
      {...props}
    >
      <Icon className="h-4 w-4" />
      <span className="hidden md:inline">{label}</span>
      {active && (
        <span className="absolute top-1 right-1 h-1.5 w-1.5 rounded-full bg-primary" />
      )}
    </Button>
  )
})
OpButton.displayName = "OpButton"
