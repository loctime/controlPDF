import { loadCv } from "./cv"
import type { Corners, Point, RawImage } from "./types"

/** Lado largo al que se reduce la imagen para detectar. Más grande no mejora. */
const DETECT_MAX_SIDE = 1000

/** Un cuadrilátero que ocupa menos que esto de la foto no es el documento. */
const MIN_AREA_RATIO = 0.15

/**
 * Ordena cuatro puntos como arriba-izq, arriba-der, abajo-der, abajo-izq.
 * La suma x+y es mínima en la esquina superior izquierda y máxima en la
 * inferior derecha; la diferencia y-x separa las otras dos.
 */
export function orderCorners(pts: Point[]): Corners {
  const bySum = [...pts].sort((a, b) => a.x + a.y - (b.x + b.y))
  const byDiff = [...pts].sort((a, b) => a.y - a.x - (b.y - b.x))
  return [bySum[0], byDiff[0], bySum[3], byDiff[3]] as Corners
}

/** Rectángulo con 5% de margen. Es el punto de partida cuando la detección falla. */
export function defaultCorners(width: number, height: number): Corners {
  const mx = Math.round(width * 0.05)
  const my = Math.round(height * 0.05)
  return [
    { x: mx, y: my },
    { x: width - mx, y: my },
    { x: width - mx, y: height - my },
    { x: mx, y: height - my },
  ]
}

/**
 * Busca el cuadrilátero convexo más grande de la imagen.
 * Devuelve null si no encuentra ninguno plausible — es un caso esperado,
 * no un error: la UI cae a defaultCorners y el usuario ajusta a mano.
 */
export async function detectCorners(img: RawImage): Promise<Corners | null> {
  const cv = await loadCv()

  const src = cv.matFromImageData(img)
  const small = new cv.Mat()
  const gray = new cv.Mat()
  const edges = new cv.Mat()
  const contours = new cv.MatVector()
  const hierarchy = new cv.Mat()
  let kernel: any = null

  try {
    const scale = Math.min(1, DETECT_MAX_SIDE / Math.max(img.width, img.height))
    const w = Math.round(img.width * scale)
    const h = Math.round(img.height * scale)
    cv.resize(src, small, new cv.Size(w, h), 0, 0, cv.INTER_AREA)

    cv.cvtColor(small, gray, cv.COLOR_RGBA2GRAY)
    cv.GaussianBlur(gray, gray, new cv.Size(5, 5), 0, 0, cv.BORDER_DEFAULT)
    cv.Canny(gray, edges, 50, 150)

    // Cierra huecos en los bordes para que el contorno del papel quede completo.
    kernel = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(5, 5))
    cv.morphologyEx(edges, edges, cv.MORPH_CLOSE, kernel)

    cv.findContours(edges, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE)

    const minArea = MIN_AREA_RATIO * w * h
    let best: Point[] | null = null
    let bestArea = 0

    for (let i = 0; i < contours.size(); i++) {
      const contour = contours.get(i)
      const approx = new cv.Mat()
      try {
        const peri = cv.arcLength(contour, true)
        cv.approxPolyDP(contour, approx, 0.02 * peri, true)
        if (approx.rows !== 4 || !cv.isContourConvex(approx)) continue

        const area = Math.abs(cv.contourArea(approx))
        if (area <= bestArea || area < minArea) continue

        bestArea = area
        best = []
        for (let k = 0; k < 4; k++) {
          best.push({ x: approx.data32S[k * 2], y: approx.data32S[k * 2 + 1] })
        }
      } finally {
        approx.delete()
        contour.delete()
      }
    }

    if (!best) return null

    // Devolver en coordenadas de la imagen original.
    const full = best.map((p) => ({
      x: Math.round(p.x / scale),
      y: Math.round(p.y / scale),
    }))
    return orderCorners(full)
  } finally {
    src.delete()
    small.delete()
    gray.delete()
    edges.delete()
    contours.delete()
    hierarchy.delete()
    kernel?.delete()
  }
}
