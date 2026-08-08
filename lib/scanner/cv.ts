/**
 * Consulta de tipo pura (`typeof import(...)`), sin sentencia de import: no
 * deja rastro en el JS emitido, así que no hace falta ningún truco para que
 * el bundler la ignore.
 */
export type CV = typeof import("@techstark/opencv-js")

export type CvStatus = "idle" | "loading" | "ready" | "failed"

let status: CvStatus = "idle"
let pending: Promise<CV> | null = null

export function cvStatus(): CvStatus {
  return status
}

/**
 * El glue de Emscripten (13 MB) hace que Turbopack se cuelgue si intenta
 * meterlo en el grafo de módulos: alcanza con que el import sea estáticamente
 * resoluble, aunque esté detrás de un chequeo en runtime que nunca se cumpla
 * (el patrón `new Worker(new URL(...))` arrastra todo lo que `worker.ts`
 * importa transitivamente, incluida esta función). Por eso el import va
 * dinámico y marcado `webpackIgnore` -- así Turbopack lo deja pasar sin
 * tocarlo y queda como un import nativo del navegador en tiempo de
 * ejecución, que en Node (vitest) vi.doMock puede seguir interceptando.
 */
async function loadCvInNode(): Promise<CV> {
  const mod = (await import(/* webpackIgnore: true */ "@techstark/opencv-js")) as {
    default: CV
  }
  return mod.default
}

/**
 * Dentro de un worker real se ignora el import de arriba (nunca se ejecuta)
 * y se carga el archivo ya compilado como script suelto, copiado a
 * /public/opencv.js por scripts/copy-opencv.js. Al no ser un import de JS,
 * el bundler ni se entera de que existe.
 */
function isWorkerScope(): boolean {
  return (
    typeof importScripts === "function" &&
    typeof (globalThis as { WorkerGlobalScope?: unknown }).WorkerGlobalScope !== "undefined"
  )
}

function loadCvInWorker(): Promise<CV> {
  ;(self as unknown as { importScripts: (...urls: string[]) => void }).importScripts(
    "/opencv.js",
  )
  return Promise.resolve((self as unknown as { cv: CV | Promise<CV> }).cv)
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
  pending = Promise.resolve(isWorkerScope() ? loadCvInWorker() : loadCvInNode())
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
