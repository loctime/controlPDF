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

/**
 * Lado del filtro de mediana que despareja el grano del fondo.
 *
 * Antes iba un filtro bilateral: promedia solo entre píxeles de color
 * parecido, así que el papel se dispersaba sin tocar el salto de color contra
 * el texto. La mediana logra lo mismo por otro motivo — un salto grande y
 * angosto como el borde de una letra no mueve la mediana de una ventana de
 * 3×3, la gana el papel que la rodea — y sale más barata: medida en las dos
 * fotos reales de esta conversación, entre 20% y 30% más rápida que el
 * bilateral en el mismo paso, con el texto igual de nítido a ojo en las dos
 * (recorte con zoom, letra chica de una tabla). El bilateral queda descartado
 * y no solo bajado de parámetros: no hay tamaño de ventana bilateral que le
 * gane en velocidad a la mediana con la misma nitidez.
 */
const DENOISE_KERNEL = 3

/**
 * Percentil de la imagen (ya despareja) que se toma como "blanco del papel".
 * 0,85 asume que la mayoría de la página es fondo, cierto incluso en
 * documentos con tablas densas: medido en un recibo de sueldo con la mitad de
 * la hoja cubierta de texto, el percentil 85 sigue cayendo sobre el papel.
 * Con un fondo ya cerca de blanco el estiramiento no hace casi nada (alpha
 * cerca de 1) — a propósito: es una red para fotos con poca luz, no un
 * blanqueo forzado.
 */
const WHITE_PERCENTILE = 0.85

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

/** El casillero de un histograma en el que cae el percentil `p` acumulado. */
function histPercentile(hist: any, total: number, p: number): number {
  const target = total * p
  let acc = 0
  for (let i = 0; i < 256; i++) {
    acc += hist.data32F[i]
    if (acc >= target) return i
  }
  return 255
}

/**
 * Despareja el grano del fondo y empuja el papel hacia blanco puro.
 *
 * El fondo no sale gris por falta de luz — `normalizeIllumination` ya la
 * corrige — sale gris por el grano del sensor de la cámara y del JPEG de
 * origen, que sobrevive porque hasta acá nada lo toca. Medido contra una
 * captura de CamScanner de la misma hoja: el papel vacío daba 243 de media
 * con desvío 10; CamScanner, 254 con desvío 3. Esta función persigue ese
 * número, no lo copia: el filtro bilateral baja el desvío desparejando el
 * papel sin tocar los bordes del texto, y el estiramiento por percentil
 * termina de llevar ese fondo ya parejo a blanco.
 *
 * `rgb` debe ser CV_8UC3. Devuelve un Mat nuevo que el llamador libera.
 */
function denoiseAndLiftWhites(cv: CV, rgb: any): any {
  const denoised = new cv.Mat()
  const gray = new cv.Mat()
  const hist = new cv.Mat()
  const mask = new cv.Mat()
  const grayVec = new cv.MatVector()
  const out = new cv.Mat()

  try {
    cv.medianBlur(rgb, denoised, DENOISE_KERNEL)

    cv.cvtColor(denoised, gray, cv.COLOR_RGB2GRAY)
    grayVec.push_back(gray)
    // Los tipos de @techstark/opencv-js no declaran esta firma de calcHist,
    // aunque compila y corre igual: es la misma que la de OpenCV nativo.
    ;(cv as unknown as { calcHist: (...args: unknown[]) => void }).calcHist(
      grayVec, [0], mask, hist, [256], [0, 256],
    )

    // Cotas de seguridad: por debajo de 150 la foto está demasiado oscura
    // como para que el percentil sea papel y no sombra, y por encima de 253
    // ya no queda margen para estirar sin quemar el blanco.
    const whitePoint = Math.min(
      253, Math.max(150, histPercentile(hist, gray.rows * gray.cols, WHITE_PERCENTILE)),
    )
    denoised.convertTo(out, -1, 255 / whitePoint, 0)
    return out
  } catch (err) {
    out.delete()
    throw err
  } finally {
    denoised.delete()
    gray.delete()
    hist.delete()
    mask.delete()
    grayVec.delete()
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
  let denoised: any = null
  let contrasted: any = null

  try {
    cv.cvtColor(src, rgb, cv.COLOR_RGBA2RGB)
    normalized = normalizeIllumination(cv, rgb)
    // El denoise va siempre antes de lo que sigue, nunca después. CLAHE
    // realza el contraste local, y el grano es justo una variación local que
    // no distingue de una textura real: aplicado después del denoise vuelve a
    // inflar lo que el filtro bilateral recién dispersó, y más de lo que
    // dispersó. Medido con una fixture de ruido realista (papel a 235,
    // amplitud 12, parecido al grano real medido en una foto): denoise antes
    // de CLAHE deja un desvío de 3,1; CLAHE antes de denoise, aunque el
    // denoise corra después, deja 7,7 — peor que no tocar nada (6,9).
    denoised = denoiseAndLiftWhites(cv, normalized)

    if (mode === "bw") {
      const gray = new cv.Mat()
      const bw = new cv.Mat()
      const bwRgb = new cv.Mat()
      try {
        cv.cvtColor(denoised, gray, cv.COLOR_RGB2GRAY)
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

    contrasted = boostContrast(cv, denoised)
    return toRawImage(cv, contrasted)
  } finally {
    src.delete()
    rgb.delete()
    normalized?.delete()
    denoised?.delete()
    contrasted?.delete()
  }
}
