"use client"

import { useEffect, useRef, useState, useCallback } from "react"
import { Camera, CameraOff, Loader2, Copy } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  detectDocumentCorners,
  captureVideoFrame,
  defaultCorners,
  type Point,
  type ScanDebugInfo,
} from "@/lib/pdf/scanner"

interface ScanCameraProps {
  onCapture: (
    dataUrl: string,
    corners: Point[],
    size: { w: number; h: number },
  ) => void
}

type CameraState = "requesting" | "streaming" | "error"

function categorizeError(err: unknown): string {
  if (err instanceof DOMException) {
    if (err.name === "NotAllowedError")
      return "Permisos de cámara denegados. Habilitá el acceso en la configuración del navegador."
    if (err.name === "NotFoundError")
      return "No se encontró ninguna cámara en este dispositivo."
    if (err.name === "NotReadableError")
      return "La cámara está siendo usada por otra aplicación."
    if (err.name === "OverconstrainedError")
      return "La cámara no cumple los requisitos mínimos."
  }
  return "No se pudo acceder a la cámara."
}

function formatDebug(d: ScanDebugInfo): string {
  return [
    `otsu=${d.otsuT}`,
    `bin=${d.binaryPct}%`,
    `blob=${d.blobPct}% (${d.blobPx}px)`,
    `edges=${d.edgePts}`,
    `method=${d.method}`,
    `result=${d.result}`,
  ].join(" | ")
}

export function ScanCamera({ onCapture }: ScanCameraProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const overlayRef = useRef<HTMLCanvasElement>(null)
  const detectedCornersRef = useRef<Point[] | null>(null)

  const [cameraState, setCameraState] = useState<CameraState>("requesting")
  const [errorMsg, setErrorMsg] = useState("")
  const [debugLog, setDebugLog] = useState<string[]>([])
  const [copied, setCopied] = useState(false)

  const addLog = useCallback((d: ScanDebugInfo) => {
    const line = formatDebug(d)
    setDebugLog((prev) => [line, ...prev].slice(0, 30))
  }, [])

  const drawOverlay = useCallback((corners: Point[] | null) => {
    const overlay = overlayRef.current
    const video = videoRef.current
    if (!overlay || !video) return

    overlay.width = video.clientWidth
    overlay.height = video.clientHeight

    const ctx = overlay.getContext("2d")!
    ctx.clearRect(0, 0, overlay.width, overlay.height)

    if (!corners || corners.length < 4) return

    const scaleX = overlay.width / (video.videoWidth || 1)
    const scaleY = overlay.height / (video.videoHeight || 1)
    const pts = corners.map((p) => ({ x: p.x * scaleX, y: p.y * scaleY }))

    ctx.beginPath()
    ctx.moveTo(pts[0].x, pts[0].y)
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y)
    ctx.closePath()
    ctx.strokeStyle = "#22c55e"
    ctx.lineWidth = 3
    ctx.stroke()
    ctx.fillStyle = "rgba(34,197,94,0.10)"
    ctx.fill()

    for (const p of pts) {
      ctx.beginPath()
      ctx.arc(p.x, p.y, 6, 0, Math.PI * 2)
      ctx.fillStyle = "#22c55e"
      ctx.fill()
    }
  }, [])

  // Iniciar cámara
  useEffect(() => {
    let running = true
    let stream: MediaStream | null = null

    async function start() {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 } },
        })
      } catch {
        try {
          stream = await navigator.mediaDevices.getUserMedia({ video: true })
        } catch (err) {
          if (running) {
            setErrorMsg(categorizeError(err))
            setCameraState("error")
          }
          return
        }
      }

      if (!running) { stream.getTracks().forEach((t) => t.stop()); return }

      const video = videoRef.current
      if (video) {
        video.srcObject = stream
        await video.play()
      }
      if (running) setCameraState("streaming")
    }

    start()

    return () => {
      running = false
      stream?.getTracks().forEach((t) => t.stop())
    }
  }, [])

  // Detección periódica de corners
  useEffect(() => {
    if (cameraState !== "streaming") return
    let running = true

    const tick = async () => {
      if (!running) return
      try {
        const video = videoRef.current
        if (video && video.readyState >= 2) {
          const frame = captureVideoFrame(video)
          const corners = detectDocumentCorners(frame, addLog)
          detectedCornersRef.current = corners
          drawOverlay(corners)
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        setDebugLog((prev) => [`ERROR: ${msg}`, ...prev].slice(0, 30))
      }
      if (running) setTimeout(tick, 400)
    }
    tick()

    return () => { running = false }
  }, [cameraState, drawOverlay, addLog])

  const handleCapture = useCallback(() => {
    const video = videoRef.current
    if (!video) return

    const frame = captureVideoFrame(video)
    const w = frame.width
    const h = frame.height
    const dataUrl = frame.toDataURL("image/jpeg", 0.95)

    const corners =
      detectedCornersRef.current && detectedCornersRef.current.length === 4
        ? detectedCornersRef.current
        : defaultCorners(w, h)

    onCapture(dataUrl, corners, { w, h })
  }, [onCapture])

  const handleCopyLogs = useCallback(() => {
    const text = debugLog.join("\n")
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }, [debugLog])

  return (
    <div className="space-y-2">
      {/* Vista de cámara */}
      <div
        className="relative w-full rounded-lg overflow-hidden bg-black"
        style={{ height: "min(55vh, 480px)", minHeight: "250px" }}
      >
        {cameraState === "requesting" && (
          <div className="absolute inset-0 flex items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        )}

        {cameraState === "error" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center">
            <CameraOff className="h-12 w-12 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">{errorMsg}</p>
          </div>
        )}

        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="w-full h-full object-cover"
          style={{ display: cameraState === "streaming" ? "block" : "none" }}
        />
        <canvas
          ref={overlayRef}
          className="absolute inset-0 w-full h-full pointer-events-none"
        />
      </div>

      {/* Botón capturar */}
      {cameraState === "streaming" && (
        <div className="flex justify-center">
          <Button
            onClick={handleCapture}
            size="lg"
            className="rounded-full w-14 h-14 p-0"
          >
            <Camera className="h-6 w-6" />
          </Button>
        </div>
      )}

      {/* Panel de debug */}
      {debugLog.length > 0 && (
        <div className="rounded-md border border-border bg-black/90 p-2 space-y-1">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] font-mono text-yellow-400 font-bold">DEBUG</span>
            <Button
              variant="ghost"
              size="sm"
              className="h-5 px-2 text-[10px] text-muted-foreground"
              onClick={handleCopyLogs}
            >
              <Copy className="h-3 w-3 mr-1" />
              {copied ? "Copiado!" : "Copiar"}
            </Button>
          </div>
          <div className="max-h-36 overflow-y-auto space-y-0.5">
            {debugLog.map((line, i) => (
              <p
                key={i}
                className="text-[10px] font-mono leading-tight break-all"
                style={{
                  color: line.includes("result=ok") ? "#4ade80" : "#f87171",
                }}
              >
                {line}
              </p>
            ))}
          </div>
          <p className="text-[9px] text-muted-foreground mt-1">
            otsu=umbral · bin=%px brillantes · blob=componente mayor · edges=px borde
          </p>
        </div>
      )}
    </div>
  )
}
