/** Imagen cruda en RGBA, compatible en forma con ImageData. */
export interface RawImage {
  data: Uint8ClampedArray
  width: number
  height: number
}

export interface Point {
  x: number
  y: number
}

/** Cuatro esquinas en orden: arriba-izq, arriba-der, abajo-der, abajo-izq. */
export type Corners = [Point, Point, Point, Point]

export type ScanMode = "document" | "bw" | "original"

export type WorkerRequest =
  | { id: number; op: "detect"; bitmap: ImageBitmap }
  | { id: number; op: "warp"; bitmap: ImageBitmap; corners: Corners; mode: ScanMode }
  | { id: number; op: "restyle"; mode: ScanMode }
  | { id: number; op: "release" }

export type WorkerResponse =
  | { id: number; ok: true; op: "detect"; corners: Corners | null }
  | { id: number; ok: true; op: "warp"; bitmap: ImageBitmap }
  | { id: number; ok: true; op: "restyle"; bitmap: ImageBitmap }
  | { id: number; ok: true; op: "release" }
  | { id: number; ok: false; error: string }
