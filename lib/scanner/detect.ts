import { loadCv } from "./cv"
import type { CV } from "./cv"
import type { Corners, Point, RawImage } from "./types"

/** Lado largo al que se reduce la imagen para detectar. Más grande no mejora. */
const DETECT_MAX_SIDE = 1000

/** Un cuadrilátero que ocupa menos que esto de la foto no es el documento. */
const MIN_AREA_RATIO = 0.15

/**
 * Tolerancias que se prueban en orden al aproximar la envolvente convexa a un
 * cuadrilátero. Una sola tolerancia es frágil: sobre fotos reales el número de
 * vértices salta de 9 a 2 entre 0.01 y 0.02 sin pasar por 4.
 */
const APPROX_EPSILONS = [0.01, 0.02, 0.03, 0.04, 0.06, 0.08]

/**
 * Fracción del contorno que la aproximación tiene que conservar para aceptarse.
 *
 * `approxPolyDP` devuelve un polígono *inscripto*: sus vértices son un
 * subconjunto de los del original, así que puede cortar hacia adentro del
 * documento. Cuando el papel llega al borde de la foto, la esquina real no
 * existe en la imagen y una tolerancia gruesa aplana esa zona comiéndose
 * texto. Medido sobre fotos reales: las que recortaban bien conservaban 96%,
 * las que cortaban texto 83% y 86%.
 */
const MIN_HULL_RETENTION = 0.92

/**
 * Ordena cuatro puntos como arriba-izq, arriba-der, abajo-der, abajo-izq.
 *
 * Primero los pone en orden cíclico por ángulo alrededor del centroide, que es
 * estable a cualquier rotación, y después elige por cuál empezar: el borde que
 * arranca la secuencia tiene que ir de izquierda a derecha, estar por encima
 * del centro, y ser el más horizontal de los que cumplen eso.
 *
 * Reemplaza al método de sumas y diferencias de coordenadas (x+y mínima para
 * arriba-izquierda, etc.), que a partir de unos 35 grados de rotación confunde
 * las esquinas y llega a repetirlas, produciendo un enderezado degenerado. Es
 * lo que hacía que una hoja muy torcida saliera acostada o deforme.
 *
 * Límite conocido: pasados los 45 grados la orientación es genuinamente
 * ambigua —no hay forma de saber cuál borde es el de arriba sin entender el
 * contenido— y la página sale alineada al eje más cercano, o sea girada 90
 * grados. Sigue siendo un cuadrilátero válido, y el usuario puede corregirlo
 * desde el editor de esquinas.
 */
export function orderCorners(pts: Point[]): Corners {
  const cx = pts.reduce((s, p) => s + p.x, 0) / pts.length
  const cy = pts.reduce((s, p) => s + p.y, 0) / pts.length

  const cyclic = [...pts].sort(
    (a, b) => Math.atan2(a.y - cy, a.x - cx) - Math.atan2(b.y - cy, b.x - cx),
  )

  let start = 0
  let bestDeviation = Infinity
  for (let i = 0; i < 4; i++) {
    const a = cyclic[i]
    const b = cyclic[(i + 1) % 4]
    if (b.x - a.x <= 0) continue // el borde de arriba va de izquierda a derecha
    if ((a.y + b.y) / 2 >= cy) continue // y está por encima del centro
    const deviation = Math.abs(Math.atan2(b.y - a.y, b.x - a.x))
    if (deviation < bestDeviation) {
      bestDeviation = deviation
      start = i
    }
  }

  return [
    cyclic[start],
    cyclic[(start + 1) % 4],
    cyclic[(start + 2) % 4],
    cyclic[(start + 3) % 4],
  ] as Corners
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
 * Reduce un contorno a cuatro esquinas. Primero saca la envolvente convexa
 * —que elimina las mordidas del contorno: escalones de una pila de hojas,
 * esquinas dobladas, sombras— y después prueba tolerancias crecientes. Si
 * ninguna da exactamente cuatro vértices, cae al rectángulo rotado mínimo,
 * que siempre da cuatro y siempre es convexo.
 *
 * El Mat `contour` es del llamador; acá no se libera.
 */
function quadFromContour(cv: CV, contour: any): Point[] {
  const hull = new cv.Mat()
  try {
    cv.convexHull(contour, hull, false, true)
    const peri = cv.arcLength(hull, true)
    const hullArea = Math.abs(cv.contourArea(hull))

    for (const eps of APPROX_EPSILONS) {
      const approx = new cv.Mat()
      try {
        cv.approxPolyDP(hull, approx, eps * peri, true)
        if (approx.rows !== 4) continue
        // Si la aproximación se comió un pedazo del documento, no sirve:
        // mejor un rectángulo que sobre fondo a un recorte que corte texto.
        if (Math.abs(cv.contourArea(approx)) < MIN_HULL_RETENTION * hullArea) continue
        const pts: Point[] = []
        for (let k = 0; k < 4; k++) {
          pts.push({ x: approx.data32S[k * 2], y: approx.data32S[k * 2 + 1] })
        }
        return pts
      } finally {
        approx.delete()
      }
    }

    const rect = cv.minAreaRect(hull)
    return cv.RotatedRect.points(rect).map((p: { x: number; y: number }) => ({
      x: Math.round(p.x),
      y: Math.round(p.y),
    }))
  } finally {
    hull.delete()
  }
}

/**
 * Devuelve el contorno externo más grande de una imagen binaria, o null si
 * ninguno alcanza el área mínima. El Mat devuelto es propiedad del llamador.
 */
function largestContour(cv: CV, binary: any, minArea: number): any | null {
  const contours = new cv.MatVector()
  const hierarchy = new cv.Mat()
  try {
    cv.findContours(binary, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE)
    let best: any = null
    let bestArea = 0
    for (let i = 0; i < contours.size(); i++) {
      // MatVector.get(i) devuelve un Mat nuevo e independiente en cada llamada:
      // hay que borrarlo aparte del vector. Ver el mismo patrón en stylize.ts.
      const c = contours.get(i)
      const area = Math.abs(cv.contourArea(c))
      if (area > bestArea) {
        best?.delete()
        best = c
        bestArea = area
      } else {
        c.delete()
      }
    }
    if (best && bestArea >= minArea) return best
    best?.delete()
    return null
  } finally {
    contours.delete()
    hierarchy.delete()
  }
}

/**
 * Detección por región: separa el papel del fondo por brillo (Otsu) y toma la
 * mancha más grande.
 *
 * Es el camino principal porque no depende de que el borde del papel forme una
 * cadena cerrada. La detección por bordes se rompe entera cuando el documento
 * toca el margen de la foto o pierde contraste en un tramo: el contorno no
 * cierra, el "afuera" se conecta con el "adentro" y cada bloque de texto pasa a
 * contar como contorno externo. Medido sobre una foto real así: 84 contornos,
 * el mayor de apenas 3,7% del cuadro, contra 52% por región.
 */
function detectByRegion(cv: CV, gray: any, minArea: number): Point[] | null {
  const binary = new cv.Mat()
  let kernel: any = null
  let contour: any = null
  try {
    cv.threshold(gray, binary, 0, 255, cv.THRESH_BINARY + cv.THRESH_OTSU)

    // Otsu siempre parte el histograma, incluso cuando no hay nada que
    // separar: sobre una superficie lisa devuelve el cuadro entero como
    // "papel". Si el reparto es degenerado, la separación no significa nada y
    // conviene dejar que lo intente la detección por bordes.
    const covered = cv.countNonZero(binary) / (binary.rows * binary.cols)
    if (covered > 0.98 || covered < 0.02) return null

    // Cierra el texto interior para que el papel quede como una mancha maciza,
    // y después abre para despegar manchas del fondo unidas por un hilo.
    kernel = cv.getStructuringElement(cv.MORPH_ELLIPSE, new cv.Size(21, 21))
    cv.morphologyEx(binary, binary, cv.MORPH_CLOSE, kernel)
    cv.morphologyEx(binary, binary, cv.MORPH_OPEN, kernel)

    contour = largestContour(cv, binary, minArea)
    return contour ? quadFromContour(cv, contour) : null
  } finally {
    binary.delete()
    kernel?.delete()
    contour?.delete()
  }
}

/**
 * Detección por bordes (Canny). Queda como respaldo para los casos donde el
 * papel no es más claro que el fondo y la separación por brillo no aplica.
 */
function detectByEdges(cv: CV, gray: any, minArea: number): Point[] | null {
  const edges = new cv.Mat()
  let kernel: any = null
  let contour: any = null
  try {
    cv.Canny(gray, edges, 50, 150)
    kernel = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(5, 5))
    cv.morphologyEx(edges, edges, cv.MORPH_CLOSE, kernel)

    contour = largestContour(cv, edges, minArea)
    return contour ? quadFromContour(cv, contour) : null
  } finally {
    edges.delete()
    kernel?.delete()
    contour?.delete()
  }
}

/**
 * Detección con OpenCV: región por brillo (Otsu) y, si no alcanza, bordes.
 *
 * Desde que existe el modelo neuronal esto es el **respaldo**: cubre el caso de
 * que el modelo no cargue (sin conexión, archivos faltantes, navegador sin
 * WASM). En el escenario típico —papel claro sobre mesa oscura— acierta 97%,
 * así que la degradación es suave, no una caída a nada.
 */
export async function detectWithOpenCv(img: RawImage): Promise<Corners | null> {
  const cv = await loadCv()

  let src: any = null
  let small: any = null
  let gray: any = null

  try {
    src = cv.matFromImageData(img)
    small = new cv.Mat()
    gray = new cv.Mat()

    const scale = Math.min(1, DETECT_MAX_SIDE / Math.max(img.width, img.height))
    const w = Math.round(img.width * scale)
    const h = Math.round(img.height * scale)
    cv.resize(src, small, new cv.Size(w, h), 0, 0, cv.INTER_AREA)

    cv.cvtColor(small, gray, cv.COLOR_RGBA2GRAY)
    cv.GaussianBlur(gray, gray, new cv.Size(5, 5), 0, 0, cv.BORDER_DEFAULT)

    const minArea = MIN_AREA_RATIO * w * h
    const found = detectByRegion(cv, gray, minArea) ?? detectByEdges(cv, gray, minArea)
    if (!found) return null

    // Devolver en coordenadas de la imagen original.
    return orderCorners(
      found.map((p) => ({
        x: Math.round(p.x / scale),
        y: Math.round(p.y / scale),
      })),
    )
  } finally {
    src?.delete()
    small?.delete()
    gray?.delete()
  }
}

export interface DetectOptions {
  /**
   * Poner en false para saltear el modelo y probar el respaldo. Existe para que
   * los tests puedan verificar que la red de seguridad funciona de verdad: sin
   * esto, un respaldo roto quedaría escondido detrás del modelo hasta el día
   * que alguien se quede sin conexión.
   */
  useModel?: boolean
}

/**
 * Busca las cuatro esquinas del documento en la foto.
 *
 * Intenta primero con el modelo neuronal, que es mucho más robusto a fondos
 * claros, sombras duras y papel oscuro (medido: pasa del 44-65% al 94-98% en
 * esos casos). Si el modelo no está disponible, cae a la detección con OpenCV.
 *
 * Devuelve null si ninguna de las dos encuentra nada plausible — es un caso
 * esperado, no un error: la UI cae a defaultCorners y el usuario ajusta a mano.
 */
export async function detectCorners(
  img: RawImage,
  options: DetectOptions = {},
): Promise<Corners | null> {
  if (options.useModel !== false) {
    try {
      // Import dinámico a propósito: mantiene el modelo fuera del grafo de los
      // tests en Node, que corren sin ImageData ni WASM del navegador.
      const { detectWithModel } = await import("./detect-ml")
      const fromModel = await detectWithModel(img)
      // Las esquinas del modelo ya vienen etiquetadas: no pasan por
      // orderCorners, que es justo el paso que este camino evita.
      if (fromModel) return fromModel
    } catch (err) {
      // El modelo no cargó. Para el usuario no es un error —sigue teniendo
      // scanner, solo menos preciso— pero callarlo del todo esconde una
      // degradación silenciosa que nadie se entera de diagnosticar.
      console.warn(
        "[scanner] el modelo no está disponible, se usa la detección con OpenCV:",
        err instanceof Error ? err.message : err,
      )
    }
  }

  return detectWithOpenCv(img)
}
