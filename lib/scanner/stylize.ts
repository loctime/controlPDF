import { loadCv } from "./cv"
import type { CV } from "./cv"
import type { RawImage, ScanMode } from "./types"

/**
 * Factor de reducción para estimar el fondo. El fondo es información de baja
 * frecuencia por definición, así que estimarlo en escala reducida da el mismo
 * resultado. Medido: 16 ms contra 1660 ms a resolución completa.
 */
const BG_DOWNSCALE = 8

/** Divisor del lado corto para el bloque de adaptiveThreshold. */
const BW_BLOCK_DIVISOR = 20

function odd(n: number, min: number): number {
  let v = Math.round(n)
  if (v % 2 === 0) v++
  return Math.max(min, v)
}

/**
 * Normaliza la iluminación: estima el fondo del papel con un cierre
 * morfológico sobre una copia reducida y divide la imagen por ese fondo.
 * Las sombras y la luz despareja desaparecen; el texto se conserva porque
 * el cierre lo borra del fondo estimado.
 *
 * `rgb` debe ser CV_8UC3. Devuelve un Mat nuevo que el llamador libera.
 */
function normalizeIllumination(cv: CV, rgb: any): any {
  const smallW = Math.max(8, Math.round(rgb.cols / BG_DOWNSCALE))
  const smallH = Math.max(8, Math.round(rgb.rows / BG_DOWNSCALE))

  const small = new cv.Mat()
  const bgSmall = new cv.Mat()
  const bg = new cv.Mat()
  const out = new cv.Mat()
  let kernel: any = null

  try {
    cv.resize(rgb, small, new cv.Size(smallW, smallH), 0, 0, cv.INTER_AREA)

    const k = odd(Math.min(smallW, smallH) / 12, 3)
    kernel = cv.getStructuringElement(cv.MORPH_ELLIPSE, new cv.Size(k, k))
    cv.morphologyEx(small, bgSmall, cv.MORPH_CLOSE, kernel)
    cv.GaussianBlur(bgSmall, bgSmall, new cv.Size(k, k), 0, 0, cv.BORDER_DEFAULT)

    cv.resize(bgSmall, bg, new cv.Size(rgb.cols, rgb.rows), 0, 0, cv.INTER_LINEAR)
    cv.divide(rgb, bg, out, 255, cv.CV_8U)
    return out
  } catch (err) {
    out.delete()
    throw err
  } finally {
    small.delete()
    bgSmall.delete()
    bg.delete()
    kernel?.delete()
  }
}

/** Realza el contraste sobre el canal L de Lab, sin tocar el color. */
function boostContrast(cv: CV, rgb: any): any {
  const lab = new cv.Mat()
  const channels = new cv.MatVector()
  const merged = new cv.Mat()
  const out = new cv.Mat()
  const l = new cv.Mat()
  const rebuilt = new cv.MatVector()
  let clahe: any = null
  // channels.get(i) devuelve un Mat nuevo en cada llamada, independiente del
  // vector: hay que borrarlo aparte de channels.delete(). Mismo patron que
  // contours.get(i) en detect.ts.
  let l0: any = null
  let a0: any = null
  let b0: any = null

  try {
    cv.cvtColor(rgb, lab, cv.COLOR_RGB2Lab)
    cv.split(lab, channels)
    l0 = channels.get(0)
    a0 = channels.get(1)
    b0 = channels.get(2)
    clahe = new cv.CLAHE(2.0, new cv.Size(8, 8))
    clahe.apply(l0, l)
    rebuilt.push_back(l)
    rebuilt.push_back(a0)
    rebuilt.push_back(b0)
    cv.merge(rebuilt, merged)
    cv.cvtColor(merged, out, cv.COLOR_Lab2RGB)
    return out
  } catch (err) {
    out.delete()
    throw err
  } finally {
    lab.delete()
    channels.delete()
    merged.delete()
    l.delete()
    rebuilt.delete()
    clahe?.delete()
    l0?.delete()
    a0?.delete()
    b0?.delete()
  }
}

function toRawImage(cv: CV, rgb: any): RawImage {
  const rgba = new cv.Mat()
  try {
    cv.cvtColor(rgb, rgba, cv.COLOR_RGB2RGBA)
    return {
      data: new Uint8ClampedArray(rgba.data),
      width: rgba.cols,
      height: rgba.rows,
    }
  } finally {
    rgba.delete()
  }
}

/**
 * Aplica un modo de mejora sobre una imagen ya enderezada.
 * - `original`: devuelve la entrada tal cual.
 * - `document`: normaliza iluminación y realza contraste, conservando color.
 * - `bw`: además binariza con bloque proporcional a la resolución.
 */
export async function stylize(img: RawImage, mode: ScanMode): Promise<RawImage> {
  if (mode === "original") {
    return { data: new Uint8ClampedArray(img.data), width: img.width, height: img.height }
  }

  const cv = await loadCv()
  const src = cv.matFromImageData(img)
  const rgb = new cv.Mat()
  let normalized: any = null
  let contrasted: any = null

  try {
    cv.cvtColor(src, rgb, cv.COLOR_RGBA2RGB)
    normalized = normalizeIllumination(cv, rgb)

    if (mode === "bw") {
      const gray = new cv.Mat()
      const bw = new cv.Mat()
      const bwRgb = new cv.Mat()
      try {
        cv.cvtColor(normalized, gray, cv.COLOR_RGB2GRAY)
        const block = odd(Math.min(img.width, img.height) / BW_BLOCK_DIVISOR, 3)
        cv.adaptiveThreshold(
          gray, bw, 255, cv.ADAPTIVE_THRESH_GAUSSIAN_C, cv.THRESH_BINARY, block, 10,
        )
        cv.cvtColor(bw, bwRgb, cv.COLOR_GRAY2RGB)
        return toRawImage(cv, bwRgb)
      } finally {
        gray.delete()
        bw.delete()
        bwRgb.delete()
      }
    }

    contrasted = boostContrast(cv, normalized)
    return toRawImage(cv, contrasted)
  } finally {
    src.delete()
    rgb.delete()
    normalized?.delete()
    contrasted?.delete()
  }
}
