"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { Camera, Loader2, Check, X } from "lucide-react"
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
import { ScanPageStrip } from "./scan-page-strip"
import { CornerEditor } from "./corner-editor"
import { ModeToggle } from "./mode-toggle"
import { ScannerClient } from "@/lib/scanner/client"
import { defaultCorners } from "@/lib/scanner/detect"
import type { Corners, ScanMode } from "@/lib/scanner/types"
import { PDFDocument } from "@cantoo/pdf-lib"

type State =
  | "idle"
  | "detecting"
  | "adjusting"
  | "warping"
  | "previewing"
  | "generating"

interface ScannedPage {
  id: string
  blob: Blob
  dataUrl: string
}

interface Capture {
  /** Foto original. Se guarda el File para poder recrear el bitmap: cada
   *  postMessage transfiere el bitmap al worker y lo deja inutilizable. */
  file: File
  url: string
  corners: Corners
}

interface Preview {
  url: string
  blob: Blob
}

const JPEG_QUALITY = 0.9

/**
 * Tope del lado largo del bitmap decodificado. Sin esto, una foto de 12-48 MP
 * hace que el worker maneje un `ImageData` y un `cv.Mat` de decenas o cientos
 * de MB (`getImageData`/`matFromImageData` a resolución completa) — riesgo
 * real de quedarse sin memoria en el celular. La salida ya está topeada a
 * 3000px (`MAX_OUTPUT_SIDE` en warp.ts), así que topear la entrada acá no se
 * nota en la calidad final.
 */
const MAX_INPUT_SIDE = 4000

/**
 * Decodifica el archivo una sola vez y lo reduce si excede `MAX_INPUT_SIDE`.
 * Esta es la única fuente de verdad del tamaño con el que trabajan la
 * detección, el editor de esquinas y el warp: todos comparten este mismo
 * espacio de coordenadas porque todos parten de un bitmap decodificado con
 * esta misma función.
 */
async function decodeCapped(file: File): Promise<ImageBitmap> {
  const raw = await createImageBitmap(file)
  const scale = Math.min(1, MAX_INPUT_SIDE / Math.max(raw.width, raw.height))
  if (scale >= 1) return raw
  const resized = await createImageBitmap(raw, {
    resizeWidth: Math.round(raw.width * scale),
    resizeHeight: Math.round(raw.height * scale),
    resizeQuality: "high",
  })
  raw.close()
  return resized
}

async function bitmapToBlob(bitmap: ImageBitmap, quality: number): Promise<Blob> {
  const canvas = document.createElement("canvas")
  canvas.width = bitmap.width
  canvas.height = bitmap.height
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0)
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("No se pudo generar la imagen"))),
      "image/jpeg",
      quality,
    )
  })
}

async function imagesToPdf(blobs: Blob[], name: string): Promise<File> {
  const doc = await PDFDocument.create()
  for (const blob of blobs) {
    const bytes = new Uint8Array(await blob.arrayBuffer())
    // Las páginas procesadas son JPEG, pero "guardar sin enderezar" mete el
    // archivo original tal cual, que puede ser PNG.
    const isPng = bytes[0] === 0x89 && bytes[1] === 0x50
    const image = isPng ? await doc.embedPng(bytes) : await doc.embedJpg(bytes)
    const { width, height } = image.scale(1)
    const page = doc.addPage([width, height])
    page.drawImage(image, { x: 0, y: 0, width, height })
  }
  const pdfBytes = await doc.save()
  return new File([pdfBytes.buffer as ArrayBuffer], `${name}.pdf`, {
    type: "application/pdf",
  })
}

interface ScanModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function ScanModal({ open, onOpenChange }: ScanModalProps) {
  const addSources = useEditorStore((s) => s.addSources)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const clientRef = useRef<ScannerClient | null>(null)
  /**
   * Espejo síncrono de `open`, leído dentro de continuaciones async. El modal
   * no se desmonta al cerrarse (el padre lo renderiza siempre), así que si
   * detect/warp/restyle sigue en vuelo cuando el usuario cierra, el efecto de
   * abajo ya reseteó el estado a "idle" — sin este chequeo, la continuación
   * que se resuelve después pisaría ese reset y dejaría el modal trabado en
   * "adjusting"/"previewing" con capture/preview en null (pantalla en blanco,
   * sin salida) la próxima vez que se abra.
   */
  const openRef = useRef(open)

  const [state, setState] = useState<State>("idle")
  const [pages, setPages] = useState<ScannedPage[]>([])
  const [capture, setCapture] = useState<Capture | null>(null)
  const [preview, setPreview] = useState<Preview | null>(null)
  const [mode, setMode] = useState<ScanMode>("document")
  /** true si OpenCV no está disponible: habilita guardar la foto sin procesar. */
  const [degraded, setDegraded] = useState(false)
  /** true mientras `restyle()` está en vuelo: bloquea aceptar la página. */
  const [restyling, setRestyling] = useState(false)

  const getClient = useCallback(() => {
    if (!clientRef.current) clientRef.current = new ScannerClient()
    return clientRef.current
  }, [])

  useEffect(() => {
    openRef.current = open
  }, [open])

  // Red de seguridad al desmontar: con el modal montado una sola vez (ver
  // pdf-editor.tsx) esto no debería dispararse en el camino principal, pero
  // si en el futuro alguien vuelve a montarlo condicionalmente, el worker no
  // queda vivo indefinidamente. El efecto de `[open]` ya revoca las URLs de
  // objeto al cerrar, así que acá alcanza con terminar el cliente.
  useEffect(
    () => () => {
      clientRef.current?.terminate()
      clientRef.current = null
    },
    [],
  )

  // Liberar recursos al cerrar.
  useEffect(() => {
    if (open) return
    clientRef.current?.terminate()
    clientRef.current = null
    setState("idle")
    setPages((prev) => {
      prev.forEach((p) => URL.revokeObjectURL(p.dataUrl))
      return []
    })
    setCapture((prev) => {
      if (prev) URL.revokeObjectURL(prev.url)
      return null
    })
    setPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev.url)
      return null
    })
    setMode("document")
    setDegraded(false)
  }, [open])

  const addPage = useCallback(async (blob: Blob) => {
    setPages((prev) => [
      ...prev,
      { id: crypto.randomUUID(), blob, dataUrl: URL.createObjectURL(blob) },
    ])
  }, [])

  const resetToIdle = useCallback(() => {
    setCapture((prev) => {
      if (prev) URL.revokeObjectURL(prev.url)
      return null
    })
    setPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev.url)
      return null
    })
    setState("idle")
  }, [])

  const handleFile = useCallback(
    async (file: File) => {
      setState("detecting")

      // Un solo decode del archivo (ver decodeCapped): antes se decodificaba
      // acá para medir dimensiones y de nuevo para detectar. Ancho y alto
      // salen de este mismo bitmap, que además ya viene topeado a
      // MAX_INPUT_SIDE.
      let bitmap: ImageBitmap
      try {
        bitmap = await decodeCapped(file)
      } catch {
        if (openRef.current) {
          toast.error("No se pudo leer la foto. Probá sacarla de nuevo.")
          setState("idle")
        }
        return
      }

      const width = bitmap.width
      const height = bitmap.height

      // Miniatura para el editor de esquinas. Se genera antes de transferir
      // el bitmap al worker: la transferencia lo deja inutilizable. Queda en
      // el mismo espacio de coordenadas que `width`/`height` porque sale del
      // mismo bitmap.
      let displayUrl: string
      try {
        const displayBlob = await bitmapToBlob(bitmap, JPEG_QUALITY)
        displayUrl = URL.createObjectURL(displayBlob)
      } catch {
        bitmap.close()
        if (openRef.current) {
          toast.error("No se pudo leer la foto. Probá sacarla de nuevo.")
          setState("idle")
        }
        return
      }

      // La detección es best-effort: si falla, el usuario ajusta a mano.
      let corners = defaultCorners(width, height)
      try {
        const detected = await getClient().detect(bitmap)
        if (detected) corners = detected
        else if (openRef.current) toast.info("No encontré los bordes. Ajustalos vos.")
      } catch {
        if (openRef.current) {
          setDegraded(true)
          toast.warning("La detección automática no está disponible. Ajustá los bordes a mano.")
        }
      }

      // El modal pudo cerrarse mientras la detección estaba en curso.
      if (!openRef.current) {
        URL.revokeObjectURL(displayUrl)
        return
      }
      setCapture({ file, url: displayUrl, corners })
      setState("adjusting")
    },
    [getClient],
  )

  const confirmCorners = useCallback(async () => {
    if (!capture) return
    setState("warping")
    let result: ImageBitmap | null = null
    try {
      // Mismo decode topeado que en handleFile: capture.corners está en ese
      // espacio de coordenadas, no en el de capture.file a resolución
      // completa.
      const bitmap = await decodeCapped(capture.file)
      result = await getClient().warp(bitmap, capture.corners, mode)
      const blob = await bitmapToBlob(result, JPEG_QUALITY)
      if (!openRef.current) return
      setPreview((prev) => {
        if (prev) URL.revokeObjectURL(prev.url)
        return { url: URL.createObjectURL(blob), blob }
      })
      setState("previewing")
      // Un warp exitoso confirma que OpenCV está andando: la salida de
      // emergencia de "guardar sin enderezar" ya no hace falta.
      setDegraded(false)
    } catch (err) {
      if (!openRef.current) return
      setDegraded(true)
      toast.error(err instanceof Error ? err.message : "No se pudo procesar la página")
      setState("adjusting")
    } finally {
      // `bitmapToBlob` puede tirar (canvas sin contexto, toBlob devolviendo
      // null bajo presión de memoria) antes de llegar al close() original:
      // acá corre siempre.
      result?.close()
    }
  }, [capture, mode, getClient])

  /** Cambia el modo re-aplicando la mejora sobre el enderezado ya cacheado. */
  const changeMode = useCallback(
    async (next: ScanMode) => {
      if (state !== "previewing") {
        setMode(next)
        return
      }
      const previous = mode
      setMode(next)
      setRestyling(true)
      let result: ImageBitmap | null = null
      try {
        result = await getClient().restyle(next)
        const blob = await bitmapToBlob(result, JPEG_QUALITY)
        if (!openRef.current) return
        setPreview((prev) => {
          if (prev) URL.revokeObjectURL(prev.url)
          return { url: URL.createObjectURL(blob), blob }
        })
      } catch {
        if (!openRef.current) return
        // La vista previa sigue mostrando `previous`: no dejar el toggle
        // apuntando a un modo que no es el de la imagen visible.
        setMode(previous)
        toast.error("No se pudo cambiar el modo")
      } finally {
        result?.close()
        setRestyling(false)
      }
    },
    [state, mode, getClient],
  )

  const acceptPage = useCallback(async () => {
    // Con un restyle en vuelo, preview.blob todavía es el de mode anterior:
    // aceptar acá guardaría un modo distinto al que el toggle muestra.
    if (!preview || restyling) return
    await addPage(preview.blob)
    getClient().release()
    resetToIdle()
  }, [preview, restyling, addPage, getClient, resetToIdle])

  /** Salida de emergencia cuando OpenCV no está disponible. */
  const saveUnprocessed = useCallback(async () => {
    if (!capture) return
    await addPage(capture.file)
    // Un warp fallido (por eso `degraded`) puede haber dejado un enderezado
    // parcial cacheado en el worker antes de romperse en el estilizado.
    getClient().release()
    toast.info("Página guardada sin enderezar")
    resetToIdle()
  }, [capture, addPage, getClient, resetToIdle])

  const backToCorners = useCallback(() => {
    setPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev.url)
      return null
    })
    getClient().release()
    setState("adjusting")
  }, [getClient])

  const discardCapture = useCallback(() => {
    getClient().release()
    resetToIdle()
  }, [getClient, resetToIdle])

  const createPdf = useCallback(async () => {
    if (pages.length === 0) return
    setState("generating")
    try {
      const file = await imagesToPdf(
        pages.map((p) => p.blob),
        `escaneo-${Date.now()}`,
      )
      await addSources([file])
      toast.success(`PDF de ${pages.length} página(s) agregado al editor`)
      onOpenChange(false)
    } catch {
      toast.error("No se pudo generar el PDF")
      setState("idle")
    }
  }, [pages, addSources, onOpenChange])

  const busy = state === "detecting" || state === "warping" || state === "generating"

  return (
    <Dialog open={open} onOpenChange={(next) => !busy && onOpenChange(next)}>
      <DialogContent className="sm:max-w-2xl max-sm:max-w-full max-sm:h-dvh max-sm:rounded-none max-sm:m-0 flex flex-col gap-0 p-0">
        <DialogHeader className="px-5 pt-4 pb-2 shrink-0">
          <DialogTitle>Escanear documento</DialogTitle>
          <DialogDescription>
            {state === "idle" && "Sacá una foto del documento con la cámara del celular"}
            {state === "detecting" && "Buscando los bordes del documento…"}
            {state === "adjusting" && "Ajustá las esquinas arrastrando los puntos"}
            {state === "warping" && "Enderezando y mejorando…"}
            {state === "previewing" && "Así queda. Probá otro modo si no te convence"}
            {state === "generating" && "Generando el PDF…"}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-4 space-y-3 min-h-0">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0]
              e.target.value = "" // permite volver a elegir la misma foto
              if (file) void handleFile(file)
            }}
          />

          {state === "idle" && (
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="w-full flex flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed py-16 hover:bg-muted/50 transition-colors"
            >
              <Camera className="h-10 w-10 text-muted-foreground" />
              <span className="text-sm font-medium">
                {pages.length === 0 ? "Sacar foto" : "Agregar otra página"}
              </span>
            </button>
          )}

          {busy && (
            <div className="flex flex-col items-center justify-center gap-3 py-16">
              <Loader2 className="h-10 w-10 animate-spin text-primary" />
            </div>
          )}

          {state === "adjusting" && capture && (
            <div className="space-y-3">
              <CornerEditor
                imageUrl={capture.url}
                corners={capture.corners}
                onChange={(corners) => setCapture({ ...capture, corners })}
              />
              <div className="flex gap-2">
                <Button variant="outline" onClick={discardCapture} className="flex-1">
                  <X className="h-4 w-4 mr-1" />
                  Descartar
                </Button>
                <Button onClick={confirmCorners} className="flex-1">
                  Continuar
                </Button>
              </div>
              {degraded && (
                <Button variant="ghost" onClick={saveUnprocessed} className="w-full text-xs">
                  Guardar la foto sin enderezar
                </Button>
              )}
            </div>
          )}

          {state === "previewing" && preview && (
            <div className="space-y-3">
              <img
                src={preview.url}
                alt="Página procesada"
                className="w-full h-auto rounded-lg"
              />
              <ModeToggle value={mode} onChange={changeMode} disabled={restyling} />
              <div className="flex gap-2">
                <Button variant="outline" onClick={backToCorners} className="flex-1">
                  Volver a las esquinas
                </Button>
                <Button onClick={acceptPage} disabled={restyling} className="flex-1">
                  <Check className="h-4 w-4 mr-1" />
                  Usar esta página
                </Button>
              </div>
            </div>
          )}

          {pages.length > 0 && state !== "generating" && (
            <div className="space-y-2 pb-2">
              <p className="text-sm font-medium text-muted-foreground">
                {pages.length} página(s) lista(s)
              </p>
              <ScanPageStrip
                pages={pages}
                onRemove={(id) =>
                  setPages((prev) => {
                    const target = prev.find((p) => p.id === id)
                    if (target) URL.revokeObjectURL(target.dataUrl)
                    return prev.filter((p) => p.id !== id)
                  })
                }
              />
            </div>
          )}
        </div>

        {state === "idle" && pages.length > 0 && (
          <DialogFooter className="px-6 py-4 shrink-0 border-t">
            <Button onClick={createPdf} className="w-full sm:w-auto">
              Crear PDF ({pages.length} pág.)
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  )
}
