"use client"

import { useEffect, useRef, useState, useCallback } from "react"
import { Camera, CameraOff, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  detectDocumentCorners,
  captureVideoFrame,
  defaultCorners,
  type Point,
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

export function ScanCamera({ onCapture }: ScanCameraProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const overlayRef = useRef<HTMLCanvasElement>(null)
  const detectedCornersRef = useRef<Point[] | null>(null)

  const [cameraState, setCameraState] = useState<CameraState>("requesting")
  const [errorMsg, setErrorMsg] = useState("")

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
        // Fallback: cualquier cámara disponible
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

  // Detección periódica de corners (solo mientras streaming)
  useEffect(() => {
    if (cameraState !== "streaming") return
    let running = true

    const tick = async () => {
      if (!running) return
      const video = videoRef.current
      if (video && video.readyState >= 2) {
        const frame = captureVideoFrame(video)
        const corners = detectDocumentCorners(frame)
        detectedCornersRef.current = corners
        drawOverlay(corners)
      }
      if (running) setTimeout(tick, 300)
    }
    tick()

    return () => { running = false }
  }, [cameraState, drawOverlay])

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

  return (
    <div className="space-y-3">
      <div
        className="relative w-full rounded-lg overflow-hidden bg-black"
        style={{ height: "min(62vh, 520px)", minHeight: "280px" }}
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

      {cameraState === "streaming" && (
        <>
          <div className="flex justify-center">
            <Button
              onClick={handleCapture}
              size="lg"
              className="rounded-full w-16 h-16 p-0"
            >
              <Camera className="h-6 w-6" />
            </Button>
          </div>
          <p className="text-xs text-muted-foreground text-center">
            El borde verde indica documento detectado · presioná para capturar
          </p>
        </>
      )}
    </div>
  )
}
