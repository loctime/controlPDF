/**
 * Imagen cruda en RGBA, compatible en forma con ImageData.
 *
 * El buffer se declara como `ArrayBuffer` y no como el `ArrayBufferLike` por
 * defecto porque el constructor de `ImageData` rechaza `SharedArrayBuffer`.
 * Dejarlo genérico obliga a castear en cada lugar donde se arma un ImageData.
 */
export interface RawImage {
  data: Uint8ClampedArray<ArrayBuffer>
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
  | { id: number; op: "rotate"; mode: ScanMode }
  | { id: number; op: "release" }

export type WorkerResponse =
  | { id: number; ok: true; op: "detect"; corners: Corners | null }
  | { id: number; ok: true; op: "warp"; bitmap: ImageBitmap }
  | { id: number; ok: true; op: "restyle"; bitmap: ImageBitmap }
  | { id: number; ok: true; op: "rotate"; bitmap: ImageBitmap }
  | { id: number; ok: true; op: "release" }
  | { id: number; ok: false; error: string }
