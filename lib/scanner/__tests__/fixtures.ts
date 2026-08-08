import type { RawImage, Point, Corners } from "../types"

interface PhotoOptions {
  width?: number
  height?: number
  /** Esquinas del "papel". Por defecto un cuadrilátero en perspectiva. */
  corners?: Corners
  /** Caída de brillo de izquierda a derecha, en niveles (0 = luz pareja). */
  shadeX?: number
  /** Caída de brillo de arriba a abajo, en niveles. */
  shadeY?: number
  /** Si es false, no dibuja el papel (caso negativo). */
  paper?: boolean
  /** Dibuja bloques oscuros simulando texto. */
  text?: boolean
}

function pointInPolygon(px: number, py: number, pts: Point[]): boolean {
  let inside = false
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const xi = pts[i].x, yi = pts[i].y
    const xj = pts[j].x, yj = pts[j].y
    if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) {
      inside = !inside
    }
  }
  return inside
}

/**
 * Genera una "foto" determinista de un documento: papel claro sobre fondo
 * oscuro, con iluminación despareja opcional y bloques de texto.
 */
export function makeDocumentPhoto(opts: PhotoOptions = {}): {
  image: RawImage
  corners: Corners
} {
  const width = opts.width ?? 1200
  const height = opts.height ?? 900
  const corners: Corners =
    opts.corners ??
    ([
      { x: 180, y: 120 },
      { x: 1010, y: 210 },
      { x: 960, y: 790 },
      { x: 240, y: 700 },
    ] as Corners)
  const shadeX = opts.shadeX ?? 0
  const shadeY = opts.shadeY ?? 0
  const drawPaper = opts.paper ?? true
  const drawText = opts.text ?? false

  const data = new Uint8ClampedArray(width * height * 4)
  for (let i = 0; i < width * height; i++) {
    data[i * 4] = 42
    data[i * 4 + 1] = 40
    data[i * 4 + 2] = 48
    data[i * 4 + 3] = 255
  }

  if (drawPaper) {
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (!pointInPolygon(x, y, corners)) continue
        const i = (y * width + x) * 4
        let v = 255 - Math.round(shadeX * (x / width)) - Math.round(shadeY * (y / height))
        if (drawText && x % 140 < 60 && y % 90 < 16) v = 30
        data[i] = v
        data[i + 1] = v
        data[i + 2] = v
      }
    }
  }

  return { image: { data, width, height }, corners }
}

export type { RawImage, Corners }

