# Rediseño del Scanner — Plan de Implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reemplazar el módulo de escaneo de ControlPDF por uno que capture con la cámara nativa del celular y procese la foto una sola vez en un Web Worker con OpenCV WASM.

**Architecture:** Cuatro funciones puras sobre un tipo `RawImage` (`{data, width, height}`, compatible con `ImageData`) que no conocen React ni el DOM, envueltas por un Web Worker que hace la conversión desde/hacia `ImageBitmap`. La UI es un modal con máquina de estados que nunca toca OpenCV directamente. Las funciones puras se testean en Node con vitest porque `@techstark/opencv-js` corre en Node sin navegador.

**Tech Stack:** Next.js 16 · React 19 · TypeScript · `@techstark/opencv-js` 5.0.0-release.1 · vitest · jpeg-js (solo tests) · `@cantoo/pdf-lib` (ya presente)

## Global Constraints

- **Node** v22.17.1 · **pnpm** 10.18.3. Usar `pnpm`, nunca `npm`, en este repo.
- **Todo el procesamiento corre en el cliente.** No agregar llamadas de red ni endpoints. La promesa del README ("los archivos no salen de tu computadora") es un requisito, no una aspiración.
- **Todo `cv.Mat` creado debe liberarse con `.delete()`.** OpenCV WASM no tiene GC: una fuga cuelga el celular a la tercera página. Todo bloque que crea Mats usa `try/finally`.
- **Textos de UI en español rioplatense, sin signos de apertura** (`¿` `¡`). Seguir el estilo del código existente.
- **OpenCV solo se importa dentro de `lib/scanner/cv.ts`.** Ningún otro archivo lo importa, ni el hilo principal lo carga jamás.
- **El bundle de OpenCV pesa 12,68 MB sin comprimir** (`dist/opencv.js`). Se carga lazy, únicamente cuando el usuario toca "Escanear".
- Los mensajes de commit terminan con `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.

## Números de referencia medidos

Medidos en esta máquina sobre una imagen sintética de 1200×900 con OpenCV en Node, antes de escribir el plan. Sirven como vara: si la implementación se aleja mucho, algo se hizo distinto.

| Etapa | Tiempo |
|---|---|
| Detección de esquinas (reducida a 1000px) | 66 ms |
| `warpPerspective` a resolución completa | 21 ms |
| Normalización de iluminación (fondo en escala 1/8) | 16 ms |
| Contraste CLAHE | 109 ms |
| **Total por página** | **~210 ms** |

La normalización de iluminación estimando el fondo a resolución completa con un kernel de 49px tarda **1660 ms**. Estimándolo sobre una copia reducida 8× y reescalando el fondo, tarda **16 ms** con resultado idéntico (franja izquierda/derecha: 248,4/250,1 contra 248,3/250,1). **Esto no es una optimización opcional: es la diferencia entre un scanner usable y uno que no lo es.**

---

## Estructura de archivos

**Se crea:**

| Archivo | Responsabilidad |
|---|---|
| `lib/scanner/types.ts` | `RawImage`, `Point`, `Corners`, `ScanMode`, mensajes del worker. Sin lógica. |
| `lib/scanner/cv.ts` | Carga perezosa de OpenCV. Único importador de `@techstark/opencv-js`. |
| `lib/scanner/detect.ts` | `detectCorners(img)` → `Corners | null`. Función pura. |
| `lib/scanner/warp.ts` | `warpToRect(img, corners)` → `RawImage`. Función pura. |
| `lib/scanner/stylize.ts` | `stylize(img, mode)` → `RawImage`. Función pura. |
| `lib/scanner/worker.ts` | Web Worker. Traduce `ImageBitmap` ↔ `RawImage` y cachea el warp. |
| `lib/scanner/client.ts` | Cliente del worker para el hilo principal. Promesas, timeouts, degradación. |
| `lib/scanner/__tests__/fixtures.ts` | Generador de imágenes sintéticas deterministas para tests. |
| `components/editor/scanner/corner-editor.tsx` | Foto + 4 esquinas arrastrables + lupa. Sin lógica de imagen. |
| `components/editor/scanner/mode-toggle.tsx` | Selector de los tres modos. |
| `vitest.config.ts` | Config de tests. |

**Se modifica:** `components/editor/scanner/scan-modal.tsx` (reescritura completa), `package.json`, `next.config.mjs`.

**Se conserva sin tocar:** `components/editor/scanner/scan-page-strip.tsx`, `lib/editor/store.ts`, `components/editor/editor-toolbar.tsx`, `components/editor/pdf-editor.tsx`.

**Se elimina (Tarea 8):** `lib/pdf/scanner.ts`, `lib/pdf/opencv.ts`, `scripts/download-opencv.js`, `public/opencv.js`, `components/scan-camera.tsx`, `components/editor/scanner/scan-camera.tsx`, `components/editor/scanner/scan-corners.tsx`.

### Refinamiento sobre el spec

El spec (sección 4) definía el worker con `warp(bitmap, corners, mode)` más un cache interno para `restyle`. Se separa en dos funciones puras — `warpToRect` y `stylize` — y el cache queda en el worker guardando el resultado de `warpToRect`. Motivo: dos funciones puras se testean sin cache y sin estado; `restyle(id, mode)` pasa a ser `stylize(cacheado, mode)`. Mismo comportamiento externo, mitad de superficie de test.

El spec también decía que las funciones reciben `ImageBitmap`. Reciben `RawImage` (`{data, width, height}`). Motivo: `ImageBitmap` no existe en Node, `RawImage` sí, y así toda la lógica de imagen se testea sin navegador. El worker es quien convierte.

---

## Sobre los fixtures

El spec pide ocho fotos reales. Esas fotos son el criterio de aceptación final (Tarea 9) y las tiene que sacar Diego.

Para no bloquear las tareas 1 a 8, los tests usan **imágenes sintéticas generadas en código**: un cuadrilátero claro sobre fondo oscuro, con gradiente de iluminación y bloques de "texto". Son deterministas, corren siempre, y verifican que el algoritmo hace lo que dice. Las fotos reales verifican que sirve en la vida real. Se necesitan las dos.

---

### Task 1: Dependencias, vitest y fixtures sintéticas

**Files:**
- Modify: `package.json`
- Create: `vitest.config.ts`
- Create: `lib/scanner/__tests__/fixtures.ts`
- Create: `lib/scanner/__tests__/setup.test.ts`

**Interfaces:**
- Consumes: nada (primera tarea)
- Produces: `makeDocumentPhoto(opts)` → `{ image: RawImage, corners: Corners }` y `loadCv()` disponible para el resto de los tests.

- [ ] **Step 1: Instalar dependencias**

```bash
pnpm add @techstark/opencv-js@5.0.0-release.1
pnpm add -D vitest@^3 jpeg-js@^0.4.4
```

- [ ] **Step 2: Agregar los scripts de test a `package.json`**

En la sección `"scripts"`, agregar:

```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 3: Crear `vitest.config.ts`**

OpenCV WASM tarda varios segundos en instanciarse, de ahí el timeout alto.

```ts
import { defineConfig } from "vitest/config"
import path from "node:path"

export default defineConfig({
  test: {
    environment: "node",
    testTimeout: 30_000,
    hookTimeout: 30_000,
    include: ["lib/**/__tests__/**/*.test.ts"],
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "./") },
  },
})
```

- [ ] **Step 4: Escribir el generador de fixtures**

Crear `lib/scanner/__tests__/fixtures.ts`. Los tipos se definen acá provisoriamente porque `lib/scanner/types.ts` todavía no existe; la Tarea 2 los reemplaza por un import.

```ts
export interface RawImage {
  data: Uint8ClampedArray
  width: number
  height: number
}

export interface Point { x: number; y: number }
export type Corners = [Point, Point, Point, Point] // tl, tr, br, bl

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
```

- [ ] **Step 5: Escribir el test de humo**

Crear `lib/scanner/__tests__/setup.test.ts`:

```ts
import { describe, it, expect } from "vitest"
import cvReady from "@techstark/opencv-js"
import { makeDocumentPhoto } from "./fixtures"

describe("infraestructura", () => {
  it("carga OpenCV en Node y expone las funciones que usamos", async () => {
    const cv = await cvReady
    expect(typeof cv.Mat).toBe("function")
    expect(typeof cv.matFromImageData).toBe("function")
    expect(typeof cv.findContours).toBe("function")
    expect(typeof cv.getPerspectiveTransform).toBe("function")
    expect(typeof cv.warpPerspective).toBe("function")
    expect(typeof cv.adaptiveThreshold).toBe("function")
  })

  it("genera una foto sintética con el papel más claro que el fondo", () => {
    const { image, corners } = makeDocumentPhoto()
    expect(image.width).toBe(1200)
    expect(image.height).toBe(900)
    expect(corners).toHaveLength(4)

    const at = (x: number, y: number) => image.data[(y * image.width + x) * 4]
    expect(at(600, 400)).toBeGreaterThan(200) // centro del papel
    expect(at(20, 20)).toBeLessThan(60) // esquina de fondo
  })
})
```

- [ ] **Step 6: Correr los tests y verificar que pasan**

Run: `pnpm test`
Expected: PASS, 2 tests.

- [ ] **Step 7: Commit**

```bash
git add package.json pnpm-lock.yaml vitest.config.ts lib/scanner/__tests__/
git commit -m "$(cat <<'EOF'
test: infraestructura de tests para el scanner

vitest sobre Node, dependencia de OpenCV WASM y generador de fotos
sintéticas deterministas para probar la detección sin navegador.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Tipos y cargador de OpenCV

**Files:**
- Create: `lib/scanner/types.ts`
- Create: `lib/scanner/cv.ts`
- Create: `lib/scanner/__tests__/cv.test.ts`

**Interfaces:**
- Consumes: nada de tareas anteriores
- Produces:
  - `RawImage { data: Uint8ClampedArray; width: number; height: number }`
  - `Point { x: number; y: number }`
  - `Corners = [Point, Point, Point, Point]` (orden: tl, tr, br, bl)
  - `ScanMode = "document" | "bw" | "original"`
  - `loadCv(): Promise<CV>` — memoizada, resuelve el mismo objeto siempre
  - `cvStatus(): "idle" | "loading" | "ready" | "failed"`

- [ ] **Step 1: Escribir el test que falla**

Crear `lib/scanner/__tests__/cv.test.ts`:

```ts
import { describe, it, expect } from "vitest"
import { loadCv, cvStatus } from "../cv"

describe("cargador de OpenCV", () => {
  it("arranca en idle", () => {
    expect(cvStatus()).toBe("idle")
  })

  it("resuelve la misma instancia en llamadas concurrentes", async () => {
    const [a, b] = await Promise.all([loadCv(), loadCv()])
    expect(a).toBe(b)
    expect(typeof a.Mat).toBe("function")
  })

  it("queda en ready después de cargar", async () => {
    await loadCv()
    expect(cvStatus()).toBe("ready")
  })
})
```

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `pnpm test lib/scanner/__tests__/cv.test.ts`
Expected: FAIL — no puede resolver el módulo `../cv`.

- [ ] **Step 3: Escribir `lib/scanner/types.ts`**

```ts
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
  | { id: number; ok: true; op: "warp" | "restyle"; bitmap: ImageBitmap }
  | { id: number; ok: true; op: "release" }
  | { id: number; ok: false; error: string }
```

- [ ] **Step 4: Escribir `lib/scanner/cv.ts`**

```ts
import cvReady from "@techstark/opencv-js"

export type CV = Awaited<typeof cvReady>

export type CvStatus = "idle" | "loading" | "ready" | "failed"

let status: CvStatus = "idle"
let pending: Promise<CV> | null = null

export function cvStatus(): CvStatus {
  return status
}

/**
 * Carga OpenCV una sola vez. Las llamadas concurrentes comparten la misma
 * promesa. Si falla, la próxima llamada reintenta desde cero.
 */
export function loadCv(): Promise<CV> {
  if (pending) return pending
  status = "loading"
  pending = Promise.resolve(cvReady)
    .then((cv) => {
      status = "ready"
      return cv
    })
    .catch((err) => {
      status = "failed"
      pending = null
      throw err instanceof Error ? err : new Error(String(err))
    })
  return pending
}
```

- [ ] **Step 5: Hacer que las fixtures usen los tipos centrales**

En `lib/scanner/__tests__/fixtures.ts`, borrar las definiciones locales de `RawImage`, `Point` y `Corners` y reemplazarlas por un import, para que no queden dos definiciones del mismo tipo:

```ts
import type { RawImage, Point, Corners } from "../types"
```

Agregar `export type { RawImage, Corners }` al final del archivo para que los tests que ya los importaban desde `./fixtures` sigan funcionando.

- [ ] **Step 6: Correr los tests y verificar que pasan**

Run: `pnpm test`
Expected: PASS, 5 tests (2 de la Tarea 1 más 3 nuevos).

- [ ] **Step 7: Commit**

```bash
git add lib/scanner/types.ts lib/scanner/cv.ts lib/scanner/__tests__/
git commit -m "$(cat <<'EOF'
feat: tipos del scanner y cargador perezoso de OpenCV

Único punto del código que importa @techstark/opencv-js. Memoiza la
carga y expone el estado para que la UI pueda degradar si falla.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Detección de esquinas

**Files:**
- Create: `lib/scanner/detect.ts`
- Create: `lib/scanner/__tests__/detect.test.ts`

**Interfaces:**
- Consumes: `RawImage`, `Corners`, `Point` de `lib/scanner/types.ts`; `loadCv` de `lib/scanner/cv.ts`
- Produces:
  - `detectCorners(img: RawImage): Promise<Corners | null>`
  - `defaultCorners(width: number, height: number): Corners` — los cuatro bordes de la imagen, con margen del 5%
  - `orderCorners(pts: Point[]): Corners`

- [ ] **Step 1: Escribir los tests que fallan**

Crear `lib/scanner/__tests__/detect.test.ts`:

```ts
import { describe, it, expect } from "vitest"
import { detectCorners, defaultCorners, orderCorners } from "../detect"
import { makeDocumentPhoto } from "./fixtures"
import type { Corners } from "../types"

const TOL = 0.03 * 1200 // 3% del lado largo = 36px

function closeEnough(got: Corners, want: Corners, tol = TOL) {
  return got.every(
    (p, i) => Math.abs(p.x - want[i].x) <= tol && Math.abs(p.y - want[i].y) <= tol,
  )
}

describe("orderCorners", () => {
  it("ordena cuatro puntos desordenados como tl, tr, br, bl", () => {
    const scrambled = [
      { x: 960, y: 790 }, // br
      { x: 180, y: 120 }, // tl
      { x: 240, y: 700 }, // bl
      { x: 1010, y: 210 }, // tr
    ]
    expect(orderCorners(scrambled)).toEqual([
      { x: 180, y: 120 },
      { x: 1010, y: 210 },
      { x: 960, y: 790 },
      { x: 240, y: 700 },
    ])
  })
})

describe("defaultCorners", () => {
  it("devuelve un rectángulo con margen del 5%", () => {
    expect(defaultCorners(1000, 800)).toEqual([
      { x: 50, y: 40 },
      { x: 950, y: 40 },
      { x: 950, y: 760 },
      { x: 50, y: 760 },
    ])
  })
})

describe("detectCorners", () => {
  it("encuentra un documento en perspectiva dentro del 3%", async () => {
    const { image, corners } = makeDocumentPhoto({ text: true })
    const found = await detectCorners(image)
    expect(found).not.toBeNull()
    expect(closeEnough(found!, corners)).toBe(true)
  })

  it("lo encuentra igual con iluminación despareja", async () => {
    const { image, corners } = makeDocumentPhoto({ shadeX: 90, shadeY: 40, text: true })
    const found = await detectCorners(image)
    expect(found).not.toBeNull()
    expect(closeEnough(found!, corners)).toBe(true)
  })

  it("devuelve null si no hay documento", async () => {
    const { image } = makeDocumentPhoto({ paper: false })
    expect(await detectCorners(image)).toBeNull()
  })

  it("descarta un cuadrilátero demasiado chico", async () => {
    const { image } = makeDocumentPhoto({
      corners: [
        { x: 500, y: 400 },
        { x: 640, y: 400 },
        { x: 640, y: 500 },
        { x: 500, y: 500 },
      ] as Corners,
    })
    expect(await detectCorners(image)).toBeNull()
  })

  it("devuelve las esquinas en orden tl, tr, br, bl", async () => {
    const { image } = makeDocumentPhoto()
    const c = (await detectCorners(image))!
    expect(c[0].x).toBeLessThan(c[1].x) // tl a la izquierda de tr
    expect(c[0].y).toBeLessThan(c[3].y) // tl arriba de bl
  })
})
```

- [ ] **Step 2: Correr los tests para verificar que fallan**

Run: `pnpm test lib/scanner/__tests__/detect.test.ts`
Expected: FAIL — no puede resolver `../detect`.

- [ ] **Step 3: Escribir `lib/scanner/detect.ts`**

Los valores de Canny (50/150), el epsilon de `approxPolyDP` (2% del perímetro) y el umbral de área (15%) están validados contra las fixtures sintéticas.

```ts
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
```

- [ ] **Step 4: Correr los tests y verificar que pasan**

Run: `pnpm test lib/scanner/__tests__/detect.test.ts`
Expected: PASS, 7 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/scanner/detect.ts lib/scanner/__tests__/detect.test.ts
git commit -m "$(cat <<'EOF'
feat: detección de esquinas del documento

Canny más findContours sobre una copia reducida a 1000px, quedándose
con el mayor cuadrilátero convexo. Devuelve null cuando no encuentra
nada plausible: la UI cae a las esquinas por defecto.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Enderezado en perspectiva

**Files:**
- Create: `lib/scanner/warp.ts`
- Create: `lib/scanner/__tests__/warp.test.ts`

**Interfaces:**
- Consumes: `RawImage`, `Corners` de `types.ts`; `loadCv` de `cv.ts`
- Produces: `warpToRect(img: RawImage, corners: Corners): Promise<RawImage>`

- [ ] **Step 1: Escribir los tests que fallan**

Crear `lib/scanner/__tests__/warp.test.ts`:

```ts
import { describe, it, expect } from "vitest"
import { warpToRect } from "../warp"
import { makeDocumentPhoto } from "./fixtures"

describe("warpToRect", () => {
  it("produce una imagen con las dimensiones del documento, no de la foto", async () => {
    const { image, corners } = makeDocumentPhoto()
    const out = await warpToRect(image, corners)
    // Lados del cuadrilátero por defecto: ~835 x ~583
    expect(out.width).toBeGreaterThan(800)
    expect(out.width).toBeLessThan(870)
    expect(out.height).toBeGreaterThan(550)
    expect(out.height).toBeLessThan(620)
  })

  it("elimina el fondo oscuro: casi todo el resultado es papel claro", async () => {
    const { image, corners } = makeDocumentPhoto()
    const out = await warpToRect(image, corners)
    let dark = 0
    for (let i = 0; i < out.data.length; i += 4) {
      if (out.data[i] < 100) dark++
    }
    const ratio = dark / (out.width * out.height)
    expect(ratio).toBeLessThan(0.02)
  })

  it("topea el lado largo a 3000px para no reventar la memoria", async () => {
    const { image, corners } = makeDocumentPhoto({
      width: 8000,
      height: 6000,
      corners: [
        { x: 100, y: 100 },
        { x: 7900, y: 100 },
        { x: 7900, y: 5900 },
        { x: 100, y: 5900 },
      ],
    })
    const out = await warpToRect(image, corners)
    expect(Math.max(out.width, out.height)).toBeLessThanOrEqual(3000)
  })

  it("devuelve RGBA opaco", async () => {
    const { image, corners } = makeDocumentPhoto()
    const out = await warpToRect(image, corners)
    expect(out.data.length).toBe(out.width * out.height * 4)
    expect(out.data[3]).toBe(255)
  })
})
```

- [ ] **Step 2: Correr los tests para verificar que fallan**

Run: `pnpm test lib/scanner/__tests__/warp.test.ts`
Expected: FAIL — no puede resolver `../warp`.

- [ ] **Step 3: Escribir `lib/scanner/warp.ts`**

```ts
import { loadCv } from "./cv"
import type { Corners, RawImage } from "./types"

/** Tope del lado largo del resultado. Protege la memoria de celulares. */
const MAX_OUTPUT_SIDE = 3000

const dist = (a: { x: number; y: number }, b: { x: number; y: number }) =>
  Math.hypot(a.x - b.x, a.y - b.y)

/**
 * Endereza el cuadrilátero a un rectángulo. El tamaño de salida sale de los
 * lados del cuadrilátero, así que conserva la resolución real del documento.
 */
export async function warpToRect(img: RawImage, corners: Corners): Promise<RawImage> {
  const cv = await loadCv()
  const [tl, tr, br, bl] = corners

  let outW = Math.round(Math.max(dist(tl, tr), dist(bl, br)))
  let outH = Math.round(Math.max(dist(tl, bl), dist(tr, br)))
  outW = Math.max(1, outW)
  outH = Math.max(1, outH)

  const over = Math.max(outW, outH) / MAX_OUTPUT_SIDE
  if (over > 1) {
    outW = Math.max(1, Math.round(outW / over))
    outH = Math.max(1, Math.round(outH / over))
  }

  const src = cv.matFromImageData(img)
  const srcTri = cv.matFromArray(4, 1, cv.CV_32FC2, [
    tl.x, tl.y, tr.x, tr.y, br.x, br.y, bl.x, bl.y,
  ])
  const dstTri = cv.matFromArray(4, 1, cv.CV_32FC2, [
    0, 0, outW, 0, outW, outH, 0, outH,
  ])
  const M = cv.getPerspectiveTransform(srcTri, dstTri)
  const dst = new cv.Mat()

  try {
    cv.warpPerspective(
      src,
      dst,
      M,
      new cv.Size(outW, outH),
      cv.INTER_LINEAR,
      cv.BORDER_CONSTANT,
      new cv.Scalar(255, 255, 255, 255),
    )
    return {
      data: new Uint8ClampedArray(dst.data),
      width: dst.cols,
      height: dst.rows,
    }
  } finally {
    src.delete()
    srcTri.delete()
    dstTri.delete()
    M.delete()
    dst.delete()
  }
}
```

- [ ] **Step 4: Correr los tests y verificar que pasan**

Run: `pnpm test lib/scanner/__tests__/warp.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/scanner/warp.ts lib/scanner/__tests__/warp.test.ts
git commit -m "$(cat <<'EOF'
feat: enderezado en perspectiva del documento

getPerspectiveTransform más warpPerspective, con el tamaño de salida
derivado de los lados del cuadrilátero y topeado a 3000px.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: Modos de mejora

**Files:**
- Create: `lib/scanner/stylize.ts`
- Create: `lib/scanner/__tests__/stylize.test.ts`

**Interfaces:**
- Consumes: `RawImage`, `ScanMode` de `types.ts`; `loadCv` de `cv.ts`
- Produces: `stylize(img: RawImage, mode: ScanMode): Promise<RawImage>`

**Nota crítica de rendimiento:** el fondo se estima sobre una copia reducida 8×. Estimarlo a resolución completa da el mismo resultado y tarda cien veces más (1660 ms contra 16 ms, medido). No cambiar `BG_DOWNSCALE` sin volver a medir.

- [ ] **Step 1: Escribir los tests que fallan**

Crear `lib/scanner/__tests__/stylize.test.ts`:

```ts
import { describe, it, expect } from "vitest"
import { stylize } from "../stylize"
import { warpToRect } from "../warp"
import { makeDocumentPhoto } from "./fixtures"
import type { RawImage } from "../types"

/** Brillo medio del canal rojo en una franja vertical. */
function stripMean(img: RawImage, x0: number, x1: number): number {
  let sum = 0
  let n = 0
  for (let y = 0; y < img.height; y++) {
    for (let x = x0; x < x1; x++) {
      sum += img.data[(y * img.width + x) * 4]
      n++
    }
  }
  return sum / n
}

async function shadedDocument(): Promise<RawImage> {
  const { image, corners } = makeDocumentPhoto({ shadeX: 90, shadeY: 40, text: true })
  return warpToRect(image, corners)
}

describe("stylize", () => {
  it("modo original no cambia los píxeles", async () => {
    const doc = await shadedDocument()
    const out = await stylize(doc, "original")
    expect(out.width).toBe(doc.width)
    expect(out.height).toBe(doc.height)
    expect(out.data[0]).toBe(doc.data[0])
  })

  it("modo document empareja la iluminación de lado a lado", async () => {
    const doc = await shadedDocument()
    const before = Math.abs(stripMean(doc, 0, 80) - stripMean(doc, doc.width - 80, doc.width))
    const out = await stylize(doc, "document")
    const after = Math.abs(stripMean(out, 0, 80) - stripMean(out, out.width - 80, out.width))

    expect(before).toBeGreaterThan(30) // la fixture está claramente despareja
    expect(after).toBeLessThan(8) // y queda pareja
  })

  it("modo document deja el papel casi blanco", async () => {
    const out = await stylize(await shadedDocument(), "document")
    expect(stripMean(out, 0, 80)).toBeGreaterThan(235)
  })

  it("modo document conserva el texto oscuro", async () => {
    const out = await stylize(await shadedDocument(), "document")
    let min = 255
    for (let i = 0; i < out.data.length; i += 4) min = Math.min(min, out.data[i])
    expect(min).toBeLessThan(100)
  })

  it("modo bw produce solo negro y blanco", async () => {
    const out = await stylize(await shadedDocument(), "bw")
    const values = new Set<number>()
    for (let i = 0; i < out.data.length; i += 4) values.add(out.data[i])
    expect([...values].every((v) => v === 0 || v === 255)).toBe(true)
    expect(values.size).toBe(2)
  })

  it("no altera las dimensiones en ningún modo", async () => {
    const doc = await shadedDocument()
    for (const mode of ["document", "bw", "original"] as const) {
      const out = await stylize(doc, mode)
      expect([out.width, out.height]).toEqual([doc.width, doc.height])
    }
  })
})
```

- [ ] **Step 2: Correr los tests para verificar que fallan**

Run: `pnpm test lib/scanner/__tests__/stylize.test.ts`
Expected: FAIL — no puede resolver `../stylize`.

- [ ] **Step 3: Escribir `lib/scanner/stylize.ts`**

```ts
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

  try {
    cv.cvtColor(rgb, lab, cv.COLOR_RGB2Lab)
    cv.split(lab, channels)
    clahe = new cv.CLAHE(2.0, new cv.Size(8, 8))
    clahe.apply(channels.get(0), l)
    rebuilt.push_back(l)
    rebuilt.push_back(channels.get(1))
    rebuilt.push_back(channels.get(2))
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
```

- [ ] **Step 4: Correr los tests y verificar que pasan**

Run: `pnpm test lib/scanner/__tests__/stylize.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 5: Correr toda la suite**

Run: `pnpm test`
Expected: PASS, 22 tests en 5 archivos.

- [ ] **Step 6: Commit**

```bash
git add lib/scanner/stylize.ts lib/scanner/__tests__/stylize.test.ts
git commit -m "$(cat <<'EOF'
feat: tres modos de mejora del escaneo

Normalización de iluminación estimando el fondo en escala 1/8 (100 veces
más rápido que a resolución completa, mismo resultado), contraste CLAHE
sobre el canal L, y binarizado con bloque proporcional a la resolución.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: Worker y cliente

**Files:**
- Create: `lib/scanner/worker.ts`
- Create: `lib/scanner/client.ts`
- Modify: `next.config.mjs`

**Interfaces:**
- Consumes: `detectCorners`, `defaultCorners` de `detect.ts`; `warpToRect` de `warp.ts`; `stylize` de `stylize.ts`; tipos de `types.ts`
- Produces: clase `ScannerClient` con
  - `detect(bitmap: ImageBitmap): Promise<Corners | null>`
  - `warp(bitmap: ImageBitmap, corners: Corners, mode: ScanMode): Promise<ImageBitmap>`
  - `restyle(mode: ScanMode): Promise<ImageBitmap>`
  - `release(): void` — descarta el warp cacheado
  - `terminate(): void`

Esta tarea no lleva tests automáticos: `Worker`, `OffscreenCanvas` y `createImageBitmap` no existen en Node y montar un entorno de navegador para probar un adaptador de treinta líneas no vale lo que cuesta. La lógica de imagen ya está cubierta por las tareas 3 a 5. Se verifica en la Tarea 9 sobre dispositivo real.

- [ ] **Step 1: Escribir el worker**

Crear `lib/scanner/worker.ts`:

```ts
/// <reference lib="webworker" />
import { detectCorners } from "./detect"
import { warpToRect } from "./warp"
import { stylize } from "./stylize"
import type { RawImage, WorkerRequest, WorkerResponse } from "./types"

/** Warp de la página en confirmación. Se reusa al cambiar de modo. */
let cachedWarp: RawImage | null = null

function bitmapToRaw(bitmap: ImageBitmap): RawImage {
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height)
  const ctx = canvas.getContext("2d")
  if (!ctx) throw new Error("OffscreenCanvas sin contexto 2d")
  ctx.drawImage(bitmap, 0, 0)
  const data = ctx.getImageData(0, 0, bitmap.width, bitmap.height)
  return { data: data.data, width: data.width, height: data.height }
}

function rawToBitmap(img: RawImage): ImageBitmap {
  const canvas = new OffscreenCanvas(img.width, img.height)
  const ctx = canvas.getContext("2d")
  if (!ctx) throw new Error("OffscreenCanvas sin contexto 2d")
  ctx.putImageData(new ImageData(img.data, img.width, img.height), 0, 0)
  return canvas.transferToImageBitmap()
}

function reply(msg: WorkerResponse, transfer: Transferable[] = []) {
  ;(self as unknown as Worker).postMessage(msg, transfer)
}

self.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const req = event.data
  try {
    switch (req.op) {
      case "detect": {
        const raw = bitmapToRaw(req.bitmap)
        req.bitmap.close()
        const corners = await detectCorners(raw)
        reply({ id: req.id, ok: true, op: "detect", corners })
        break
      }
      case "warp": {
        const raw = bitmapToRaw(req.bitmap)
        req.bitmap.close()
        cachedWarp = await warpToRect(raw, req.corners)
        const styled = await stylize(cachedWarp, req.mode)
        const bitmap = rawToBitmap(styled)
        reply({ id: req.id, ok: true, op: "warp", bitmap }, [bitmap])
        break
      }
      case "restyle": {
        if (!cachedWarp) throw new Error("No hay página en edición")
        const styled = await stylize(cachedWarp, req.mode)
        const bitmap = rawToBitmap(styled)
        reply({ id: req.id, ok: true, op: "restyle", bitmap }, [bitmap])
        break
      }
      case "release": {
        cachedWarp = null
        reply({ id: req.id, ok: true, op: "release" })
        break
      }
    }
  } catch (err) {
    reply({
      id: req.id,
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    })
  }
}
```

- [ ] **Step 2: Escribir el cliente**

Crear `lib/scanner/client.ts`:

```ts
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
```

- [ ] **Step 3: Ajustar `next.config.mjs` para el bundle de OpenCV**

El glue code de Emscripten referencia `fs` y `path` para su rama de Node. En el navegador esas ramas no se ejecutan, pero el bundler igual intenta resolverlas y falla. Reemplazar `next.config.mjs` por:

```js
/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  webpack: (config) => {
    // El glue de Emscripten de OpenCV referencia módulos de Node que nunca
    // se ejecutan en el navegador. Sin esto, el build no resuelve.
    config.resolve.fallback = {
      ...config.resolve.fallback,
      fs: false,
      path: false,
      crypto: false,
    }
    return config
  },
}

export default nextConfig
```

- [ ] **Step 4: Verificar que el build pasa**

Run: `pnpm build`
Expected: build exitoso, sin errores de resolución de módulos.

**Si el build falla por el tamaño o la resolución de `@techstark/opencv-js`** (riesgo conocido: Next 16 usa Turbopack en `dev` y webpack en `build`, y el bundling de Emscripten es frágil), aplicar el plan B en vez de pelear con el bundler:

1. Crear `scripts/copy-opencv.js` que copie `node_modules/@techstark/opencv-js/dist/opencv.js` a `public/opencv.js`, y engancharlo en `"prebuild"` y `"predev"`. A diferencia del script viejo, copia desde una dependencia versionada del `package.json`, sin red y sin sorpresas.
2. En `lib/scanner/cv.ts`, reemplazar el import por `importScripts("/opencv.js")` dentro del worker y leer `self.cv`.
3. Agregar `public/opencv.js` al `.gitignore`.

Documentar cuál de los dos caminos quedó, en el mensaje del commit.

- [ ] **Step 5: Commit**

```bash
git add lib/scanner/worker.ts lib/scanner/client.ts next.config.mjs
git commit -m "$(cat <<'EOF'
feat: worker del scanner y cliente con timeouts

El worker traduce ImageBitmap a RawImage y cachea el enderezado para que
cambiar de modo no vuelva a procesar. El cliente convierte los mensajes
en promesas y corta las operaciones colgadas.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: Editor de esquinas y selector de modo

**Files:**
- Create: `components/editor/scanner/corner-editor.tsx`
- Create: `components/editor/scanner/mode-toggle.tsx`

**Interfaces:**
- Consumes: `Corners`, `Point`, `ScanMode` de `lib/scanner/types.ts`
- Produces:
  - `<CornerEditor imageUrl corners onChange />` — muestra la foto con cuatro manijas arrastrables y una lupa mientras se arrastra
  - `<ModeToggle value onChange disabled />`

Las esquinas se manejan en coordenadas de la imagen original, no de pantalla, así que el resultado no depende del tamaño del viewport.

- [ ] **Step 1: Escribir el selector de modo**

Crear `components/editor/scanner/mode-toggle.tsx`:

```tsx
"use client"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import type { ScanMode } from "@/lib/scanner/types"

const MODES: { value: ScanMode; label: string }[] = [
  { value: "document", label: "Documento" },
  { value: "bw", label: "Blanco y negro" },
  { value: "original", label: "Original" },
]

interface ModeToggleProps {
  value: ScanMode
  onChange: (mode: ScanMode) => void
  disabled?: boolean
}

export function ModeToggle({ value, onChange, disabled }: ModeToggleProps) {
  return (
    <div className="flex gap-1 rounded-lg bg-muted p-1">
      {MODES.map((mode) => (
        <Button
          key={mode.value}
          type="button"
          variant="ghost"
          size="sm"
          disabled={disabled}
          onClick={() => onChange(mode.value)}
          className={cn(
            "flex-1 text-xs",
            value === mode.value && "bg-background shadow-sm",
          )}
        >
          {mode.label}
        </Button>
      ))}
    </div>
  )
}
```

- [ ] **Step 2: Escribir el editor de esquinas**

Crear `components/editor/scanner/corner-editor.tsx`:

```tsx
"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import type { Corners, Point } from "@/lib/scanner/types"

const HANDLE_RADIUS = 14
const LOUPE_SIZE = 96
const LOUPE_ZOOM = 2.5

interface CornerEditorProps {
  /** URL de la foto original (objectURL). */
  imageUrl: string
  corners: Corners
  onChange: (corners: Corners) => void
}

/**
 * Muestra la foto con cuatro manijas arrastrables. Las coordenadas de las
 * esquinas siempre están en el espacio de la imagen original; la conversión
 * a pantalla se hace al dibujar.
 */
export function CornerEditor({ imageUrl, corners, onChange }: CornerEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const imgRef = useRef<HTMLImageElement>(null)
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null)
  const [box, setBox] = useState<{ w: number; h: number }>({ w: 0, h: 0 })
  const [dragging, setDragging] = useState<number | null>(null)

  // Medir el tamaño renderizado de la imagen para mapear coordenadas.
  useEffect(() => {
    const el = imgRef.current
    if (!el) return
    const measure = () => setBox({ w: el.clientWidth, h: el.clientHeight })
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
  }, [natural])

  const toScreen = useCallback(
    (p: Point): Point => {
      if (!natural || box.w === 0) return { x: 0, y: 0 }
      return { x: (p.x / natural.w) * box.w, y: (p.y / natural.h) * box.h }
    },
    [natural, box],
  )

  const toImage = useCallback(
    (clientX: number, clientY: number): Point => {
      const el = imgRef.current
      if (!el || !natural) return { x: 0, y: 0 }
      const rect = el.getBoundingClientRect()
      const sx = Math.min(Math.max(clientX - rect.left, 0), rect.width)
      const sy = Math.min(Math.max(clientY - rect.top, 0), rect.height)
      return {
        x: Math.round((sx / rect.width) * natural.w),
        y: Math.round((sy / rect.height) * natural.h),
      }
    },
    [natural],
  )

  const handlePointerDown = (index: number) => (event: React.PointerEvent) => {
    event.preventDefault()
    ;(event.target as HTMLElement).setPointerCapture(event.pointerId)
    setDragging(index)
  }

  const handlePointerMove = (index: number) => (event: React.PointerEvent) => {
    if (dragging !== index) return
    const next = [...corners] as Corners
    next[index] = toImage(event.clientX, event.clientY)
    onChange(next)
  }

  const handlePointerUp = (event: React.PointerEvent) => {
    ;(event.target as HTMLElement).releasePointerCapture(event.pointerId)
    setDragging(null)
  }

  const screenCorners = corners.map(toScreen)
  const polygon = screenCorners.map((p) => `${p.x},${p.y}`).join(" ")

  return (
    <div ref={containerRef} className="relative w-full select-none touch-none">
      <img
        ref={imgRef}
        src={imageUrl}
        alt="Documento capturado"
        className="w-full h-auto rounded-lg"
        onLoad={(e) => {
          const el = e.currentTarget
          setNatural({ w: el.naturalWidth, h: el.naturalHeight })
        }}
      />

      {natural && box.w > 0 && (
        <>
          <svg
            className="absolute inset-0 pointer-events-none"
            width={box.w}
            height={box.h}
          >
            <polygon
              points={polygon}
              fill="rgba(56,189,248,0.15)"
              stroke="rgb(56,189,248)"
              strokeWidth={2}
            />
          </svg>

          {screenCorners.map((p, i) => (
            <div
              key={i}
              role="slider"
              tabIndex={0}
              aria-label={["Esquina superior izquierda", "Esquina superior derecha", "Esquina inferior derecha", "Esquina inferior izquierda"][i]}
              aria-valuenow={0}
              onPointerDown={handlePointerDown(i)}
              onPointerMove={handlePointerMove(i)}
              onPointerUp={handlePointerUp}
              onPointerCancel={handlePointerUp}
              className="absolute rounded-full border-2 border-sky-400 bg-sky-400/30 backdrop-blur-sm cursor-grab active:cursor-grabbing"
              style={{
                width: HANDLE_RADIUS * 2,
                height: HANDLE_RADIUS * 2,
                left: p.x - HANDLE_RADIUS,
                top: p.y - HANDLE_RADIUS,
                touchAction: "none",
              }}
            />
          ))}

          {/* Lupa: se posiciona en la esquina opuesta para no taparse con el dedo. */}
          {dragging !== null && (
            <div
              className="absolute rounded-full border-2 border-sky-400 overflow-hidden shadow-lg pointer-events-none"
              style={{
                width: LOUPE_SIZE,
                height: LOUPE_SIZE,
                left: screenCorners[dragging].x > box.w / 2 ? 8 : box.w - LOUPE_SIZE - 8,
                top: screenCorners[dragging].y > box.h / 2 ? 8 : box.h - LOUPE_SIZE - 8,
                backgroundImage: `url(${imageUrl})`,
                backgroundRepeat: "no-repeat",
                backgroundSize: `${box.w * LOUPE_ZOOM}px ${box.h * LOUPE_ZOOM}px`,
                backgroundPosition: `${LOUPE_SIZE / 2 - screenCorners[dragging].x * LOUPE_ZOOM}px ${LOUPE_SIZE / 2 - screenCorners[dragging].y * LOUPE_ZOOM}px`,
              }}
            >
              <div className="absolute left-1/2 top-1/2 w-4 h-px -translate-x-1/2 bg-sky-400" />
              <div className="absolute left-1/2 top-1/2 h-4 w-px -translate-y-1/2 bg-sky-400" />
            </div>
          )}
        </>
      )}
    </div>
  )
}
```

- [ ] **Step 3: Verificar que compila**

Run: `pnpm exec tsc --noEmit -p tsconfig.json`
Expected: sin errores en `components/editor/scanner/corner-editor.tsx` ni en `mode-toggle.tsx`.

(Nota: el proyecto tiene `typescript.ignoreBuildErrors: true` en `next.config.mjs`, así que `pnpm build` no detecta errores de tipos. Correr `tsc` a mano es la única verificación real.)

- [ ] **Step 4: Commit**

```bash
git add components/editor/scanner/corner-editor.tsx components/editor/scanner/mode-toggle.tsx
git commit -m "$(cat <<'EOF'
feat: editor de esquinas con lupa y selector de modo

Las esquinas se manejan en coordenadas de la imagen original para que el
ajuste no dependa del tamaño de pantalla. La lupa se ubica en el cuadrante
opuesto al dedo.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 8: Reescribir el modal del scanner

**Files:**
- Modify: `components/editor/scanner/scan-modal.tsx` (reescritura completa)

**Interfaces:**
- Consumes: `ScannerClient` de `lib/scanner/client.ts`; `defaultCorners` de `lib/scanner/detect.ts`; `CornerEditor` y `ModeToggle` de la Tarea 7; `ScanPageStrip` (existente); `useEditorStore` de `lib/editor/store.ts`
- Produces: `<ScanModal open onOpenChange />` — misma firma que hoy, así que `pdf-editor.tsx` no cambia

Estados: `idle` (esperando captura) → `detecting` → `adjusting` (ajuste de esquinas) → `warping` → `previewing` (resultado procesado, con cambio de modo instantáneo) → `idle`. La tira de páginas persiste en paralelo a todos los estados.

El paso `previewing` es el que hace que `restyle` valga la pena: el enderezado ya está cacheado en el worker, así que tocar otro modo re-aplica la mejora sobre ese cache en vez de volver a procesar la foto entera.

- [ ] **Step 1: Reescribir `components/editor/scanner/scan-modal.tsx`**

```tsx
"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { Camera, Loader2, Check, X } from "lucide-react"
import { toast } from "sonner"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { useEditorStore } from "@/lib/editor/store"
import { ScanPageStrip } from "./scan-page-strip"
import { CornerEditor } from "./corner-editor"
import { ModeToggle } from "./mode-toggle"
import { ScannerClient } from "@/lib/scanner/client"
import { defaultCorners } from "@/lib/scanner/detect"
import type { Corners, ScanMode } from "@/lib/scanner/types"
import { PDFDocument } from "@cantoo/pdf-lib"

type State =
  | "idle"
  | "detecting"
  | "adjusting"
  | "warping"
  | "previewing"
  | "generating"

interface ScannedPage {
  id: string
  blob: Blob
  dataUrl: string
}

interface Capture {
  /** Foto original. Se guarda el File para poder recrear el bitmap: cada
   *  postMessage transfiere el bitmap al worker y lo deja inutilizable. */
  file: File
  url: string
  corners: Corners
}

interface Preview {
  url: string
  blob: Blob
}

const JPEG_QUALITY = 0.9

async function bitmapToBlob(bitmap: ImageBitmap, quality: number): Promise<Blob> {
  const canvas = document.createElement("canvas")
  canvas.width = bitmap.width
  canvas.height = bitmap.height
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0)
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("No se pudo generar la imagen"))),
      "image/jpeg",
      quality,
    )
  })
}

async function imagesToPdf(blobs: Blob[], name: string): Promise<File> {
  const doc = await PDFDocument.create()
  for (const blob of blobs) {
    const bytes = new Uint8Array(await blob.arrayBuffer())
    // Las páginas procesadas son JPEG, pero "guardar sin enderezar" mete el
    // archivo original tal cual, que puede ser PNG.
    const isPng = bytes[0] === 0x89 && bytes[1] === 0x50
    const image = isPng ? await doc.embedPng(bytes) : await doc.embedJpg(bytes)
    const { width, height } = image.scale(1)
    const page = doc.addPage([width, height])
    page.drawImage(image, { x: 0, y: 0, width, height })
  }
  const pdfBytes = await doc.save()
  return new File([pdfBytes.buffer as ArrayBuffer], `${name}.pdf`, {
    type: "application/pdf",
  })
}

interface ScanModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function ScanModal({ open, onOpenChange }: ScanModalProps) {
  const addSources = useEditorStore((s) => s.addSources)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const clientRef = useRef<ScannerClient | null>(null)

  const [state, setState] = useState<State>("idle")
  const [pages, setPages] = useState<ScannedPage[]>([])
  const [capture, setCapture] = useState<Capture | null>(null)
  const [preview, setPreview] = useState<Preview | null>(null)
  const [mode, setMode] = useState<ScanMode>("document")
  /** true si OpenCV no está disponible: habilita guardar la foto sin procesar. */
  const [degraded, setDegraded] = useState(false)

  const getClient = useCallback(() => {
    if (!clientRef.current) clientRef.current = new ScannerClient()
    return clientRef.current
  }, [])

  // Liberar recursos al cerrar.
  useEffect(() => {
    if (open) return
    clientRef.current?.terminate()
    clientRef.current = null
    setState("idle")
    setPages((prev) => {
      prev.forEach((p) => URL.revokeObjectURL(p.dataUrl))
      return []
    })
    setCapture((prev) => {
      if (prev) URL.revokeObjectURL(prev.url)
      return null
    })
    setPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev.url)
      return null
    })
    setMode("document")
    setDegraded(false)
  }, [open])

  const addPage = useCallback(async (blob: Blob) => {
    setPages((prev) => [
      ...prev,
      { id: crypto.randomUUID(), blob, dataUrl: URL.createObjectURL(blob) },
    ])
  }, [])

  const resetToIdle = useCallback(() => {
    setCapture((prev) => {
      if (prev) URL.revokeObjectURL(prev.url)
      return null
    })
    setPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev.url)
      return null
    })
    setState("idle")
  }, [])

  const handleFile = useCallback(
    async (file: File) => {
      setState("detecting")

      let width: number
      let height: number
      try {
        const probe = await createImageBitmap(file)
        width = probe.width
        height = probe.height
        probe.close()
      } catch {
        toast.error("No se pudo leer la foto. Probá sacarla de nuevo.")
        setState("idle")
        return
      }

      // La detección es best-effort: si falla, el usuario ajusta a mano.
      let corners = defaultCorners(width, height)
      try {
        const detected = await getClient().detect(await createImageBitmap(file))
        if (detected) corners = detected
        else toast.info("No encontré los bordes. Ajustalos vos.")
      } catch {
        setDegraded(true)
        toast.warning("La detección automática no está disponible. Ajustá los bordes a mano.")
      }

      setCapture({ file, url: URL.createObjectURL(file), corners })
      setState("adjusting")
    },
    [getClient],
  )

  const confirmCorners = useCallback(async () => {
    if (!capture) return
    setState("warping")
    try {
      const bitmap = await createImageBitmap(capture.file)
      const result = await getClient().warp(bitmap, capture.corners, mode)
      const blob = await bitmapToBlob(result, JPEG_QUALITY)
      result.close()
      setPreview({ url: URL.createObjectURL(blob), blob })
      setState("previewing")
    } catch (err) {
      setDegraded(true)
      toast.error(err instanceof Error ? err.message : "No se pudo procesar la página")
      setState("adjusting")
    }
  }, [capture, mode, getClient])

  /** Cambia el modo re-aplicando la mejora sobre el enderezado ya cacheado. */
  const changeMode = useCallback(
    async (next: ScanMode) => {
      setMode(next)
      if (state !== "previewing") return
      try {
        const result = await getClient().restyle(next)
        const blob = await bitmapToBlob(result, JPEG_QUALITY)
        result.close()
        setPreview((prev) => {
          if (prev) URL.revokeObjectURL(prev.url)
          return { url: URL.createObjectURL(blob), blob }
        })
      } catch {
        toast.error("No se pudo cambiar el modo")
      }
    },
    [state, getClient],
  )

  const acceptPage = useCallback(async () => {
    if (!preview) return
    await addPage(preview.blob)
    getClient().release()
    resetToIdle()
  }, [preview, addPage, getClient, resetToIdle])

  /** Salida de emergencia cuando OpenCV no está disponible. */
  const saveUnprocessed = useCallback(async () => {
    if (!capture) return
    await addPage(capture.file)
    toast.info("Página guardada sin enderezar")
    resetToIdle()
  }, [capture, addPage, resetToIdle])

  const backToCorners = useCallback(() => {
    setPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev.url)
      return null
    })
    getClient().release()
    setState("adjusting")
  }, [getClient])

  const discardCapture = useCallback(() => {
    getClient().release()
    resetToIdle()
  }, [getClient, resetToIdle])

  const createPdf = useCallback(async () => {
    if (pages.length === 0) return
    setState("generating")
    try {
      const file = await imagesToPdf(
        pages.map((p) => p.blob),
        `escaneo-${Date.now()}`,
      )
      await addSources([file])
      toast.success(`PDF de ${pages.length} página(s) agregado al editor`)
      onOpenChange(false)
    } catch {
      toast.error("No se pudo generar el PDF")
      setState("idle")
    }
  }, [pages, addSources, onOpenChange])

  const busy = state === "detecting" || state === "warping" || state === "generating"

  return (
    <Dialog open={open} onOpenChange={(next) => !busy && onOpenChange(next)}>
      <DialogContent className="sm:max-w-2xl max-sm:max-w-full max-sm:h-dvh max-sm:rounded-none max-sm:m-0 flex flex-col gap-0 p-0">
        <DialogHeader className="px-5 pt-4 pb-2 shrink-0">
          <DialogTitle>Escanear documento</DialogTitle>
          <DialogDescription>
            {state === "idle" && "Sacá una foto del documento con la cámara del celular"}
            {state === "detecting" && "Buscando los bordes del documento…"}
            {state === "adjusting" && "Ajustá las esquinas arrastrando los puntos"}
            {state === "warping" && "Enderezando y mejorando…"}
            {state === "previewing" && "Así queda. Probá otro modo si no te convence"}
            {state === "generating" && "Generando el PDF…"}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-4 space-y-3 min-h-0">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0]
              e.target.value = "" // permite volver a elegir la misma foto
              if (file) void handleFile(file)
            }}
          />

          {state === "idle" && (
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="w-full flex flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed py-16 hover:bg-muted/50 transition-colors"
            >
              <Camera className="h-10 w-10 text-muted-foreground" />
              <span className="text-sm font-medium">
                {pages.length === 0 ? "Sacar foto" : "Agregar otra página"}
              </span>
            </button>
          )}

          {busy && (
            <div className="flex flex-col items-center justify-center gap-3 py-16">
              <Loader2 className="h-10 w-10 animate-spin text-primary" />
            </div>
          )}

          {state === "adjusting" && capture && (
            <div className="space-y-3">
              <CornerEditor
                imageUrl={capture.url}
                corners={capture.corners}
                onChange={(corners) => setCapture({ ...capture, corners })}
              />
              <div className="flex gap-2">
                <Button variant="outline" onClick={discardCapture} className="flex-1">
                  <X className="h-4 w-4 mr-1" />
                  Descartar
                </Button>
                <Button onClick={confirmCorners} className="flex-1">
                  Continuar
                </Button>
              </div>
              {degraded && (
                <Button variant="ghost" onClick={saveUnprocessed} className="w-full text-xs">
                  Guardar la foto sin enderezar
                </Button>
              )}
            </div>
          )}

          {state === "previewing" && preview && (
            <div className="space-y-3">
              <img
                src={preview.url}
                alt="Página procesada"
                className="w-full h-auto rounded-lg"
              />
              <ModeToggle value={mode} onChange={changeMode} />
              <div className="flex gap-2">
                <Button variant="outline" onClick={backToCorners} className="flex-1">
                  Volver a las esquinas
                </Button>
                <Button onClick={acceptPage} className="flex-1">
                  <Check className="h-4 w-4 mr-1" />
                  Usar esta página
                </Button>
              </div>
            </div>
          )}

          {pages.length > 0 && state !== "generating" && (
            <div className="space-y-2 pb-2">
              <p className="text-sm font-medium text-muted-foreground">
                {pages.length} página(s) lista(s)
              </p>
              <ScanPageStrip
                pages={pages}
                onRemove={(id) =>
                  setPages((prev) => {
                    const target = prev.find((p) => p.id === id)
                    if (target) URL.revokeObjectURL(target.dataUrl)
                    return prev.filter((p) => p.id !== id)
                  })
                }
              />
            </div>
          )}
        </div>

        {state === "idle" && pages.length > 0 && (
          <DialogFooter className="px-6 py-4 shrink-0 border-t">
            <Button onClick={createPdf} className="w-full sm:w-auto">
              Crear PDF ({pages.length} pág.)
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Step 2: Verificar que compila**

Run: `pnpm exec tsc --noEmit -p tsconfig.json`
Expected: sin errores nuevos en `scan-modal.tsx`.

Si `ScanPageStrip` espera una prop distinta a `pages`/`onRemove`, leer `components/editor/scanner/scan-page-strip.tsx` y adaptar la llamada — no modificar ese componente.

- [ ] **Step 3: Verificar que el build pasa**

Run: `pnpm build`
Expected: build exitoso.

- [ ] **Step 4: Commit**

```bash
git add components/editor/scanner/scan-modal.tsx
git commit -m "$(cat <<'EOF'
feat: modal del scanner con captura por cámara nativa

Reemplaza el flujo de getUserMedia por <input capture>, con máquina de
estados explícita. Toda falla de detección degrada a ajuste manual en vez
de dejar al usuario sin salida.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 9: Borrar el scanner viejo

**Files:**
- Delete: `lib/pdf/scanner.ts`, `lib/pdf/opencv.ts`, `scripts/download-opencv.js`, `public/opencv.js`, `components/scan-camera.tsx`, `components/editor/scanner/scan-camera.tsx`, `components/editor/scanner/scan-corners.tsx`
- Modify: `package.json`, `README.md`

- [ ] **Step 1: Confirmar que nadie importa lo que se va a borrar**

```bash
grep -rn "lib/pdf/scanner\|lib/pdf/opencv\|scan-camera\|scan-corners" --include="*.ts" --include="*.tsx" app components lib hooks
```

Expected: sin resultados. Si aparece alguno, resolverlo antes de borrar.

- [ ] **Step 2: Borrar los archivos**

```bash
git rm lib/pdf/scanner.ts lib/pdf/opencv.ts scripts/download-opencv.js \
       components/scan-camera.tsx \
       components/editor/scanner/scan-camera.tsx \
       components/editor/scanner/scan-corners.tsx
rm -f public/opencv.js
```

- [ ] **Step 3: Sacar los hooks de descarga de `package.json`**

Eliminar estas dos líneas de `"scripts"`:

```json
"prebuild": "node scripts/download-opencv.js",
"predev": "node scripts/download-opencv.js",
```

Si en la Tarea 6 se aplicó el plan B, dejarlas apuntando a `scripts/copy-opencv.js` en vez de borrarlas.

- [ ] **Step 4: Actualizar el README**

Reemplazar la sección "### Escanear" por:

```markdown
### Escanear
- Sacá una foto del documento con la cámara del celular y ControlPDF detecta los bordes, endereza la perspectiva y limpia la iluminación.
- Tres modos: **Documento** (papel blanco parejo conservando color), **Blanco y negro** (binarizado, archivo chico) y **Original** (solo endereza).
- Multipágina: sumá todas las páginas que quieras y salen como un solo PDF.
- El procesamiento corre en un Web Worker con OpenCV WASM, en tu dispositivo.
```

En la sección "## Stack", reemplazar la línea de `tesseract.js` agregando debajo:

```markdown
- **@techstark/opencv-js** — detección de bordes y enderezado del scanner (lazy)
```

- [ ] **Step 5: Verificar que todo sigue funcionando**

```bash
pnpm test && pnpm exec tsc --noEmit -p tsconfig.json && pnpm build
```

Expected: los tres pasan.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "$(cat <<'EOF'
refactor: eliminar el scanner viejo

Se van las ~1050 líneas de visión por computadora escritas a mano, los dos
scan-camera duplicados y el script que descargaba opencv.js de internet
durante el build sin versión fijada.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 10: Fixtures reales y verificación en dispositivo

**Files:**
- Create: `lib/scanner/__tests__/photos/` (8 fotos JPEG)
- Create: `lib/scanner/__tests__/photos/expected.json`
- Create: `lib/scanner/__tests__/real-photos.test.ts`

**Interfaces:**
- Consumes: `detectCorners` de `lib/scanner/detect.ts`

**Esta tarea requiere que Diego saque las fotos.** Es el criterio de aceptación del spec (sección 11) y no se puede completar sin ellas.

- [ ] **Step 1: Pedir las ocho fotos**

Sacadas con el celular, guardadas como JPEG en `lib/scanner/__tests__/photos/` con estos nombres exactos:

| Archivo | Qué fotografiar |
|---|---|
| `01-fondo-oscuro.jpg` | Hoja blanca sobre escritorio oscuro, de frente |
| `02-fondo-claro.jpg` | Hoja blanca sobre mesa clara (bajo contraste) |
| `03-sombra-mano.jpg` | Documento con la sombra de tu propia mano encima |
| `04-angulo.jpg` | Documento en ángulo pronunciado |
| `05-sellos.jpg` | Documento con sellos o firmas de color |
| `06-ticket.jpg` | Un ticket angosto y largo |
| `07-arrugado.jpg` | Papel arrugado o doblado |
| `08-sin-documento.jpg` | Una escena cualquiera sin ningún documento (caso negativo) |

- [ ] **Step 2: Anotar las esquinas esperadas**

Para cada foto, abrirla en un visor que muestre coordenadas de píxel y anotar las cuatro esquinas del documento. Crear `lib/scanner/__tests__/photos/expected.json`:

```json
{
  "01-fondo-oscuro.jpg": { "corners": [[0,0],[0,0],[0,0],[0,0]] },
  "02-fondo-claro.jpg": { "corners": [[0,0],[0,0],[0,0],[0,0]] },
  "03-sombra-mano.jpg": { "corners": [[0,0],[0,0],[0,0],[0,0]] },
  "04-angulo.jpg": { "corners": [[0,0],[0,0],[0,0],[0,0]] },
  "05-sellos.jpg": { "corners": [[0,0],[0,0],[0,0],[0,0]] },
  "06-ticket.jpg": { "corners": [[0,0],[0,0],[0,0],[0,0]] },
  "07-arrugado.jpg": { "corners": [[0,0],[0,0],[0,0],[0,0]] },
  "08-sin-documento.jpg": { "corners": null }
}
```

Reemplazar los ceros por las coordenadas reales, en orden tl, tr, br, bl.

- [ ] **Step 3: Escribir el test**

Crear `lib/scanner/__tests__/real-photos.test.ts`:

```ts
import { describe, it, expect } from "vitest"
import { readFileSync, existsSync } from "node:fs"
import { join } from "node:path"
import jpeg from "jpeg-js"
import { detectCorners } from "../detect"
import type { Corners, RawImage } from "../types"

const DIR = join(__dirname, "photos")
const EXPECTED_PATH = join(DIR, "expected.json")

/** El spec pide acertar al menos 6 de 8 sin intervención manual. */
const MIN_HITS = 6

function decode(file: string): RawImage {
  const raw = jpeg.decode(readFileSync(join(DIR, file)), { useTArray: true })
  return {
    data: new Uint8ClampedArray(raw.data),
    width: raw.width,
    height: raw.height,
  }
}

function within(got: Corners, want: Corners, longSide: number): boolean {
  const tol = 0.03 * longSide
  return got.every(
    (p, i) => Math.abs(p.x - want[i].x) <= tol && Math.abs(p.y - want[i].y) <= tol,
  )
}

const hasPhotos = existsSync(EXPECTED_PATH)

describe.skipIf(!hasPhotos)("fotos reales", () => {
  const expected: Record<string, { corners: number[][] | null }> = hasPhotos
    ? JSON.parse(readFileSync(EXPECTED_PATH, "utf8"))
    : {}

  it(`acierta al menos ${MIN_HITS} de 8`, async () => {
    let hits = 0
    const misses: string[] = []

    for (const [file, entry] of Object.entries(expected)) {
      const img = decode(file)
      const found = await detectCorners(img)

      if (entry.corners === null) {
        if (found === null) hits++
        else misses.push(`${file}: encontró un documento donde no hay`)
        continue
      }

      const want = entry.corners.map(([x, y]) => ({ x, y })) as Corners
      if (found && within(found, want, Math.max(img.width, img.height))) hits++
      else misses.push(`${file}: ${found ? "esquinas fuera de tolerancia" : "no detectó nada"}`)
    }

    if (misses.length) console.log("Fallos:\n  " + misses.join("\n  "))
    expect(hits).toBeGreaterThanOrEqual(MIN_HITS)
  })
})
```

- [ ] **Step 4: Correr el test**

Run: `pnpm test lib/scanner/__tests__/real-photos.test.ts`
Expected: PASS con al menos 6 aciertos. Si da menos, el output lista qué fotos fallaron y por qué — ajustar los umbrales de `detect.ts` (Canny 50/150, epsilon 0,02, área mínima 0,15) contra esas fotos, no contra las sintéticas.

- [ ] **Step 5: Verificación manual en dispositivo real**

En un Android y en un iPhone físicos, no en el emulador del navegador. Servir con `pnpm build && pnpm start` y entrar desde el celular por la IP de la red local.

Marcar cada uno:

- [ ] Android: la cámara se abre al tocar "Sacar foto"
- [ ] Android: la detección propone esquinas razonables
- [ ] Android: las esquinas se arrastran suave y la lupa se ve
- [ ] Android: los tres modos producen resultados distintos y visibles, y el cambio en la vista previa es instantáneo (usa el warp cacheado, no reprocesa)
- [ ] Android: cinco páginas seguidas sin que se trabe la interfaz
- [ ] Android: el PDF final se abre y tiene las cinco páginas
- [ ] iPhone: la cámara se abre al tocar "Sacar foto"
- [ ] iPhone: la foto se lee bien (verificar que HEIC no rompe `createImageBitmap`)
- [ ] iPhone: la detección propone esquinas razonables
- [ ] iPhone: las esquinas se arrastran suave y la lupa se ve
- [ ] iPhone: los tres modos producen resultados distintos y visibles, y el cambio en la vista previa es instantáneo (usa el warp cacheado, no reprocesa)
- [ ] iPhone: cinco páginas seguidas sin que se trabe la interfaz
- [ ] iPhone: el PDF final se abre y tiene las cinco páginas

Si en iPhone `createImageBitmap` falla con HEIC, la solución es decodificar vía `<img>` y `canvas` como respaldo dentro de `handleFile` — Safari sí decodifica HEIC en un `<img>`.

- [ ] **Step 6: Commit**

```bash
git add lib/scanner/__tests__/photos lib/scanner/__tests__/real-photos.test.ts
git commit -m "$(cat <<'EOF'
test: fixtures de fotos reales para la detección

Ocho fotos con esquinas anotadas a mano. El umbral de aceptación del spec
es acertar al menos seis sin intervención manual.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

## Cobertura del spec

| Requisito del spec | Tarea |
|---|---|
| §3 paso 1 — captura con `<input capture>` | 8 |
| §3 paso 2 — detección en worker sobre copia reducida | 3, 6 |
| §3 paso 3 — confirmación con esquinas arrastrables y lupa | 7 |
| §3 paso 4 — enderezado y mejora | 4, 5 |
| §3 paso 5 — acumulación multipágina | 8 |
| §3 paso 6 — salida a PDF vía `addSources` | 8 |
| §4 — módulos con límites claros | 2–8 |
| §5 — tres modos, iluminación, bloque proporcional, cache de warp | 5, 6, 7 |
| §6 — tabla de manejo de errores | 6 (timeouts, worker muerto), 8 (esquinas por defecto, cancelar cámara, "guardar sin enderezar" cuando OpenCV no está) |
| §7 — fixtures y verificación en dispositivo | 1 (sintéticas), 10 (reales + manual) |
| §8 — eliminación del código viejo | 9 |
| §9 — medición del peso de OpenCV | Ya medido: 12,68 MB (`dist/opencv.js`) |
| §11 — criterios de éxito | 10 |

**Nota sobre §9:** el spec dejaba la medición como tarea pendiente. Ya está hecha: el payload real es `dist/opencv.js`, 12,68 MB sin comprimir, un solo archivo. Como se carga lazy no afecta el arranque de ControlPDF. Si en las pruebas de la Tarea 10 la primera carga en 4G resulta insoportable, la salida es un build custom con solo `imgproc` — pero eso es una tarea aparte, no parte de este plan.
