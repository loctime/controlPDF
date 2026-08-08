import cvReady from "@techstark/opencv-js"

export type CV = Awaited<typeof cvReady>

export type CvStatus = "idle" | "loading" | "ready" | "failed"

let status: CvStatus = "idle"
let pending: Promise<CV> | null = null

export function cvStatus(): CvStatus {
  return status
}

/**
 * Carga OpenCV una sola vez. Las llamadas concurrentes comparten la misma
 * promesa. Si falla, la próxima llamada reintenta desde cero.
 */
export function loadCv(): Promise<CV> {
  if (pending) return pending
  status = "loading"
  pending = Promise.resolve(cvReady)
    .then((cv) => {
      status = "ready"
      return cv
    })
    .catch((err) => {
      status = "failed"
      pending = null
      throw err instanceof Error ? err : new Error(String(err))
    })
  return pending
}
