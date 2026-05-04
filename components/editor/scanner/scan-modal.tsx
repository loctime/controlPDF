"use client"

import { useState, useCallback } from "react"
import { Loader2 } from "lucide-react"
import { toast } from "sonner"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { useEditorStore } from "@/lib/editor/store"
import { ScanCamera } from "./scan-camera"
import { ScanCorners } from "./scan-corners"
import { ScanPageStrip } from "./scan-page-strip"
import {
  combineImagesToSinglePdf,
  canvasToBlob,
  canvasToDataUrl,
  type Point,
  type ScanMode,
} from "@/lib/pdf/scanner"

type ScanState = "camera" | "reviewing" | "generating"

interface ScannedPage {
  id: string
  blob: Blob
  dataUrl: string
}

interface CaptureData {
  imageDataUrl: string
  corners: Point[]
  imageSize: { w: number; h: number }
}

interface ScanModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function ScanModal({ open, onOpenChange }: ScanModalProps) {
  const addSources = useEditorStore((s) => s.addSources)

  const [scanState, setScanState] = useState<ScanState>("camera")
  const [scannedPages, setScannedPages] = useState<ScannedPage[]>([])
  const [captureData, setCaptureData] = useState<CaptureData | null>(null)
  const [mode, setMode] = useState<ScanMode>("document")

  const handleCapture = useCallback(
    (dataUrl: string, corners: Point[], size: { w: number; h: number }) => {
      setCaptureData({ imageDataUrl: dataUrl, corners, imageSize: size })
      setScanState("reviewing")
    },
    [],
  )

  const handlePageApplied = useCallback(async (enhanced: HTMLCanvasElement) => {
    const blob = await canvasToBlob(enhanced, "image/jpeg", 0.90)
    const thumb = canvasToDataUrl(enhanced, "image/jpeg", 0.5)
    setScannedPages((prev) => [
      ...prev,
      { id: crypto.randomUUID(), blob, dataUrl: thumb },
    ])
    setCaptureData(null)
    setScanState("camera")
  }, [])

  const handleBackToCamera = useCallback(() => {
    setCaptureData(null)
    setScanState("camera")
  }, [])

  const handleCreatePdf = useCallback(async () => {
    if (scannedPages.length === 0) return
    setScanState("generating")
    try {
      const blobs = scannedPages.map((p) => p.blob)
      const file = await combineImagesToSinglePdf(blobs, `escaneo-${Date.now()}`)
      await addSources([file])
      onOpenChange(false)
      toast.success(`PDF de ${scannedPages.length} página(s) agregado al editor`)
    } catch {
      toast.error("Error al generar el PDF")
      setScanState("camera")
    }
  }, [scannedPages, addSources, onOpenChange])

  const handleClose = useCallback(
    (open: boolean) => {
      if (scanState === "generating") return
      if (!open) {
        setScanState("camera")
        setScannedPages([])
        setCaptureData(null)
      }
      onOpenChange(open)
    },
    [scanState, onOpenChange],
  )

  const isGenerating = scanState === "generating"

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-2xl max-sm:max-w-full max-sm:h-dvh max-sm:rounded-none max-sm:m-0 flex flex-col gap-0 p-0">
        <DialogHeader className="p-6 pb-4 shrink-0">
          <DialogTitle>Escanear documento</DialogTitle>
          <DialogDescription>
            {scanState === "camera" &&
              "Apuntá la cámara al documento y presioná el botón para capturar"}
            {scanState === "reviewing" &&
              "Ajustá las esquinas arrastrando los puntos y elegí el modo de mejora"}
            {isGenerating && "Generando PDF…"}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-6 space-y-4 min-h-0">
          {scanState === "camera" && (
            <ScanCamera onCapture={handleCapture} />
          )}

          {scanState === "reviewing" && captureData && (
            <ScanCorners
              imageDataUrl={captureData.imageDataUrl}
              initialCorners={captureData.corners}
              imageSize={captureData.imageSize}
              mode={mode}
              onModeChange={setMode}
              onApply={handlePageApplied}
              onBack={handleBackToCamera}
            />
          )}

          {isGenerating && (
            <div className="flex flex-col items-center justify-center gap-3 py-16">
              <Loader2 className="h-10 w-10 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">
                Combinando {scannedPages.length} página(s) en un PDF…
              </p>
            </div>
          )}

          {/* Strip de páginas siempre visible si hay páginas y no está generando */}
          {scannedPages.length > 0 && !isGenerating && (
            <div className="space-y-2 pb-2">
              <p className="text-sm font-medium text-muted-foreground">
                {scannedPages.length} página(s) lista(s)
              </p>
              <ScanPageStrip
                pages={scannedPages}
                onRemove={(id) =>
                  setScannedPages((prev) => prev.filter((p) => p.id !== id))
                }
              />
            </div>
          )}
        </div>

        {/* Footer con "Crear PDF" — visible en estado cámara si hay páginas */}
        {scanState === "camera" && scannedPages.length > 0 && (
          <DialogFooter className="px-6 py-4 shrink-0 border-t">
            <Button onClick={handleCreatePdf} className="w-full sm:w-auto">
              Crear PDF ({scannedPages.length} pág.)
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  )
}
