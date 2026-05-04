export type OpenCvLike = {
  Mat: new () => any
  MatVector: new () => any
  Size: new (width: number, height: number) => any
  Point: new (x: number, y: number) => any
  COLOR_RGBA2GRAY: number
  BORDER_DEFAULT: number
  RETR_EXTERNAL: number
  CHAIN_APPROX_SIMPLE: number
  imread: (src: HTMLCanvasElement) => any
  cvtColor: (src: any, dst: any, code: number) => void
  GaussianBlur: (src: any, dst: any, ksize: any, sigmaX: number, sigmaY: number, borderType: number) => void
  Canny: (src: any, edges: any, threshold1: number, threshold2: number) => void
  findContours: (image: any, contours: any, hierarchy: any, mode: number, method: number) => void
  approxPolyDP: (curve: any, approxCurve: any, epsilon: number, closed: boolean) => void
  arcLength: (curve: any, closed: boolean) => number
  contourArea: (curve: any) => number
}

export async function getOpenCv(): Promise<OpenCvLike | null> {
  if (typeof window === "undefined") return null

  const cv = (window as typeof window & { cv?: unknown }).cv
  if (!cv) return null

  if (typeof (cv as Promise<OpenCvLike>).then === "function") {
    try {
      return await (cv as Promise<OpenCvLike>)
    } catch {
      return null
    }
  }

  const ready = cv as Partial<OpenCvLike> & { onRuntimeInitialized?: () => void }
  return typeof ready.Mat === "function" ? (ready as OpenCvLike) : null
}
