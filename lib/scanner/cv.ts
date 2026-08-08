import cvReady from "@techstark/opencv-js"

export type CV = Awaited<typeof cvReady>

export type CvStatus = "idle" | "loading" | "ready" | "failed"

let status: CvStatus = "idle"
let pending: Promise<CV> | null = null

export function cvStatus(): CvStatus {
  return status
}

/**
 * Carga OpenCV una sola vez. Las llamadas concurrentes comparten la promesa.
 * Si falla, cvStatus() pasa a "failed" y las llamadas posteriores rechazan
 * con el mismo error, porque el módulo exporta una Promise singleton.
 * El reintento real se logra descartando el worker completo y creando uno nuevo
 * (lo maneja ScannerClient en la Tarea 6).
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
