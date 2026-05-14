export type OpenCvLike = {
  Mat: new () => any
  MatVector: new () => any
  Size: new (width: number, height: number) => any
  COLOR_RGBA2GRAY: number
  BORDER_DEFAULT: number
  RETR_EXTERNAL: number
  CHAIN_APPROX_SIMPLE: number
  imread: (src: HTMLCanvasElement) => any
  cvtColor: (src: any, dst: any, code: number) => void
  GaussianBlur: (
    src: any,
    dst: any,
    ksize: any,
    sigmaX: number,
    sigmaY: number,
    borderType: number,
  ) => void
  Canny: (src: any, edges: any, threshold1: number, threshold2: number) => void
  findContours: (image: any, contours: any, hierarchy: any, mode: number, method: number) => void
  approxPolyDP: (curve: any, approxCurve: any, epsilon: number, closed: boolean) => void
  arcLength: (curve: any, closed: boolean) => number
  contourArea: (curve: any) => number
}

export type OpenCvStatus = "idle" | "loading" | "loaded" | "failed"

const OPENCV_SRC = "/opencv.js"
let loadPromise: Promise<OpenCvLike | null> | null = null
let status: OpenCvStatus = "idle"
const listeners = new Set<(next: OpenCvStatus) => void>()

function emit(next: OpenCvStatus) {
  status = next
  for (const listener of listeners) listener(next)
}

function currentCvSync(): OpenCvLike | null {
  if (typeof window === "undefined") return null
  const cv = (window as typeof window & { cv?: unknown }).cv
  if (!cv || typeof (cv as Promise<OpenCvLike>).then === "function") return null
  return typeof (cv as Partial<OpenCvLike>).Mat === "function" ? (cv as OpenCvLike) : null
}

async function currentCv(): Promise<OpenCvLike | null> {
  if (typeof window === "undefined") return null
  const cv = (window as typeof window & { cv?: unknown }).cv
  if (!cv) return null
  if (typeof (cv as Promise<OpenCvLike>).then === "function") {
    try {
      const resolved = await (cv as Promise<OpenCvLike>)
      return typeof (resolved as Partial<OpenCvLike>).Mat === "function" ? resolved : null
    } catch {
      return null
    }
  }
  return typeof (cv as Partial<OpenCvLike>).Mat === "function" ? (cv as OpenCvLike) : null
}

async function waitForRuntime(timeoutMs = 15000): Promise<OpenCvLike | null> {
  const started = Date.now()
  while (Date.now() - started < timeoutMs) {
    const cv = await currentCv()
    if (cv) return cv
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
  return null
}

export function getOpenCvStatus(): OpenCvStatus {
  return status
}

export function getOpenCvIfReady(): OpenCvLike | null {
  return currentCvSync()
}

export function subscribeOpenCvStatus(listener: (next: OpenCvStatus) => void): () => void {
  listeners.add(listener)
  listener(status)
  return () => {
    listeners.delete(listener)
  }
}

export function startLoadOpenCv(): Promise<OpenCvLike | null> {
  if (typeof window === "undefined") return null

  const ready = currentCvSync()
  if (ready) {
    emit("loaded")
    return Promise.resolve(ready)
  }

  if (loadPromise) return loadPromise

  emit("loading")
  loadPromise = new Promise<OpenCvLike | null>((resolve) => {
    let finished = false
    const finish = (cv: OpenCvLike | null) => {
      if (finished) return
      finished = true
      emit(cv ? "loaded" : "failed")
      resolve(cv)
    }

    try {
      const module = {
        onRuntimeInitialized: () => {
          void waitForRuntime().then(finish).catch(() => finish(null))
        },
      }

      const script = document.createElement("script")
      script.id = "opencv-js-loader"
      script.async = true
      script.src = OPENCV_SRC
      script.onload = () => {
        const cvSync = currentCvSync()
        if (cvSync) {
          finish(cvSync)
        } else {
          void waitForRuntime().then(finish).catch(() => finish(null))
        }
      }
      script.onerror = () => finish(null)

      ;(window as typeof window & { Module?: typeof module }).Module = module
      document.head.appendChild(script)

      // Safety net: if the script hangs without firing onload/onerror
      void waitForRuntime(20000).then(finish).catch(() => finish(null))
    } catch {
      finish(null)
    }
  })

  return loadPromise
}

export async function loadOpenCv(): Promise<OpenCvLike | null> {
  const started = startLoadOpenCv()
  if (!started) return null
  return started
}
