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
import {
  getOpenCvStatus,
  loadOpenCv,
  subscribeOpenCvStatus,
  type OpenCvStatus,
} from "@/lib/pdf/opencv"

interface ScanCameraProps {
  onCapture: (
    dataUrl: string,
    corners: Point[],
    size: { w: number; h: number },
  ) => void
}

type CameraState = "requesting" | "streaming" | "error"
type DetectionState = "searching" | "ready" | "capturing"

const AUTO_CAPTURE_DELAY_FRAMES = 4
const AUTO_CAPTURE_COOLDOWN_MS = 2500

function categorizeError(err: unknown): string {
  if (err instanceof DOMException) {
    if (err.name === "NotAllowedError") {
      return "Permisos de camara denegados. Habilita el acceso en la configuracion del navegador."
    }
    if (err.name === "NotFoundError") {
      return "No se encontro ninguna camara en este dispositivo."
    }
    if (err.name === "NotReadableError") {
      return "La camara esta siendo usada por otra aplicacion."
    }
    if (err.name === "OverconstrainedError") {
      return "La camara no cumple los requisitos minimos."
    }
  }
  return "No se pudo acceder a la camara."
}

function polygonArea(points: Point[]): number {
  let area = 0
  for (let i = 0; i < points.length; i++) {
    const next = points[(i + 1) % points.length]
    area += points[i].x * next.y - next.x * points[i].y
  }
  return Math.abs(area) / 2
}

function averageCornerDelta(a: Point[], b: Point[]): number {
  if (a.length !== b.length || a.length === 0) return Number.POSITIVE_INFINITY
  let total = 0
  for (let i = 0; i < a.length; i++) {
    total += Math.hypot(a[i].x - b[i].x, a[i].y - b[i].y)
  }
  return total / a.length
}

function getRenderedVideoRect(video: HTMLVideoElement, overlay: HTMLCanvasElement) {
  const containerW = overlay.width
  const containerH = overlay.height
  const sourceW = video.videoWidth || 1
  const sourceH = video.videoHeight || 1
  const scale = Math.min(containerW / sourceW, containerH / sourceH)
  const width = sourceW * scale
  const height = sourceH * scale

  return {
    x: (containerW - width) / 2,
    y: (containerH - height) / 2,
    width,
    height,
  }
}

export function ScanCamera({ onCapture }: ScanCameraProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const overlayRef = useRef<HTMLCanvasElement>(null)
  const detectedCornersRef = useRef<Point[] | null>(null)
  const smoothedCornersRef = useRef<Point[] | null>(null)
  const hitCountRef = useRef(0)
  const missCountRef = useRef(0)
  const readyFrameCountRef = useRef(0)
  const lastAutoCaptureAtRef = useRef(0)
  const autoCapturePendingRef = useRef(false)

  const [cameraState, setCameraState] = useState<CameraState>("requesting")
  const [detectionState, setDetectionState] = useState<DetectionState>("searching")
  const [errorMsg, setErrorMsg] = useState("")
  const [opencvStatus, setOpenCvStatus] = useState<OpenCvStatus>(getOpenCvStatus())

  const drawOverlay = useCallback(
    (corners: Point[] | null) => {
      const overlay = overlayRef.current
      const video = videoRef.current
      if (!overlay || !video) return

      overlay.width = video.clientWidth
      overlay.height = video.clientHeight

      const ctx = overlay.getContext("2d")
      if (!ctx) return
      ctx.clearRect(0, 0, overlay.width, overlay.height)

      if (!corners || corners.length < 4) return

      const rect = getRenderedVideoRect(video, overlay)
      const scaleX = rect.width / (video.videoWidth || 1)
      const scaleY = rect.height / (video.videoHeight || 1)
      const pts = corners.map((p) => ({
        x: rect.x + p.x * scaleX,
        y: rect.y + p.y * scaleY,
      }))
      const strokeColor = detectionState === "ready" ? "#22c55e" : "#f59e0b"

      ctx.beginPath()
      ctx.moveTo(pts[0].x, pts[0].y)
      for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y)
      ctx.closePath()
      ctx.strokeStyle = strokeColor
      ctx.lineWidth = 3
      ctx.stroke()
      ctx.fillStyle =
        detectionState === "ready" ? "rgba(34,197,94,0.10)" : "rgba(245,158,11,0.12)"
      ctx.fill()

      for (const p of pts) {
        ctx.beginPath()
        ctx.arc(p.x, p.y, 6, 0, Math.PI * 2)
        ctx.fillStyle = strokeColor
        ctx.fill()
      }
    },
    [detectionState],
  )

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

    autoCapturePendingRef.current = false
    readyFrameCountRef.current = 0
    setDetectionState("capturing")
    onCapture(dataUrl, corners, { w, h })
  }, [onCapture])

  useEffect(() => {
    const unsubscribe = subscribeOpenCvStatus(setOpenCvStatus)
    void loadOpenCv()
    return unsubscribe
  }, [])

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

      if (!running) {
        stream.getTracks().forEach((track) => track.stop())
        return
      }

      const video = videoRef.current
      if (video) {
        video.srcObject = stream
        video.play().catch(() => {})
      }
      if (running) setCameraState("streaming")
    }

    start()

    return () => {
      running = false
      stream?.getTracks().forEach((track) => track.stop())
    }
  }, [])

  useEffect(() => {
    if (cameraState !== "streaming") return
    let running = true

    const tick = async () => {
      if (!running) return

      try {
        const video = videoRef.current
        if (video && video.readyState >= 2) {
          const frame = captureVideoFrame(video)
          const previous = smoothedCornersRef.current
          const raw = await detectDocumentCorners(frame)

          if (raw && raw.length === 4) {
            hitCountRef.current++
            missCountRef.current = 0

            if (previous && previous.length === 4) {
              smoothedCornersRef.current = raw.map((point, index) => ({
                x: 0.35 * point.x + 0.65 * previous[index].x,
                y: 0.35 * point.y + 0.65 * previous[index].y,
              }))
            } else {
              smoothedCornersRef.current = raw
            }
          } else {
            hitCountRef.current = 0
            missCountRef.current++
            readyFrameCountRef.current = 0
            if (missCountRef.current > 5) smoothedCornersRef.current = null
          }

          const smoothed = smoothedCornersRef.current
          detectedCornersRef.current = smoothed

          if (smoothed && smoothed.length === 4) {
            const areaRatio = polygonArea(smoothed) / (frame.width * frame.height)
            const margin = Math.min(frame.width, frame.height) * 0.03
            const insideFrame = smoothed.every(
              (point) =>
                point.x >= margin &&
                point.y >= margin &&
                point.x <= frame.width - margin &&
                point.y <= frame.height - margin,
            )
            const stability =
              previous && previous.length === 4
                ? averageCornerDelta(smoothed, previous) / Math.hypot(frame.width, frame.height)
                : 0
            const ready = insideFrame && areaRatio >= 0.18 && stability <= 0.015

            if (ready) {
              readyFrameCountRef.current++
              setDetectionState("ready")

              const now = Date.now()
              if (
                readyFrameCountRef.current >= AUTO_CAPTURE_DELAY_FRAMES &&
                !autoCapturePendingRef.current &&
                now - lastAutoCaptureAtRef.current >= AUTO_CAPTURE_COOLDOWN_MS
              ) {
                autoCapturePendingRef.current = true
                lastAutoCaptureAtRef.current = now
                handleCapture()
                return
              }
            } else {
              readyFrameCountRef.current = 0
              setDetectionState("searching")
            }
          } else {
            setDetectionState("searching")
          }

          drawOverlay(smoothed)
        }
      } catch {
        // Mantener el loop activo aunque falle una iteracion.
      }

      if (running) setTimeout(tick, 300)
    }

    tick()

    return () => {
      running = false
    }
  }, [cameraState, drawOverlay, handleCapture])

  return (
    <div className="space-y-2">
      <div
        className="relative w-full rounded-lg overflow-hidden bg-black"
        style={{ height: "min(55vh, 480px)", minHeight: "250px" }}
      >
        <div className="absolute left-3 top-3 z-10 rounded-full border border-white/10 bg-black/70 px-3 py-1 text-xs font-medium text-white backdrop-blur">
          {opencvStatus === "loading" && "cargando"}
          {opencvStatus === "loaded" && "cargado"}
          {opencvStatus === "failed" && "fallo"}
        </div>
        <div className="absolute right-3 top-3 z-10 rounded-full border border-white/10 bg-black/70 px-3 py-1 text-xs font-medium text-white backdrop-blur">
          {detectionState === "searching" && "buscando hoja"}
          {detectionState === "ready" && "listo para capturar"}
          {detectionState === "capturing" && "capturando"}
        </div>

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
          className="h-full w-full bg-black object-contain"
          style={{ display: cameraState === "streaming" ? "block" : "none" }}
        />
        <canvas
          ref={overlayRef}
          className="pointer-events-none absolute inset-0 h-full w-full"
        />
      </div>

      {cameraState === "streaming" && (
        <div className="space-y-2">
          <p className="text-center text-xs text-muted-foreground">
            Alinea la hoja completa. Si la deteccion se estabiliza, la captura sale automatica.
          </p>
          <div className="flex justify-center">
            <Button
              onClick={handleCapture}
              size="lg"
              className="h-14 w-14 rounded-full p-0"
            >
              <Camera className="h-6 w-6" />
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
