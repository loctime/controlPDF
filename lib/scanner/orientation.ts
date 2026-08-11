import { loadCv } from "./cv"
import type { CV } from "./cv"
import type { RawImage } from "./types"

/**
 * Lado máximo para el análisis. La orientación es una propiedad de la
 * estructura de renglones, que sobrevive de sobra a esta reducción, y medir
 * sobre la imagen completa costaría diez veces más sin cambiar el resultado.
 */
const ANALYSIS_MAX_SIDE = 900

/** Divisor del lado corto para el bloque de adaptiveThreshold. */
const BLOCK_DIVISOR = 20

/**
 * Fracción central de la imagen que se analiza. Deja afuera el borde de la
 * hoja contra el fondo — dos escalones enormes que por sí solos dominan el
 * perfil de un eje entero — los márgenes en blanco y las esquinas vacías que
 * deja la rotación de la búsqueda.
 */
const CENTER_CROP = 0.7

/** Inclinación residual que se explora, en grados, y con qué paso. */
const MAX_SKEW_DEG = 6
const SKEW_STEP_DEG = 1

/**
 * Cuánto tiene que ganar un eje sobre el otro para creerle. Por debajo de esto
 * la imagen no tiene una estructura de renglones clara —una foto, un dibujo,
 * una hoja casi vacía— y cualquier decisión sería una moneda al aire.
 *
 * Medido sobre seis documentos reales en las cuatro rotaciones: el margen del
 * eje ganador va de 3,3 a 29,3, y acertó las veinticuatro veces. El umbral
 * queda bien por debajo del piso observado y bien por encima de 1, el empate.
 */
const MIN_AXIS_MARGIN = 1.5

/**
 * Asimetría mínima para animarse a dar vuelta un documento que ya tiene los
 * renglones horizontales.
 *
 * Medido sobre los mismos seis documentos: derechos dan entre -0,18 y -2,82;
 * cabeza abajo, entre +0,18 y +2,82. El signo acertó las doce veces. El
 * umbral se pone bajo pero no en cero, y más cerca del lado que no queremos
 * cruzar: para dar vuelta un documento derecho por error harían falta 0,23 de
 * corrimiento contra el peor caso observado, y para no corregir uno invertido,
 * 0,13.
 *
 * El caso "ya está bien" es el más frecuente por lejos, así que ante la duda
 * se deja como está. Para decidir hacia qué lado girar uno acostado no hace
 * falta umbral, porque ahí ninguna de las dos opciones es la de menos riesgo.
 */
const MIN_FLIP_SKEW = 0.05

export interface Orientation {
  /** Cuartos de giro horario que hay que aplicar para que quede derecha. */
  turns: 0 | 1 | 2 | 3
  /** Cuánto ganó el eje elegido sobre el otro. 1 = empate. */
  axisMargin: number
  /** Asimetría del perfil elegido. Negativa = derecha, positiva = al revés. */
  skew: number
  /** Evidencia cruda, para poder diagnosticar una decisión sin adivinar. */
  rowScore: number
  colScore: number
}

/**
 * Gira la imagen en múltiplos de 90° en sentido horario. Sin OpenCV: es una
 * permutación de píxeles, no hay interpolación ni pérdida.
 */
export function rotateQuarterTurns(img: RawImage, turns: number): RawImage {
  const t = ((Math.round(turns) % 4) + 4) % 4
  const { width: w, height: h, data: src } = img

  if (t === 0) {
    return { data: new Uint8ClampedArray(src), width: w, height: h }
  }

  const outW = t === 2 ? w : h
  const outH = t === 2 ? h : w
  const out = new Uint8ClampedArray(w * h * 4)

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let nx: number
      let ny: number
      if (t === 1) {
        nx = h - 1 - y
        ny = x
      } else if (t === 2) {
        nx = w - 1 - x
        ny = h - 1 - y
      } else {
        nx = y
        ny = w - 1 - x
      }
      const si = (y * w + x) * 4
      const di = (ny * outW + nx) * 4
      out[di] = src[si]
      out[di + 1] = src[si + 1]
      out[di + 2] = src[si + 2]
      out[di + 3] = src[si + 3]
    }
  }

  return { data: out, width: outW, height: outH }
}

function odd(n: number, min: number): number {
  let v = Math.round(n)
  if (v % 2 === 0) v++
  return Math.max(min, v)
}

/**
 * Cuánta "rayadura" tiene el perfil: media de los saltos al cuadrado entre
 * casilleros vecinos, normalizada por la tinta promedio para que no dependa de
 * qué tan cargado esté el documento.
 *
 * Un perfil de renglones alterna franjas con texto y franjas en blanco, así que
 * salta mucho. El perfil del eje perpendicular atraviesa todos los renglones a
 * la vez y sale casi plano.
 */
function roughness(profile: Float64Array): number {
  const n = profile.length
  if (n < 2) return 0
  let mean = 0
  for (let i = 0; i < n; i++) mean += profile[i]
  mean /= n
  if (mean <= 1e-9) return 0
  let acc = 0
  for (let i = 1; i < n; i++) {
    const d = profile[i] - profile[i - 1]
    acc += d * d
  }
  return acc / (n - 1) / (mean * mean)
}

/**
 * Asimetría (skewness) de los saltos del perfil, que es lo que distingue
 * derecho de cabeza abajo.
 *
 * En el alfabeto latino un renglón no es simétrico: arriba están las
 * mayúsculas y las astas altas (l, t, d) que van entrando de a poco, y abajo
 * la línea de base, donde casi todas las letras terminan juntas y la tinta se
 * corta de golpe. Esa caída brusca contra la subida gradual deja la
 * distribución de saltos corrida hacia lo negativo. Al dar vuelta la hoja el
 * perfil se lee al revés y el signo se invierte.
 */
function derivativeSkew(profile: Float64Array): number {
  const n = profile.length
  if (n < 3) return 0
  let mean = 0
  for (let i = 1; i < n; i++) mean += profile[i] - profile[i - 1]
  mean /= n - 1

  let m2 = 0
  let m3 = 0
  for (let i = 1; i < n; i++) {
    const c = profile[i] - profile[i - 1] - mean
    m2 += c * c
    m3 += c * c * c
  }
  m2 /= n - 1
  m3 /= n - 1
  if (m2 <= 1e-12) return 0
  return m3 / Math.pow(m2, 1.5)
}

/** Tinta promedio por fila y por columna de una máscara binaria. */
function profiles(cv: CV, mask: any): { rows: Float64Array; cols: Float64Array } {
  const rowMat = new cv.Mat()
  const colMat = new cv.Mat()
  // Los tipos de @techstark/opencv-js no declaran las constantes de reduce,
  // aunque el binario las expone (verificado: REDUCE_AVG vale 1). Se leen con
  // un cast acotado antes que escribir el número a mano.
  const REDUCE_AVG = (cv as unknown as { REDUCE_AVG: number }).REDUCE_AVG
  try {
    // dim 1 deja una sola columna: un valor por fila. dim 0 es al revés.
    cv.reduce(mask, rowMat, 1, REDUCE_AVG, cv.CV_32F)
    cv.reduce(mask, colMat, 0, REDUCE_AVG, cv.CV_32F)
    return {
      rows: Float64Array.from(rowMat.data32F),
      cols: Float64Array.from(colMat.data32F),
    }
  } finally {
    rowMat.delete()
    colMat.delete()
  }
}

/**
 * Busca la inclinación que hace más nítida la estructura de renglones y
 * devuelve los perfiles medidos ahí.
 *
 * Hace falta porque el enderezado corrige el contorno de la hoja, no los
 * renglones: queda una inclinación residual de uno o dos grados. Parece poco,
 * pero sobre mil píxeles de ancho un renglón se corre más que el espacio que
 * lo separa del siguiente, así que una misma fila agarra texto de un renglón
 * en un extremo y blanco en el otro. El perfil se borronea y la señal
 * desaparece — medido: sin esta búsqueda, tres de las cuatro fotos del
 * repositorio no distinguían un eje del otro, y una lo distinguía al revés.
 *
 * La rotación se hace con `warpAffine` y no acumulando los píxeles con tinta
 * en casilleros, que sería mucho más barato. La versión barata se probó y se
 * descartó: sin la interpolación que trae la rotación de verdad, el puntaje
 * pasa a medir si el sesgo cae clavado en la grilla de píxeles, salta seis
 * veces entre dos ángulos vecinos, y el mismo documento acostado puntúa
 * cuarenta veces menos que derecho. Acertaba 4 de 16 contra 24 de 24.
 */
function bestProfiles(cv: CV, mask: any): { rows: Float64Array; cols: Float64Array } {
  const w = mask.cols
  const h = mask.rows
  const cropW = Math.max(16, Math.round(w * CENTER_CROP))
  const cropH = Math.max(16, Math.round(h * CENTER_CROP))
  const rect = new cv.Rect(
    Math.round((w - cropW) / 2),
    Math.round((h - cropH) / 2),
    cropW,
    cropH,
  )
  const center = new cv.Point(w / 2, h / 2)

  let best: { rows: Float64Array; cols: Float64Array } | null = null
  let bestScore = -1

  for (let deg = -MAX_SKEW_DEG; deg <= MAX_SKEW_DEG + 1e-9; deg += SKEW_STEP_DEG) {
    let m: any = null
    let rotated: any = null
    let roi: any = null
    try {
      if (Math.abs(deg) < 1e-9) {
        rotated = mask
      } else {
        m = cv.getRotationMatrix2D(center, deg, 1)
        rotated = new cv.Mat()
        cv.warpAffine(
          mask, rotated, m, new cv.Size(w, h),
          cv.INTER_LINEAR, cv.BORDER_CONSTANT, new cv.Scalar(0),
        )
      }
      roi = rotated.roi(rect)
      const p = profiles(cv, roi)
      // El puntaje del ángulo es el del eje que más se destaque: la
      // inclinación correcta afila el perfil de los renglones, corran como
      // corran, y así una sola búsqueda sirve para los dos ejes.
      const score = Math.max(roughness(p.rows), roughness(p.cols))
      if (score > bestScore) {
        bestScore = score
        best = p
      }
    } finally {
      roi?.delete()
      if (rotated !== mask) rotated?.delete()
      m?.delete()
    }
  }

  return best ?? { rows: new Float64Array(), cols: new Float64Array() }
}

/**
 * Deduce cuántos cuartos de giro necesita una página ya enderezada para que el
 * texto quede legible.
 *
 * Es geometría de la tinta, no lectura: no reconoce ni una letra. Por eso el
 * resultado es una apuesta con margen, y ante la duda devuelve 0 — la
 * corrección manual queda siempre a un toque.
 */
export async function detectOrientation(img: RawImage): Promise<Orientation> {
  const cv = await loadCv()

  let src: any = null
  let gray: any = null
  let small: any = null
  let mask: any = null

  try {
    src = cv.matFromImageData(img)
    gray = new cv.Mat()
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY)

    const scale = Math.min(1, ANALYSIS_MAX_SIDE / Math.max(img.width, img.height))
    small = new cv.Mat()
    if (scale < 1) {
      const w = Math.max(16, Math.round(img.width * scale))
      const h = Math.max(16, Math.round(img.height * scale))
      cv.resize(gray, small, new cv.Size(w, h), 0, 0, cv.INTER_AREA)
    } else {
      gray.copyTo(small)
    }

    // Umbral adaptativo invertido: la tinta queda en 255 y la iluminación
    // despareja deja de importar, que es justo lo que necesita un perfil de
    // sumas. Es la misma herramienta que usa el modo blanco y negro.
    mask = new cv.Mat()
    const block = odd(Math.min(small.cols, small.rows) / BLOCK_DIVISOR, 3)
    cv.adaptiveThreshold(
      small, mask, 255, cv.ADAPTIVE_THRESH_GAUSSIAN_C, cv.THRESH_BINARY_INV, block, 10,
    )

    const { rows, cols } = bestProfiles(cv, mask)
    const rowScore = roughness(rows)
    const colScore = roughness(cols)
    const strong = Math.max(rowScore, colScore)
    const weak = Math.min(rowScore, colScore)
    const axisMargin = weak <= 1e-12 ? Infinity : strong / weak

    if (axisMargin < MIN_AXIS_MARGIN) {
      return { turns: 0, axisMargin, skew: 0, rowScore, colScore }
    }

    if (rowScore >= colScore) {
      // Los renglones ya corren horizontales: o está derecha, o está cabeza
      // abajo. Se queda como está salvo que la asimetría sea contundente.
      const skew = derivativeSkew(rows)
      return { turns: skew > MIN_FLIP_SKEW ? 2 : 0, axisMargin, skew, rowScore, colScore }
    }

    // Los renglones corren verticales: está acostada, seguro. Solo falta para
    // qué lado. Girar en horario deja el perfil de columnas leyéndose en el
    // mismo orden en que se leería el de filas ya derecha, así que la
    // asimetría negativa —la firma de un documento derecho— pide giro horario.
    const skew = derivativeSkew(cols)
    return { turns: skew <= 0 ? 1 : 3, axisMargin, skew, rowScore, colScore }
  } finally {
    src?.delete()
    gray?.delete()
    small?.delete()
    mask?.delete()
  }
}
