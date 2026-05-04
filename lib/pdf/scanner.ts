import { PDFDocument } from "@cantoo/pdf-lib"

export type ScanMode = "document" | "color" | "bw" | "photo"

export interface Point {
  x: number
  y: number
}

// Tablas precalculadas para Hough (inicializadas al cargar el módulo)
const THETA_N = 180
const _hCos = new Float64Array(THETA_N)
const _hSin = new Float64Array(THETA_N)
for (let i = 0; i < THETA_N; i++) {
  const a = (i * Math.PI) / THETA_N
  _hCos[i] = Math.cos(a)
  _hSin[i] = Math.sin(a)
}

// ─── Utilidades de canvas ────────────────────────────────────────────────────

function cloneCanvas(src: HTMLCanvasElement): HTMLCanvasElement {
  const out = document.createElement("canvas")
  out.width = src.width
  out.height = src.height
  out.getContext("2d")!.drawImage(src, 0, 0)
  return out
}

function imageDataToCanvas(data: ImageData): HTMLCanvasElement {
  const c = document.createElement("canvas")
  c.width = data.width
  c.height = data.height
  c.getContext("2d")!.putImageData(data, 0, 0)
  return c
}

function canvasImageData(canvas: HTMLCanvasElement): ImageData {
  return canvas.getContext("2d")!.getImageData(0, 0, canvas.width, canvas.height)
}

// ─── 1. Grayscale ────────────────────────────────────────────────────────────

function toGrayscale(data: ImageData): void {
  const d = data.data
  for (let i = 0; i < d.length; i += 4) {
    const luma = Math.round(0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2])
    d[i] = d[i + 1] = d[i + 2] = luma
  }
}

// ─── 2. Gaussian blur (convolución separable) ────────────────────────────────

function buildGaussianKernel(radius: number): Float32Array {
  const size = 2 * radius + 1
  const sigma = radius / 3
  const k = new Float32Array(size)
  let sum = 0
  for (let i = 0; i < size; i++) {
    const x = i - radius
    k[i] = Math.exp(-0.5 * (x / sigma) ** 2)
    sum += k[i]
  }
  for (let i = 0; i < size; i++) k[i] /= sum
  return k
}

export function gaussianBlur(canvas: HTMLCanvasElement, radius: number): HTMLCanvasElement {
  const w = canvas.width
  const h = canvas.height
  const src = canvasImageData(canvas)
  const tmp = new Float32Array(w * h * 4)
  const out = new Uint8ClampedArray(w * h * 4)
  const k = buildGaussianKernel(radius)
  const r = radius

  // Horizontal pass
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let rr = 0, gg = 0, bb = 0
      for (let ki = 0; ki < k.length; ki++) {
        const sx = Math.min(Math.max(x + ki - r, 0), w - 1)
        const off = (y * w + sx) * 4
        rr += src.data[off] * k[ki]
        gg += src.data[off + 1] * k[ki]
        bb += src.data[off + 2] * k[ki]
      }
      const off = (y * w + x) * 4
      tmp[off] = rr; tmp[off + 1] = gg; tmp[off + 2] = bb; tmp[off + 3] = 255
    }
  }

  // Vertical pass
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let rr = 0, gg = 0, bb = 0
      for (let ki = 0; ki < k.length; ki++) {
        const sy = Math.min(Math.max(y + ki - r, 0), h - 1)
        const off = (sy * w + x) * 4
        rr += tmp[off] * k[ki]
        gg += tmp[off + 1] * k[ki]
        bb += tmp[off + 2] * k[ki]
      }
      const off = (y * w + x) * 4
      out[off] = rr; out[off + 1] = gg; out[off + 2] = bb; out[off + 3] = 255
    }
  }

  return imageDataToCanvas(new ImageData(out, w, h))
}

// ─── 3. Sobel ────────────────────────────────────────────────────────────────

function sobelGradient(canvas: HTMLCanvasElement): Float32Array {
  const w = canvas.width
  const h = canvas.height
  const src = canvasImageData(canvas).data
  const mag = new Float32Array(w * h)
  let maxMag = 0

  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const px = (y: number, x: number) => src[(y * w + x) * 4]
      const gx =
        -px(y - 1, x - 1) + px(y - 1, x + 1)
        - 2 * px(y, x - 1) + 2 * px(y, x + 1)
        - px(y + 1, x - 1) + px(y + 1, x + 1)
      const gy =
        -px(y - 1, x - 1) - 2 * px(y - 1, x) - px(y - 1, x + 1)
        + px(y + 1, x - 1) + 2 * px(y + 1, x) + px(y + 1, x + 1)
      const m = Math.sqrt(gx * gx + gy * gy)
      mag[y * w + x] = m
      if (m > maxMag) maxMag = m
    }
  }

  if (maxMag > 0) {
    for (let i = 0; i < mag.length; i++) mag[i] = (mag[i] / maxMag) * 255
  }

  return mag
}

// ─── 4. Double threshold + hysteresis ────────────────────────────────────────

function doubleThreshold(mag: Float32Array, low: number, high: number): Uint8Array {
  const edges = new Uint8Array(mag.length)
  for (let i = 0; i < mag.length; i++) {
    if (mag[i] >= high) edges[i] = 255
    else if (mag[i] >= low) edges[i] = 128
  }
  return edges
}

function hysteresis(edges: Uint8Array, w: number, h: number): Uint8Array {
  const out = new Uint8Array(edges)
  const stack: number[] = []

  for (let i = 0; i < out.length; i++) {
    if (out[i] === 255) stack.push(i)
  }

  while (stack.length > 0) {
    const idx = stack.pop()!
    const y = Math.floor(idx / w)
    const x = idx % w
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dy === 0 && dx === 0) continue
        const ny = y + dy, nx = x + dx
        if (ny < 0 || ny >= h || nx < 0 || nx >= w) continue
        const ni = ny * w + nx
        if (out[ni] === 128) {
          out[ni] = 255
          stack.push(ni)
        }
      }
    }
  }

  for (let i = 0; i < out.length; i++) {
    if (out[i] === 128) out[i] = 0
  }

  return out
}

// ─── 5. Detección de esquinas del documento ──────────────────────────────────

function scaleCanvas(canvas: HTMLCanvasElement, targetW: number, targetH: number): HTMLCanvasElement {
  const out = document.createElement("canvas")
  out.width = targetW
  out.height = targetH
  out.getContext("2d")!.drawImage(canvas, 0, 0, targetW, targetH)
  return out
}

function polygonArea(pts: Point[]): number {
  let area = 0
  const n = pts.length
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n
    area += pts[i].x * pts[j].y - pts[j].x * pts[i].y
  }
  return Math.abs(area) / 2
}

function distPtToLine(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const len = Math.sqrt(dx * dx + dy * dy)
  if (len === 0) return Math.sqrt((p.x - a.x) ** 2 + (p.y - a.y) ** 2)
  return Math.abs(dx * (a.y - p.y) - (a.x - p.x) * dy) / len
}

function douglasPeucker(pts: Point[], epsilon: number): Point[] {
  if (pts.length < 3) return pts
  let maxDist = 0
  let maxIdx = 0
  for (let i = 1; i < pts.length - 1; i++) {
    const d = distPtToLine(pts[i], pts[0], pts[pts.length - 1])
    if (d > maxDist) { maxDist = d; maxIdx = i }
  }
  if (maxDist > epsilon) {
    const left = douglasPeucker(pts.slice(0, maxIdx + 1), epsilon)
    const right = douglasPeucker(pts.slice(maxIdx), epsilon)
    return [...left.slice(0, -1), ...right]
  }
  return [pts[0], pts[pts.length - 1]]
}

function sortCorners(pts: Point[]): [Point, Point, Point, Point] {
  const tl = pts.reduce((best, p) => p.x + p.y < best.x + best.y ? p : best)
  const br = pts.reduce((best, p) => p.x + p.y > best.x + best.y ? p : best)
  const tr = pts.reduce((best, p) => p.y - p.x < best.y - best.x ? p : best)
  const bl = pts.reduce((best, p) => p.y - p.x > best.y - best.x ? p : best)
  return [tl, tr, br, bl]
}

// Umbral de Otsu sobre imagen en grayscale
function computeOtsu(data: Uint8ClampedArray, n: number): number {
  const hist = new Float32Array(256)
  for (let i = 0; i < n; i++) hist[data[i * 4]]++
  for (let i = 0; i < 256; i++) hist[i] /= n
  let sum = 0
  for (let i = 0; i < 256; i++) sum += i * hist[i]
  let sumB = 0, wB = 0, maxVar = 0, threshold = 128
  for (let i = 0; i < 256; i++) {
    wB += hist[i]
    if (wB <= 0 || wB >= 1) continue
    const wF = 1 - wB
    sumB += i * hist[i]
    const mB = sumB / wB
    const mF = (sum - sumB) / wF
    const v = wB * wF * (mB - mF) ** 2
    if (v > maxVar) { maxVar = v; threshold = i }
  }
  return threshold
}

// Erosión morfológica (elimina ruido en blob)
function erode(binary: Uint8Array, w: number, h: number, r: number): Uint8Array {
  const out = new Uint8Array(binary.length)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let ok = true
      outer: for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          const ny = y + dy, nx = x + dx
          if (ny < 0 || ny >= h || nx < 0 || nx >= w || !binary[ny * w + nx]) {
            ok = false; break outer
          }
        }
      }
      if (ok) out[y * w + x] = 255
    }
  }
  return out
}

// Dilatación morfológica (conecta fragmentos de borde)
function dilate(binary: Uint8Array, w: number, h: number, r: number): Uint8Array {
  const out = new Uint8Array(binary.length)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      outer: for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          const ny = y + dy, nx = x + dx
          if (ny >= 0 && ny < h && nx >= 0 && nx < w && binary[ny * w + nx]) {
            out[y * w + x] = 255; break outer
          }
        }
      }
    }
  }
  return out
}

// Flood fill: devuelve los puntos del componente conectado más grande
function findLargestComponent(binary: Uint8Array, w: number, h: number): Point[] {
  const visited = new Uint8Array(binary.length)
  let best: Point[] = []
  for (let i = 0; i < binary.length; i++) {
    if (!binary[i] || visited[i]) continue
    const pts: Point[] = []
    const stack = [i]
    visited[i] = 1
    while (stack.length > 0) {
      const idx = stack.pop()!
      const y = Math.floor(idx / w)
      const x = idx % w
      pts.push({ x, y })
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dy === 0 && dx === 0) continue
          const ny = y + dy, nx = x + dx
          if (ny < 0 || ny >= h || nx < 0 || nx >= w) continue
          const ni = ny * w + nx
          if (binary[ni] && !visited[ni]) { visited[ni] = 1; stack.push(ni) }
        }
      }
    }
    if (pts.length > best.length) best = pts
  }
  return best
}

// Encuentra las 4 esquinas del hull usando cuadrantes desde el centroide.
// Más estable que sortCorners: cada corner es el punto más alejado del centro
// en su cuadrante, no el extremo absoluto de una coordenada diagonal.
function hullCorners(hull: Point[]): [Point, Point, Point, Point] {
  if (hull.length <= 4) return sortCorners(hull)

  const cx = hull.reduce((s, p) => s + p.x, 0) / hull.length
  const cy = hull.reduce((s, p) => s + p.y, 0) / hull.length

  let tl = hull[0], tr = hull[0], br = hull[0], bl = hull[0]
  let tlD = -1, trD = -1, brD = -1, blD = -1

  for (const p of hull) {
    const d = (p.x - cx) ** 2 + (p.y - cy) ** 2
    if (p.x < cx  && p.y < cy  && d > tlD) { tl = p; tlD = d }
    if (p.x >= cx && p.y < cy  && d > trD) { tr = p; trD = d }
    if (p.x >= cx && p.y >= cy && d > brD) { br = p; brD = d }
    if (p.x < cx  && p.y >= cy && d > blD) { bl = p; blD = d }
  }

  if (tlD < 0 || trD < 0 || brD < 0 || blD < 0) return sortCorners(hull)
  return [tl, tr, br, bl]
}

function findQuadFromPoints(pts: Point[], minArea: number): [Point, Point, Point, Point] | null {
  if (pts.length < 20) return null

  const MAX_PTS = 1500
  const sampled = pts.length > MAX_PTS
    ? pts.filter((_, i) => i % Math.ceil(pts.length / MAX_PTS) === 0)
    : pts

  const hull = convexHull(sampled)
  if (hull.length < 4) return null

  const area = polygonArea(hull)
  if (area < minArea) return null

  return hullCorners(hull)
}

// Convex hull (Graham scan) para obtener el polígono exterior
function convexHull(pts: Point[]): Point[] {
  if (pts.length < 3) return pts
  const sorted = [...pts].sort((a, b) => a.x !== b.x ? a.x - b.x : a.y - b.y)
  const cross = (o: Point, a: Point, b: Point) =>
    (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x)

  const lower: Point[] = []
  for (const p of sorted) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0)
      lower.pop()
    lower.push(p)
  }
  const upper: Point[] = []
  for (let i = sorted.length - 1; i >= 0; i--) {
    const p = sorted[i]
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0)
      upper.pop()
    upper.push(p)
  }
  upper.pop(); lower.pop()
  return [...lower, ...upper]
}

// ─── 5b. Hough Line Transform ────────────────────────────────────────────────

interface HoughLine { ti: number; ri: number; votes: number }

function houghAccumulate(
  edges: Uint8Array,
  w: number,
  h: number,
): { acc: Int32Array; rhoN: number; offset: number } {
  const diag = Math.ceil(Math.sqrt(w * w + h * h))
  const offset = diag
  const rhoN = 2 * diag + 1
  const acc = new Int32Array(THETA_N * rhoN)

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!edges[y * w + x]) continue
      for (let t = 0; t < THETA_N; t++) {
        const rho = Math.round(x * _hCos[t] + y * _hSin[t]) + offset
        if (rho >= 0 && rho < rhoN) acc[t * rhoN + rho]++
      }
    }
  }
  return { acc, rhoN, offset }
}

function houghPeaks(
  acc: Int32Array,
  rhoN: number,
  maxN: number,
  minVotes: number,
): HoughLine[] {
  const work = new Int32Array(acc)
  const peaks: HoughLine[] = []
  const suppT = 10, suppR = 15

  for (let n = 0; n < maxN; n++) {
    let best = 0, bestIdx = 0
    for (let i = 0; i < work.length; i++) {
      if (work[i] > best) { best = work[i]; bestIdx = i }
    }
    if (best < minVotes) break

    const ti = Math.floor(bestIdx / rhoN)
    const ri = bestIdx % rhoN
    peaks.push({ ti, ri, votes: best })

    // Suprimir vecindad para no detectar la misma línea dos veces
    for (let dt = -suppT; dt <= suppT; dt++) {
      const nt = (ti + dt + THETA_N) % THETA_N
      for (let dr = -suppR; dr <= suppR; dr++) {
        const nr = ri + dr
        if (nr >= 0 && nr < rhoN) work[nt * rhoN + nr] = 0
      }
    }
  }
  return peaks
}

function intersectHoughLines(
  l1: HoughLine,
  l2: HoughLine,
  offset: number,
): Point | null {
  const rho1 = l1.ri - offset, rho2 = l2.ri - offset
  const c1 = _hCos[l1.ti], s1 = _hSin[l1.ti]
  const c2 = _hCos[l2.ti], s2 = _hSin[l2.ti]
  const det = c1 * s2 - s1 * c2
  if (Math.abs(det) < 0.05) return null  // líneas casi paralelas
  return {
    x: (rho1 * s2 - rho2 * s1) / det,
    y: (rho2 * c1 - rho1 * c2) / det,
  }
}

// Elige el par más separado de un grupo de líneas Hough (los dos lados opuestos)
function pickLinePair(
  group: HoughLine[],
  minRhoSep: number,
): [HoughLine, HoughLine] | null {
  if (group.length < 2) return null
  const sorted = [...group].sort((a, b) => b.votes - a.votes)
  const first = sorted[0]
  for (let i = 1; i < sorted.length; i++) {
    const dRho = Math.abs(sorted[i].ri - first.ri)
    // tolerancia θ: ±25 pasos (~25°) — los dos lados del documento son casi paralelos
    const dT = Math.min(
      Math.abs(sorted[i].ti - first.ti),
      THETA_N - Math.abs(sorted[i].ti - first.ti),
    )
    if (dRho >= minRhoSep && dT <= 25) return [first, sorted[i]]
  }
  return null
}

// Detección principal via Hough: encuentra las 4 rectas del documento y las intersecta
function detectByHough(edges: Uint8Array, w: number, h: number): Point[] | null {
  let edgeCount = 0
  for (let i = 0; i < edges.length; i++) if (edges[i]) edgeCount++
  if (edgeCount < 80) return null

  const { acc, rhoN, offset } = houghAccumulate(edges, w, h)
  const minVotes = Math.max(40, Math.floor(edgeCount * 0.05))
  const peaks = houghPeaks(acc, rhoN, 30, minVotes)
  if (peaks.length < 4) return null

  // θ ∈ [45°,135°) → normal vertical → línea horizontal en la imagen (bordes top/bottom)
  // θ fuera de ese rango → normal horizontal → línea vertical (bordes left/right)
  const hGroup: HoughLine[] = []
  const vGroup: HoughLine[] = []
  for (const p of peaks) {
    const tDeg = (p.ti * 180) / THETA_N
    if (tDeg >= 45 && tDeg < 135) hGroup.push(p)
    else vGroup.push(p)
  }

  if (hGroup.length < 2 || vGroup.length < 2) return null

  const hPair = pickLinePair(hGroup, h * 0.15)
  const vPair = pickLinePair(vGroup, w * 0.15)
  if (!hPair || !vPair) return null

  // 4 esquinas = intersección de cada línea horizontal con cada vertical
  const corners: Point[] = []
  for (const hl of hPair) {
    for (const vl of vPair) {
      const pt = intersectHoughLines(hl, vl, offset)
      if (!pt) return null
      corners.push(pt)
    }
  }

  const quad = sortCorners(corners)
  if (polygonArea(quad) < w * h * 0.12) return null

  // Permitir corners ligeramente fuera del frame (documento que sobresale)
  const margin = Math.max(w, h) * 0.35
  if (quad.some(p =>
    p.x < -margin || p.x > w + margin ||
    p.y < -margin || p.y > h + margin
  )) return null

  return quad
}

export function detectDocumentCorners(
  canvas: HTMLCanvasElement,
): Point[] | null {
  const DETECT_W = 400
  const DETECT_H = 300
  const TOTAL = DETECT_W * DETECT_H
  const scaleX = canvas.width / DETECT_W
  const scaleY = canvas.height / DETECT_H

  const small = scaleCanvas(canvas, DETECT_W, DETECT_H)
  const gray = cloneCanvas(small)
  const gd = canvasImageData(gray)
  toGrayscale(gd)
  gray.getContext("2d")!.putImageData(gd, 0, 0)

  // ── Método 1: Hough Line Transform ───────────────────────────────────────
  // Blur suave para bordes limpios, threshold ~50/255 para capturar contornos fuertes
  const blurH = gaussianBlur(gray, 2)
  const magH = sobelGradient(blurH)
  const edgesH = new Uint8Array(TOTAL)
  for (let i = 0; i < TOTAL; i++) if (magH[i] > 70) edgesH[i] = 1

  const houghResult = detectByHough(edgesH, DETECT_W, DETECT_H)
  if (houghResult) {
    return houghResult.map(p => ({ x: p.x * scaleX, y: p.y * scaleY }))
  }

  // ── Método 2: blob brillante (fallback) ──────────────────────────────────
  const minArea = 0.07 * TOTAL
  const blurB = gaussianBlur(gray, 5)
  const blurData = canvasImageData(blurB)
  const otsuT = computeOtsu(blurData.data, TOTAL)
  const binary = new Uint8Array(TOTAL)
  for (let i = 0; i < blurData.data.length; i += 4) {
    if (blurData.data[i] > otsuT) binary[i >> 2] = 255
  }
  const eroded = erode(binary, DETECT_W, DETECT_H, 2)
  const brightPts = findLargestComponent(eroded, DETECT_W, DETECT_H)

  if (brightPts.length >= minArea && brightPts.length < 0.85 * TOTAL) {
    const quad = findQuadFromPoints(brightPts, minArea)
    if (quad) return quad.map(p => ({ x: p.x * scaleX, y: p.y * scaleY }))
  }

  return null
}

// Esquinas por defecto (todo el frame con margen)
export function defaultCorners(w: number, h: number): [Point, Point, Point, Point] {
  const m = Math.min(w, h) * 0.05
  return [
    { x: m,     y: m },
    { x: w - m, y: m },
    { x: w - m, y: h - m },
    { x: m,     y: h - m },
  ]
}

// ─── 6. Corrección de perspectiva (Homografía) ───────────────────────────────

function gaussianElimination(A: number[][], b: number[]): number[] {
  const n = b.length
  const M = A.map((row, i) => [...row, b[i]])

  for (let col = 0; col < n; col++) {
    // Pivoteo parcial
    let maxRow = col
    for (let row = col + 1; row < n; row++) {
      if (Math.abs(M[row][col]) > Math.abs(M[maxRow][col])) maxRow = row
    }
    ;[M[col], M[maxRow]] = [M[maxRow], M[col]]

    const pivot = M[col][col]
    if (Math.abs(pivot) < 1e-10) continue

    for (let row = col + 1; row < n; row++) {
      const factor = M[row][col] / pivot
      for (let c = col; c <= n; c++) {
        M[row][c] -= factor * M[col][c]
      }
    }
  }

  const x = new Array(n).fill(0)
  for (let i = n - 1; i >= 0; i--) {
    x[i] = M[i][n]
    for (let j = i + 1; j < n; j++) x[i] -= M[i][j] * x[j]
    x[i] /= M[i][i]
  }
  return x
}

function computeHomography(src: Point[], dst: Point[]): number[] {
  // Construye sistema DLT 8x8 → h (8 parámetros, h[8]=1)
  const A: number[][] = []
  const b: number[] = []

  for (let i = 0; i < 4; i++) {
    const { x: sx, y: sy } = src[i]
    const { x: dx, y: dy } = dst[i]
    A.push([-sx, -sy, -1, 0, 0, 0, dx * sx, dx * sy])
    b.push(-dx)
    A.push([0, 0, 0, -sx, -sy, -1, dy * sx, dy * sy])
    b.push(-dy)
  }

  const h = gaussianElimination(A, b)
  return [...h, 1]
}

function invertMatrix3x3(m: number[]): number[] {
  const [a, b, c, d, e, f, g, h, k] = m
  const det = a * (e * k - f * h) - b * (d * k - f * g) + c * (d * h - e * g)
  if (Math.abs(det) < 1e-10) return m
  const inv = [
    (e * k - f * h) / det, (c * h - b * k) / det, (b * f - c * e) / det,
    (f * g - d * k) / det, (a * k - c * g) / det, (c * d - a * f) / det,
    (d * h - e * g) / det, (b * g - a * h) / det, (a * e - b * d) / det,
  ]
  return inv
}

function matMulVec3(m: number[], v: [number, number, number]): [number, number, number] {
  return [
    m[0] * v[0] + m[1] * v[1] + m[2] * v[2],
    m[3] * v[0] + m[4] * v[1] + m[5] * v[2],
    m[6] * v[0] + m[7] * v[1] + m[8] * v[2],
  ]
}

function bilinearSample(data: Uint8ClampedArray, w: number, h: number, x: number, y: number): [number, number, number] {
  const x0 = Math.floor(x), y0 = Math.floor(y)
  const x1 = Math.min(x0 + 1, w - 1), y1 = Math.min(y0 + 1, h - 1)
  const fx = x - x0, fy = y - y0
  const px0y0 = (y0 * w + Math.max(x0, 0)) * 4
  const px1y0 = (y0 * w + x1) * 4
  const px0y1 = (y1 * w + Math.max(x0, 0)) * 4
  const px1y1 = (y1 * w + x1) * 4

  const interp = (c: number) =>
    (1 - fx) * (1 - fy) * data[px0y0 + c] +
    fx * (1 - fy) * data[px1y0 + c] +
    (1 - fx) * fy * data[px0y1 + c] +
    fx * fy * data[px1y1 + c]

  return [interp(0), interp(1), interp(2)]
}

export function applyPerspectiveTransform(
  src: HTMLCanvasElement,
  corners: Point[],
): HTMLCanvasElement {
  const [tl, tr, br, bl] = corners

  const topW = Math.sqrt((tr.x - tl.x) ** 2 + (tr.y - tl.y) ** 2)
  const botW = Math.sqrt((br.x - bl.x) ** 2 + (br.y - bl.y) ** 2)
  const leftH = Math.sqrt((bl.x - tl.x) ** 2 + (bl.y - tl.y) ** 2)
  const rightH = Math.sqrt((br.x - tr.x) ** 2 + (br.y - tr.y) ** 2)
  const outW = Math.round((topW + botW) / 2)
  const outH = Math.round((leftH + rightH) / 2)

  const dstPts: Point[] = [
    { x: 0,    y: 0 },
    { x: outW, y: 0 },
    { x: outW, y: outH },
    { x: 0,    y: outH },
  ]

  const H = computeHomography(dstPts, corners)
  const srcData = src.getContext("2d")!.getImageData(0, 0, src.width, src.height)
  const outCanvas = document.createElement("canvas")
  outCanvas.width = outW
  outCanvas.height = outH
  const outData = new Uint8ClampedArray(outW * outH * 4)

  for (let dy = 0; dy < outH; dy++) {
    for (let dx = 0; dx < outW; dx++) {
      const [sx_h, sy_h, sw] = matMulVec3(H, [dx, dy, 1])
      const sx = sx_h / sw
      const sy = sy_h / sw

      if (sx < 0 || sx >= src.width || sy < 0 || sy >= src.height) continue

      const [r, g, b] = bilinearSample(srcData.data, src.width, src.height, sx, sy)
      const i = (dy * outW + dx) * 4
      outData[i] = r; outData[i + 1] = g; outData[i + 2] = b; outData[i + 3] = 255
    }
  }

  outCanvas.getContext("2d")!.putImageData(new ImageData(outData, outW, outH), 0, 0)
  return outCanvas
}

// ─── 7. Mejora de imagen ─────────────────────────────────────────────────────

function shadowRemoval(canvas: HTMLCanvasElement): HTMLCanvasElement {
  const blurred = gaussianBlur(canvas, 21)
  const srcData = canvasImageData(canvas).data
  const blurData = canvasImageData(blurred).data
  const w = canvas.width, h = canvas.height
  const out = new Uint8ClampedArray(w * h * 4)

  // Dividir original / blur (iluminación estimada) → normalizar
  const vals: number[] = []
  for (let i = 0; i < srcData.length; i += 4) {
    const br = blurData[i] || 1
    const v = Math.min(255, (srcData[i] / br) * 200)
    vals.push(v)
  }

  // Normalizar al percentil 95
  const sorted = [...vals].sort((a, b) => a - b)
  const p95 = sorted[Math.floor(sorted.length * 0.95)] || 200
  const scale = 255 / p95

  for (let i = 0, j = 0; i < srcData.length; i += 4, j++) {
    const v = Math.min(255, vals[j] * scale)
    out[i] = out[i + 1] = out[i + 2] = v
    out[i + 3] = 255
  }

  return imageDataToCanvas(new ImageData(out, w, h))
}

function adaptiveThreshold(canvas: HTMLCanvasElement): HTMLCanvasElement {
  const w = canvas.width, h = canvas.height
  const src = canvasImageData(canvas).data
  const out = new Uint8ClampedArray(w * h * 4)
  const R = 7 // half-window 15x15
  const C = 10

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let sum = 0, count = 0
      for (let dy = -R; dy <= R; dy++) {
        for (let dx = -R; dx <= R; dx++) {
          const ny = Math.min(Math.max(y + dy, 0), h - 1)
          const nx = Math.min(Math.max(x + dx, 0), w - 1)
          sum += src[(ny * w + nx) * 4]
          count++
        }
      }
      const mean = sum / count
      const idx = (y * w + x) * 4
      const v = src[idx] > mean - C ? 255 : 0
      out[idx] = out[idx + 1] = out[idx + 2] = v
      out[idx + 3] = 255
    }
  }

  return imageDataToCanvas(new ImageData(out, w, h))
}

function sharpen(canvas: HTMLCanvasElement): HTMLCanvasElement {
  const w = canvas.width, h = canvas.height
  const src = canvasImageData(canvas).data
  const out = new Uint8ClampedArray(w * h * 4)
  // Unsharp mask 3x3
  const kernel = [0, -1, 0, -1, 5, -1, 0, -1, 0]

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let rr = 0, gg = 0, bb = 0
      for (let ky = 0; ky < 3; ky++) {
        for (let kx = 0; kx < 3; kx++) {
          const ny = Math.min(Math.max(y + ky - 1, 0), h - 1)
          const nx = Math.min(Math.max(x + kx - 1, 0), w - 1)
          const kv = kernel[ky * 3 + kx]
          const off = (ny * w + nx) * 4
          rr += src[off] * kv
          gg += src[off + 1] * kv
          bb += src[off + 2] * kv
        }
      }
      const idx = (y * w + x) * 4
      out[idx] = Math.min(255, Math.max(0, rr))
      out[idx + 1] = Math.min(255, Math.max(0, gg))
      out[idx + 2] = Math.min(255, Math.max(0, bb))
      out[idx + 3] = 255
    }
  }

  return imageDataToCanvas(new ImageData(out, w, h))
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255; g /= 255; b /= 255
  const max = Math.max(r, g, b), min = Math.min(r, g, b)
  let h = 0, s = 0
  const l = (max + min) / 2

  if (max !== min) {
    const d = max - min
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break
      case g: h = (b - r) / d + 2; break
      case b: h = (r - g) / d + 4; break
    }
    h /= 6
  }
  return [h, s, l]
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  if (s === 0) {
    const v = Math.round(l * 255)
    return [v, v, v]
  }
  const hue2rgb = (p: number, q: number, t: number) => {
    if (t < 0) t += 1; if (t > 1) t -= 1
    if (t < 1 / 6) return p + (q - p) * 6 * t
    if (t < 1 / 2) return q
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6
    return p
  }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s
  const p = 2 * l - q
  return [
    Math.round(hue2rgb(p, q, h + 1 / 3) * 255),
    Math.round(hue2rgb(p, q, h) * 255),
    Math.round(hue2rgb(p, q, h - 1 / 3) * 255),
  ]
}

function contrastSaturation(canvas: HTMLCanvasElement, contrastFactor: number, satFactor: number): HTMLCanvasElement {
  const w = canvas.width, h = canvas.height
  const src = canvasImageData(canvas).data
  const out = new Uint8ClampedArray(w * h * 4)

  for (let i = 0; i < src.length; i += 4) {
    const [hh, ss, ll] = rgbToHsl(src[i], src[i + 1], src[i + 2])
    const newL = Math.min(1, Math.max(0, ll * contrastFactor - (contrastFactor - 1) / 2))
    const newS = Math.min(1, Math.max(0, ss * satFactor))
    const [r, g, b] = hslToRgb(hh, newS, newL)
    out[i] = r; out[i + 1] = g; out[i + 2] = b; out[i + 3] = 255
  }

  return imageDataToCanvas(new ImageData(out, w, h))
}

export function enhanceDocument(canvas: HTMLCanvasElement, mode: ScanMode): HTMLCanvasElement {
  switch (mode) {
    case "document": {
      const gray = cloneCanvas(canvas)
      const gd = canvasImageData(gray)
      toGrayscale(gd)
      gray.getContext("2d")!.putImageData(gd, 0, 0)
      const noShadow = shadowRemoval(gray)
      const thresholded = adaptiveThreshold(noShadow)
      return sharpen(thresholded)
    }
    case "color": {
      const noShadow = shadowRemoval(canvas)
      return contrastSaturation(noShadow, 1.2, 1.3)
    }
    case "bw": {
      const w = canvas.width, h = canvas.height
      const src = canvasImageData(canvas).data
      const out = new Uint8ClampedArray(w * h * 4)
      for (let i = 0; i < src.length; i += 4) {
        const luma = 0.299 * src[i] + 0.587 * src[i + 1] + 0.114 * src[i + 2]
        const v = luma > 128 ? 255 : 0
        out[i] = out[i + 1] = out[i + 2] = v
        out[i + 3] = 255
      }
      return imageDataToCanvas(new ImageData(out, w, h))
    }
    case "photo": {
      return contrastSaturation(canvas, 1.1, 1.05)
    }
  }
}

// ─── 8. Combinar imágenes en un PDF ─────────────────────────────────────────

export async function combineImagesToSinglePdf(blobs: Blob[], name: string): Promise<File> {
  const doc = await PDFDocument.create()

  for (const blob of blobs) {
    const ab = await blob.arrayBuffer()
    const bytes = new Uint8Array(ab)

    const isPng = bytes[0] === 0x89 && bytes[1] === 0x50
    const image = isPng ? await doc.embedPng(bytes) : await doc.embedJpg(bytes)

    const { width, height } = image.scale(1)
    const page = doc.addPage([width, height])
    page.drawImage(image, { x: 0, y: 0, width, height })
  }

  const pdfBytes = await doc.save()
  const fileName = name.endsWith(".pdf") ? name : `${name}.pdf` 
  return new File([pdfBytes.buffer as ArrayBuffer], fileName, { type: "application/pdf" })
}

// ─── 9. Utilidades de captura ────────────────────────────────────────────────

export function captureVideoFrame(video: HTMLVideoElement): HTMLCanvasElement {
  const canvas = document.createElement("canvas")
  canvas.width = video.videoWidth || video.clientWidth
  canvas.height = video.videoHeight || video.clientHeight
  canvas.getContext("2d")!.drawImage(video, 0, 0)
  return canvas
}

export function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => b ? resolve(b) : reject(new Error("canvas.toBlob falló")),
      type,
      quality,
    )
  })
}

export function canvasToDataUrl(canvas: HTMLCanvasElement, type = "image/jpeg", quality = 0.7): string {
  return canvas.toDataURL(type, quality)
}
