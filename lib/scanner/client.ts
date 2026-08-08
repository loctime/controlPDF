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
  private usedOnce = false

  private ensureWorker(): Worker {
    if (this.worker) return this.worker
    const worker = new Worker(new URL("./worker.ts", import.meta.url), { type: "module" })
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
    }
    this.worker = worker
    return worker
  }

  private send<T>(req: WithoutId<WorkerRequest>, transfer: Transferable[] = []): Promise<T> {
    const worker = this.ensureWorker()
    const id = this.nextId++
    const timeout = this.usedOnce ? CALL_TIMEOUT_MS : FIRST_CALL_TIMEOUT_MS
    this.usedOnce = true

    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id)
        reject(new Error("El procesamiento tardó demasiado"))
      }, timeout)
      this.pending.set(id, { resolve, reject, timer })
      worker.postMessage({ ...req, id } as WorkerRequest, transfer)
    })
  }

  async detect(bitmap: ImageBitmap): Promise<Corners | null> {
    const res = await this.send<Extract<WorkerResponse, { op: "detect" }>>(
      { op: "detect", bitmap },
      [bitmap],
    )
    return res.corners
  }

  async warp(bitmap: ImageBitmap, corners: Corners, mode: ScanMode): Promise<ImageBitmap> {
    const res = await this.send<Extract<WorkerResponse, { op: "warp" }>>(
      { op: "warp", bitmap, corners, mode },
      [bitmap],
    )
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
    for (const [, entry] of this.pending) clearTimeout(entry.timer)
    this.pending.clear()
  }
}
