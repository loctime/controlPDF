import type { Corners, ScanMode, WorkerRequest, WorkerResponse } from "./types"

/** Techo por operación. La primera incluye la carga de OpenCV (~12 MB). */
const FIRST_CALL_TIMEOUT_MS = 60_000
const CALL_TIMEOUT_MS = 20_000

interface Pending {
  resolve: (value: any) => void
  reject: (reason: Error) => void
  timer: ReturnType<typeof setTimeout>
}

/**
 * Omit sobre una unión colapsa a las propiedades comunes, así que hace falta
 * distribuirlo para no perder `bitmap`, `corners` y `mode`.
 */
type WithoutId<T> = T extends unknown ? Omit<T, "id"> : never

/**
 * Envoltorio del worker del scanner. Una instancia por sesión de escaneo.
 * Traduce mensajes a promesas y aplica timeouts para que un worker colgado
 * no deje la UI esperando para siempre.
 */
export class ScannerClient {
  private worker: Worker | null = null
  private pending = new Map<number, Pending>()
  private nextId = 1
  /**
   * Por worker, no por cliente: si el worker muere y `ensureWorker()` crea
   * uno nuevo, esa próxima llamada es una carga en frío de OpenCV de nuevo
   * (aunque el cliente ya haya hecho llamadas antes) y necesita el timeout
   * largo, no el corto.
   */
  private workerWarmedUp = false

  private ensureWorker(): Worker {
    if (this.worker) return this.worker
    // Clásico, no módulo: es lo único que habilita `importScripts` dentro del
    // worker (plan B para cargar OpenCV sin que el bundler lo toque).
    const worker = new Worker(new URL("./worker.ts", import.meta.url))
    this.workerWarmedUp = false
    worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      const msg = event.data
      const entry = this.pending.get(msg.id)
      if (!entry) return
      this.pending.delete(msg.id)
      clearTimeout(entry.timer)
      if (!msg.ok) entry.reject(new Error(msg.error))
      else entry.resolve(msg)
    }
    worker.onerror = (event) => {
      const error = new Error(event.message || "El worker del scanner falló")
      for (const [, entry] of this.pending) {
        clearTimeout(entry.timer)
        entry.reject(error)
      }
      this.pending.clear()
      this.worker?.terminate()
      this.worker = null
      this.workerWarmedUp = false
    }
    this.worker = worker
    return worker
  }

  private send<T>(req: WithoutId<WorkerRequest>, transfer: Transferable[] = []): Promise<T> {
    const worker = this.ensureWorker()
    const id = this.nextId++
    const timeout = this.workerWarmedUp ? CALL_TIMEOUT_MS : FIRST_CALL_TIMEOUT_MS
    this.workerWarmedUp = true

    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id)
        reject(new Error("El procesamiento tardó demasiado"))
      }, timeout)
      this.pending.set(id, { resolve, reject, timer })
      worker.postMessage({ ...req, id } as WorkerRequest, transfer)
    })
  }

  /**
   * `bitmap` se transfiere al worker (segundo argumento de `postMessage`):
   * queda neutralizado en cuanto esta función retorna, el llamador no puede
   * volver a dibujarlo ni pasarlo a otro lado después.
   */
  async detect(bitmap: ImageBitmap): Promise<Corners | null> {
    const res = await this.send<Extract<WorkerResponse, { op: "detect" }>>(
      { op: "detect", bitmap },
      [bitmap],
    )
    return res.corners
  }

  /** `bitmap` se transfiere al worker igual que en `detect()` — ver ahí. */
  async warp(bitmap: ImageBitmap, corners: Corners, mode: ScanMode): Promise<ImageBitmap> {
    const res = await this.send<Extract<WorkerResponse, { op: "warp" }>>(
      { op: "warp", bitmap, corners, mode },
      [bitmap],
    )
    return res.bitmap
  }

  /** Gira la página 90° en sentido horario y devuelve la vista previa nueva. */
  async rotate(mode: ScanMode): Promise<ImageBitmap> {
    const res = await this.send<Extract<WorkerResponse, { op: "rotate" }>>({
      op: "rotate",
      mode,
    })
    return res.bitmap
  }

  async restyle(mode: ScanMode): Promise<ImageBitmap> {
    const res = await this.send<Extract<WorkerResponse, { op: "restyle" }>>({
      op: "restyle",
      mode,
    })
    return res.bitmap
  }

  release(): void {
    if (this.worker) void this.send({ op: "release" }).catch(() => {})
  }

  terminate(): void {
    this.worker?.terminate()
    this.worker = null
    for (const [, entry] of this.pending) {
      clearTimeout(entry.timer)
      entry.reject(new Error("Scanner terminado"))
    }
    this.pending.clear()
  }
}
