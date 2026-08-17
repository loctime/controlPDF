# Modos Simple y Múltiple en el scanner — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reemplazar el flujo único del scanner por dos modos elegidos al abrir: Simple (una captura, guardar/compartir/PDF, sin editor) y Múltiple (ráfaga sin confirmar cada foto, revisión y exportación al final).

**Architecture:** `scan-modal.tsx` pasa de máquina de estados a selector de modo liviano que monta `SimpleScan` o `MultiScan` — dos componentes nuevos e independientes, cada uno con su propio `ScannerClient`. Ambos reusan sin tocar: el pipeline de `lib/scanner/` (detección, enderezado, orientación, estilizado), el worker, `corner-editor.tsx` y `mode-toggle.tsx`. Se extraen a módulos compartidos las piezas que hoy viven inline en `scan-modal.tsx` (decodificar, convertir a blob, armar PDF) para que los dos modos las usen sin duplicar código.

**Tech Stack:** Next.js 16 + React 19 + TypeScript, `@cantoo/pdf-lib` (ya en uso), `jszip` (ya en uso, vía `lib/pdf/utils.ts`), vitest.

**Spec:** `docs/superpowers/specs/2026-08-16-scanner-modos-simple-multiple-design.md`

## Global Constraints

- No se toca `lib/scanner/detect.ts`, `warp.ts`, `orientation.ts`, `stylize.ts`, `cv.ts`, `worker.ts` ni `client.ts` — el pipeline de imagen es el mismo.
- `lib/scanner/capture.ts` y `lib/scanner/export.ts` (nuevos en este plan) son código de UI/empaquetado, no el "motor" de procesamiento — no hace falta portarlos a `controldoc-holding` (ver `CLAUDE.local.md` de este proyecto), aunque viven en el mismo directorio por prolijidad.
- Formato de imagen: JPEG, calidad 0.9 (`JPEG_QUALITY`), sin cambios respecto de hoy.
- Sin selector de carpeta personalizada, sin bucket de almacenamiento — descartado explícitamente en la spec.
- El intento de reabrir la cámara automáticamente en Múltiple no se da por funcionando hasta verificarlo en navegador real (Tarea 10) — la degradación a botón manual es parte del diseño, no un parche.
- Las 51 pruebas existentes de `lib/scanner/__tests__/` no deberían cambiar. Si alguna cambia, algo se tocó fuera de alcance.

---

## Mapa de archivos

**Nuevos:**
- `lib/scanner/capture.ts` — decodificar y encolar una foto para el pipeline (helpers compartidos, sin UI)
- `lib/scanner/__tests__/capture.test.ts`
- `lib/scanner/export.ts` — armar el PDF combinado
- `lib/scanner/__tests__/export.test.ts`
- `components/editor/scanner/use-scanner-client.ts` — hook del ciclo de vida de `ScannerClient`
- `components/editor/scanner/simple-scan.tsx`
- `components/editor/scanner/multi-scan.tsx`
- `components/editor/scanner/multi-scan-review.tsx`

**Modificados:**
- `components/editor/scanner/scan-modal.tsx` — reescrito, pasa a ser el selector de modo
- `components/editor/scanner/scan-page-strip.tsx` — estado "procesando" y miniaturas tocables

**Sin tocar:** `components/editor/pdf-editor.tsx` (la interfaz pública de `ScanModal` —`open`/`onOpenChange`— no cambia), `corner-editor.tsx`, `mode-toggle.tsx`, todo `lib/scanner/` salvo los dos archivos nuevos, `lib/pdf/utils.ts` (se reusa `triggerDownload`/`downloadZip`, ya existen).

---

### Task 1: `lib/scanner/capture.ts` — decodificar y enderezar, compartido entre los dos modos

**Files:**
- Create: `lib/scanner/capture.ts`
- Test: `lib/scanner/__tests__/capture.test.ts`

**Interfaces:**
- Consumes: `ScannerClient` de `lib/scanner/client.ts` (métodos `detect`, `warp`), `defaultCorners` de `lib/scanner/detect.ts`, tipos `Corners`/`ScanMode` de `lib/scanner/types.ts`.
- Produces: `JPEG_QUALITY: number`, `MAX_INPUT_SIDE: number`, `decodeCapped(file: File): Promise<ImageBitmap>`, `bitmapToBlob(bitmap: ImageBitmap, quality: number): Promise<Blob>`, `WarpResult { blob: Blob; url: string }`, `warpWithCorners(getClient: () => ScannerClient, file: File, corners: Corners, mode: ScanMode): Promise<WarpResult>`, `DetectAndWarpResult extends WarpResult { corners: Corners; detected: boolean }`, `detectAndWarp(getClient: () => ScannerClient, file: File, mode: ScanMode): Promise<DetectAndWarpResult>`. Usados por `simple-scan.tsx` (Tarea 5), `multi-scan.tsx` (Tarea 6) y `multi-scan-review.tsx` (Tarea 7).

`decodeCapped` y `bitmapToBlob` usan `createImageBitmap`/`canvas`, no disponibles en el entorno de test (`environment: "node"` en `vitest.config.ts`) — igual que hoy, no se prueban con vitest. Se verifican en navegador real en las Tareas 9 y 10. `warpWithCorners` y `detectAndWarp` tampoco son testeables directo (dependen de las anteriores) — la prueba de este archivo se limita a las constantes, que es lo único puro y sin DOM.

- [ ] **Step 1: Crear el archivo, moviendo `decodeCapped` y `bitmapToBlob` tal cual están hoy**

```typescript
// lib/scanner/capture.ts
import type { ScannerClient } from "./client"
import { defaultCorners } from "./detect"
import type { Corners, ScanMode } from "./types"

/**
 * Este archivo es código de UI/empaquetado (decodificar una foto, convertirla
 * a blob, armar el enderezado completo), no el "motor" de procesamiento por
 * OpenCV. No hace falta portarlo a controldoc-holding cuando ese proyecto
 * sincronice lib/scanner/ — ver CLAUDE.local.md.
 */

export const JPEG_QUALITY = 0.9

/**
 * Tope del lado largo del bitmap decodificado. Sin esto, una foto de 12-48 MP
 * hace que el worker maneje un `ImageData` y un `cv.Mat` de decenas o cientos
 * de MB (`getImageData`/`matFromImageData` a resolución completa) — riesgo
 * real de quedarse sin memoria en el celular. La salida ya está topeada a
 * 3000px (`MAX_OUTPUT_SIDE` en warp.ts), así que topear la entrada acá no se
 * nota en la calidad final.
 */
export const MAX_INPUT_SIDE = 4000

/**
 * Decodifica el archivo una sola vez y lo reduce si excede `MAX_INPUT_SIDE`.
 * Esta es la única fuente de verdad del tamaño con el que trabajan la
 * detección, el editor de esquinas y el warp: todos comparten este mismo
 * espacio de coordenadas porque todos parten de un bitmap decodificado con
 * esta misma función.
 */
export async function decodeCapped(file: File): Promise<ImageBitmap> {
  // `imageOrientation: "from-image"` va explícito a propósito. Las cámaras de
  // celular suelen guardar la foto en horizontal con una etiqueta EXIF que dice
  // cómo rotarla, y el default del navegador para respetarla o ignorarla cambió
  // con los años: en los que todavía la ignoran, la página sale acostada.
  const raw = await createImageBitmap(file, { imageOrientation: "from-image" })
  const scale = Math.min(1, MAX_INPUT_SIDE / Math.max(raw.width, raw.height))
  if (scale >= 1) return raw
  const resized = await createImageBitmap(raw, {
    resizeWidth: Math.round(raw.width * scale),
    resizeHeight: Math.round(raw.height * scale),
    resizeQuality: "high",
  })
  raw.close()
  return resized
}

export async function bitmapToBlob(bitmap: ImageBitmap, quality: number): Promise<Blob> {
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
```

- [ ] **Step 2: Agregar `warpWithCorners` — decodifica, endereza con esquinas conocidas y produce el blob**

Esto es el cuerpo de lo que hoy es `runWarp` dentro de `scan-modal.tsx`, sin la parte de estado de React. Lo usan: `simple-scan.tsx` cuando el usuario confirma esquinas ajustadas a mano, y `multi-scan-review.tsx` cuando se edita una página ya capturada.

```typescript
export interface WarpResult {
  blob: Blob
  url: string
}

/**
 * Decodifica el archivo, endereza con las esquinas dadas y estiliza según
 * `mode`. No detecta esquinas — se usan las que se pasan. `getClient` es una
 * función (no la instancia directa) porque los llamadores la obtienen de
 * `useScannerClient`, que la crea recién en el primer uso.
 */
export async function warpWithCorners(
  getClient: () => ScannerClient,
  file: File,
  corners: Corners,
  mode: ScanMode,
): Promise<WarpResult> {
  const bitmap = await decodeCapped(file)
  let result: ImageBitmap | null = null
  try {
    result = await getClient().warp(bitmap, corners, mode)
    const blob = await bitmapToBlob(result, JPEG_QUALITY)
    return { blob, url: URL.createObjectURL(blob) }
  } finally {
    // bitmapToBlob puede tirar (canvas sin contexto, toBlob devolviendo null
    // bajo presión de memoria): esto corre siempre igual.
    result?.close()
  }
}
```

- [ ] **Step 3: Agregar `detectAndWarp` — el camino automático completo, para la ráfaga de Múltiple**

```typescript
export interface DetectAndWarpResult extends WarpResult {
  corners: Corners
  /** false si la detección no encontró nada y se usó el rectángulo por defecto. */
  detected: boolean
}

/**
 * Decodifica, detecta esquinas (con reserva a las por defecto si falla) y
 * endereza. Es el camino sin intervención que usa la ráfaga de Múltiple: ahí
 * no hay pantalla de ajuste intermedia, así que una detección fallida no
 * bloquea nada — la corrección queda para la revisión, después.
 *
 * Decodifica el archivo dos veces (una para medir/detectar, otra para
 * enderezar) porque `ScannerClient.detect` transfiere el primer bitmap al
 * worker y lo deja inutilizable — mismo patrón que ya usa `scan-modal.tsx`
 * hoy entre `handleFile` y `runWarp`.
 */
export async function detectAndWarp(
  getClient: () => ScannerClient,
  file: File,
  mode: ScanMode,
): Promise<DetectAndWarpResult> {
  const detectBitmap = await decodeCapped(file)
  const width = detectBitmap.width
  const height = detectBitmap.height

  let corners: Corners
  let detected = false
  try {
    const found = await getClient().detect(detectBitmap)
    if (found) {
      corners = found
      detected = true
    } else {
      corners = defaultCorners(width, height)
    }
  } catch {
    corners = defaultCorners(width, height)
  }

  const { blob, url } = await warpWithCorners(getClient, file, corners, mode)
  return { blob, url, corners, detected }
}
```

- [ ] **Step 4: Escribir la prueba de las constantes**

```typescript
// lib/scanner/__tests__/capture.test.ts
import { describe, it, expect } from "vitest"
import { JPEG_QUALITY, MAX_INPUT_SIDE } from "../capture"

describe("capture", () => {
  it("expone constantes en rangos sensatos", () => {
    expect(JPEG_QUALITY).toBeGreaterThan(0)
    expect(JPEG_QUALITY).toBeLessThanOrEqual(1)
    expect(MAX_INPUT_SIDE).toBeGreaterThan(1000)
  })
})
```

`decodeCapped`, `bitmapToBlob`, `warpWithCorners` y `detectAndWarp` dependen de `createImageBitmap`/`canvas`, no disponibles en el entorno `node` de vitest — se verifican en navegador real en las Tareas 9 y 10, no acá.

- [ ] **Step 5: Correr la prueba**

Run: `npx vitest run lib/scanner/__tests__/capture.test.ts`
Expected: PASS, 1 test.

- [ ] **Step 6: Verificar tipos**

Run: `npx tsc --noEmit`
Expected: mismo único error preexistente en `lib/pdf/image-to-pdf.ts:46` (ajeno a este cambio), ningún error nuevo.

- [ ] **Step 7: Commit**

```bash
git add lib/scanner/capture.ts lib/scanner/__tests__/capture.test.ts
git commit -m "feat: extraer decodificar/enderezar del scanner a un modulo compartido"
```

---

### Task 2: `lib/scanner/export.ts` — armar el PDF combinado

**Files:**
- Create: `lib/scanner/export.ts`
- Test: `lib/scanner/__tests__/export.test.ts`

**Interfaces:**
- Consumes: `PDFDocument` de `@cantoo/pdf-lib`.
- Produces: `imagesToPdf(blobs: Blob[], name: string): Promise<File>`. Usado por `simple-scan.tsx` (PDF de una página), `multi-scan-review.tsx` (PDF único de todas las páginas, y una vez por página para el ZIP de PDFs).

Esta función ya existe hoy, inline y sin probar, en `scan-modal.tsx`. Se mueve tal cual (mismo comportamiento) y se le agrega una prueba directa, porque en este plan pasa a tener tres consumidores distintos.

- [ ] **Step 1: Escribir la prueba primero**

```typescript
// lib/scanner/__tests__/export.test.ts
import { describe, it, expect } from "vitest"
import { PDFDocument } from "@cantoo/pdf-lib"
import { imagesToPdf } from "../export"

/** JPEG 2x2 blanco mínimo, para no depender de un archivo de fixture. */
const TINY_JPEG_BASE64 =
  "/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAMCAgICAgMCAgIDAwMDBAYEBAQEBAgGBgUGCQgKCgkICQkKDA8MCgsOCwkJDRENDg8QEBEQCgwSExIQEw8QEBD/wAALCAACAAIBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AVN//2Q=="

function tinyJpegBlob(): Blob {
  const bytes = Uint8Array.from(atob(TINY_JPEG_BASE64), (c) => c.charCodeAt(0))
  return new Blob([bytes], { type: "image/jpeg" })
}

describe("imagesToPdf", () => {
  it("arma un PDF con una página por blob, en orden", async () => {
    const file = await imagesToPdf([tinyJpegBlob(), tinyJpegBlob(), tinyJpegBlob()], "prueba")
    expect(file.name).toBe("prueba.pdf")
    expect(file.type).toBe("application/pdf")

    const bytes = new Uint8Array(await file.arrayBuffer())
    const doc = await PDFDocument.load(bytes)
    expect(doc.getPageCount()).toBe(3)
  })

  it("con un solo blob arma un PDF de una página", async () => {
    const file = await imagesToPdf([tinyJpegBlob()], "una-sola")
    const bytes = new Uint8Array(await file.arrayBuffer())
    const doc = await PDFDocument.load(bytes)
    expect(doc.getPageCount()).toBe(1)
  })
})
```

- [ ] **Step 2: Correr la prueba para confirmar que falla**

Run: `npx vitest run lib/scanner/__tests__/export.test.ts`
Expected: FAIL — `Cannot find module '../export'`.

- [ ] **Step 3: Crear `export.ts`, moviendo la función tal cual está hoy en `scan-modal.tsx`**

```typescript
// lib/scanner/export.ts
import { PDFDocument } from "@cantoo/pdf-lib"

/**
 * Igual que capture.ts: código de empaquetado, no el motor de procesamiento
 * — no hace falta portarlo a controldoc-holding (ver CLAUDE.local.md).
 */

/**
 * Arma un PDF con un blob por página, en el orden dado. Las páginas
 * procesadas por el scanner son JPEG, pero "guardar sin enderezar" puede
 * meter el archivo original tal cual, que a veces es PNG — de ahí la
 * detección por los primeros bytes en vez de confiar en `blob.type`.
 */
export async function imagesToPdf(blobs: Blob[], name: string): Promise<File> {
  const doc = await PDFDocument.create()
  for (const blob of blobs) {
    const bytes = new Uint8Array(await blob.arrayBuffer())
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
```

- [ ] **Step 4: Correr la prueba de nuevo**

Run: `npx vitest run lib/scanner/__tests__/export.test.ts`
Expected: PASS, 2 tests.

- [ ] **Step 5: Verificar tipos**

Run: `npx tsc --noEmit`
Expected: mismo único error preexistente, ninguno nuevo.

- [ ] **Step 6: Commit**

```bash
git add lib/scanner/export.ts lib/scanner/__tests__/export.test.ts
git commit -m "feat: extraer armado de PDF del scanner a un modulo probado"
```

---

### Task 3: `use-scanner-client.ts` — hook del ciclo de vida del cliente

**Files:**
- Create: `components/editor/scanner/use-scanner-client.ts`

**Interfaces:**
- Consumes: `ScannerClient` de `lib/scanner/client.ts`.
- Produces: `useScannerClient(): () => ScannerClient`. Usado por `simple-scan.tsx` y `multi-scan.tsx`, uno cada uno — son componentes separados, cada uno con su propio worker.

Esto es el mismo patrón `clientRef` + `getClient` + terminar al desmontar que hoy vive inline en `scan-modal.tsx`, extraído sin cambios de comportamiento. No es testeable con vitest (crea un `Worker` real, DOM-only) — se verifica de forma indirecta en las Tareas 9 y 10, donde si el cliente no se limpiara bien el worker quedaría vivo entre capturas y se notaría en el navegador (memoria, o un segundo `ScannerClient` fallando).

- [ ] **Step 1: Crear el hook**

```typescript
// components/editor/scanner/use-scanner-client.ts
"use client"

import { useCallback, useEffect, useRef } from "react"
import { ScannerClient } from "@/lib/scanner/client"

/**
 * Crea un `ScannerClient` perezoso (recién en el primer uso) y lo termina al
 * desmontar el componente que llama a este hook. Cada modo del scanner
 * (Simple, Múltiple) llama a esto una vez y tiene su propio worker — no se
 * comparte instancia entre modos.
 */
export function useScannerClient(): () => ScannerClient {
  const clientRef = useRef<ScannerClient | null>(null)

  useEffect(
    () => () => {
      clientRef.current?.terminate()
      clientRef.current = null
    },
    [],
  )

  return useCallback(() => {
    if (!clientRef.current) clientRef.current = new ScannerClient()
    return clientRef.current
  }, [])
}
```

- [ ] **Step 2: Verificar tipos**

Run: `npx tsc --noEmit`
Expected: mismo único error preexistente, ninguno nuevo.

- [ ] **Step 3: Commit**

```bash
git add components/editor/scanner/use-scanner-client.ts
git commit -m "feat: extraer ciclo de vida de ScannerClient a un hook"
```

---

### Task 4: `scan-page-strip.tsx` — estado de procesamiento y miniaturas tocables

**Files:**
- Modify: `components/editor/scanner/scan-page-strip.tsx`

**Interfaces:**
- Consumes: nada nuevo.
- Produces: `ScanPageStripProps` ampliada con `status` por página y `onSelect`. Usado por `multi-scan-review.tsx` (Tarea 7) — es el único consumidor a partir de este plan (`scan-modal.tsx` deja de usarlo, ver Tarea 8).

Hoy este componente es una tira horizontal de miniaturas de 60×84 con un botón de borrar. Se le agregan tres cosas: un spinner sobre la miniatura mientras esa página todavía se está procesando en segundo plano, que tocar la miniatura dispare `onSelect` (para abrir la edición de esa página), y un modo de layout en grilla (en vez de scroll horizontal) para la pantalla de revisión, que es más grande que la tira que tenía hoy.

- [ ] **Step 1: Reescribir el componente completo**

```typescript
// components/editor/scanner/scan-page-strip.tsx
"use client"

import { Loader2, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

interface ScannedPageThumb {
  id: string
  dataUrl: string | null
  /** "processing": todavía en la cola de fondo, sin miniatura real todavía. */
  status?: "queued" | "processing" | "done" | "error"
}

interface ScanPageStripProps {
  pages: ScannedPageThumb[]
  onRemove: (id: string) => void
  /** Tocar la miniatura (no el botón de borrar) dispara esto. */
  onSelect?: (id: string) => void
  /** true: grilla que envuelve. false (default): tira con scroll horizontal. */
  wrap?: boolean
}

export function ScanPageStrip({ pages, onRemove, onSelect, wrap = false }: ScanPageStripProps) {
  if (pages.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-2 text-center">
        Sin páginas aún — capturá la primera hoja
      </p>
    )
  }

  return (
    <div className={cn("flex gap-2 pb-1", wrap ? "flex-wrap" : "overflow-x-auto")}>
      {pages.map((page, i) => (
        // El padding superior y derecho deja lugar para el boton de borrar, que
        // sobresale de la miniatura y necesita un area tocable decente.
        <div key={page.id} className="relative flex-shrink-0 pt-2 pr-2">
          <button
            type="button"
            onClick={() => onSelect?.(page.id)}
            disabled={!onSelect || page.status === "processing" || page.status === "queued"}
            className="block w-[60px] h-[84px] rounded border border-border overflow-hidden bg-muted disabled:cursor-default"
          >
            {page.dataUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={page.dataUrl}
                alt={`Página ${i + 1}`}
                className="w-full h-full object-cover"
                draggable={false}
              />
            )}
            {(page.status === "processing" || page.status === "queued") && (
              <div className="absolute inset-0 flex items-center justify-center bg-background/70">
                <Loader2 className="h-5 w-5 animate-spin text-primary" />
              </div>
            )}
            {page.status === "error" && (
              <div className="absolute inset-0 flex items-center justify-center bg-destructive/10 text-destructive text-[10px] text-center px-1">
                No se pudo procesar
              </div>
            )}
          </button>
          <span className="absolute bottom-0 left-0 right-0 text-center text-[10px] bg-black/50 text-white rounded-b leading-tight py-0.5 pointer-events-none">
            {i + 1}
          </span>
          <Button
            variant="destructive"
            size="icon"
            aria-label={`Borrar página ${i + 1}`}
            className="absolute top-0 right-0 h-7 w-7 rounded-full p-0 shadow-sm"
            onClick={() => onRemove(page.id)}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      ))}
    </div>
  )
}
```

Nota: `dataUrl` pasa a ser `string | null` (antes siempre `string`) porque una página recién encolada en Múltiple todavía no tiene miniatura — está procesándose. `status` es opcional para no romper la forma del tipo si algún día se reusa sin ese concepto.

- [ ] **Step 2: Verificar tipos**

Run: `npx tsc --noEmit`
Expected: mismo único error preexistente. Puede aparecer un error nuevo en `scan-modal.tsx` si todavía importa `ScanPageStrip` con la forma vieja — se resuelve en la Tarea 8, cuando se reescribe ese archivo. Si aparece acá, es esperado y se ignora hasta esa tarea.

- [ ] **Step 3: Commit**

```bash
git add components/editor/scanner/scan-page-strip.tsx
git commit -m "feat: estado de procesamiento y miniaturas tocables en ScanPageStrip"
```

---

### Task 5: `simple-scan.tsx` — el modo Simple completo

**Files:**
- Create: `components/editor/scanner/simple-scan.tsx`

**Interfaces:**
- Consumes: `useScannerClient` (Tarea 3), `decodeCapped`/`bitmapToBlob`/`warpWithCorners`/`JPEG_QUALITY` de `lib/scanner/capture.ts` (Tarea 1), `imagesToPdf` de `lib/scanner/export.ts` (Tarea 2), `triggerDownload` de `lib/pdf/utils.ts` (ya existe), `defaultCorners` de `lib/scanner/detect.ts`, `documentOverflowsFrame` de `lib/scanner/coords.ts`, `CornerEditor`, `ModeToggle`.
- Produces: `SimpleScan({ onClose, onBusyChange }: { onClose: () => void; onBusyChange: (busy: boolean) => void })`. Montado por `scan-modal.tsx` (Tarea 8).

`onBusyChange` reemplaza al `busy` que hoy calcula `scan-modal.tsx` mirando su propio `state` — como el estado ahora vive dentro de `SimpleScan`, este avisa hacia arriba cuándo no es seguro cerrar el diálogo (mismo criterio que hoy: detectando, enderezando o generando el PDF).

- [ ] **Step 1: Escribir el componente completo**

```typescript
// components/editor/scanner/simple-scan.tsx
"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { Camera, Check, Loader2, RotateCw, Share2, X } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { CornerEditor } from "./corner-editor"
import { ModeToggle } from "./mode-toggle"
import { useScannerClient } from "./use-scanner-client"
import {
  JPEG_QUALITY,
  bitmapToBlob,
  decodeCapped,
  warpWithCorners,
} from "@/lib/scanner/capture"
import { imagesToPdf } from "@/lib/scanner/export"
import { triggerDownload } from "@/lib/pdf/utils"
import { defaultCorners } from "@/lib/scanner/detect"
import { documentOverflowsFrame } from "@/lib/scanner/coords"
import type { Corners, ScanMode } from "@/lib/scanner/types"

type State = "idle" | "detecting" | "adjusting" | "warping" | "previewing"

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

/**
 * true si el navegador puede compartir un archivo con `navigator.share`.
 * `Navigator.share`/`canShare` ya vienen tipados en el lib.dom.d.ts de este
 * proyecto — no hace falta ningún cast, solo el chequeo en runtime, porque
 * son opcionales de verdad (no todos los navegadores los implementan).
 */
function canShareFile(file: File): boolean {
  return typeof navigator.share === "function" &&
    typeof navigator.canShare === "function" &&
    navigator.canShare({ files: [file] })
}

interface SimpleScanProps {
  onClose: () => void
  onBusyChange: (busy: boolean) => void
}

export function SimpleScan({ onClose, onBusyChange }: SimpleScanProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const getClient = useScannerClient()

  const [state, setState] = useState<State>("idle")
  const [capture, setCapture] = useState<Capture | null>(null)
  const [preview, setPreview] = useState<Preview | null>(null)
  const [mode, setMode] = useState<ScanMode>("document")
  const [degraded, setDegraded] = useState(false)
  const [previewBusy, setPreviewBusy] = useState(false)

  useEffect(() => {
    onBusyChange(state === "detecting" || state === "warping")
  }, [state, onBusyChange])

  // Revocar URLs de objeto al desmontar (se sale del modo Simple).
  useEffect(
    () => () => {
      if (capture) URL.revokeObjectURL(capture.url)
      if (preview) URL.revokeObjectURL(preview.url)
    },
    // Solo al desmontar: capture/preview cambian seguido y no queremos que
    // este efecto se repita en cada cambio, solo correr la limpieza final.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  )

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

  const runWarp = useCallback(
    async (cap: Capture) => {
      setState("warping")
      try {
        const { blob, url } = await warpWithCorners(getClient, cap.file, cap.corners, mode)
        setPreview((prev) => {
          if (prev) URL.revokeObjectURL(prev.url)
          return { url, blob }
        })
        setState("previewing")
        setDegraded(false)
      } catch (err) {
        setDegraded(true)
        toast.error(err instanceof Error ? err.message : "No se pudo procesar la página")
        setState("adjusting")
      }
    },
    [mode, getClient],
  )

  const confirmCorners = useCallback(() => {
    if (!capture) return
    void runWarp(capture)
  }, [capture, runWarp])

  const handleFile = useCallback(
    async (file: File) => {
      setState("detecting")

      let bitmap: ImageBitmap
      try {
        bitmap = await decodeCapped(file)
      } catch {
        toast.error("No se pudo leer la foto. Probá sacarla de nuevo.")
        setState("idle")
        return
      }

      const width = bitmap.width
      const height = bitmap.height

      let displayUrl: string
      try {
        const displayBlob = await bitmapToBlob(bitmap, JPEG_QUALITY)
        displayUrl = URL.createObjectURL(displayBlob)
      } catch {
        bitmap.close()
        toast.error("No se pudo leer la foto. Probá sacarla de nuevo.")
        setState("idle")
        return
      }

      let corners = defaultCorners(width, height)
      let detectedOk = false
      try {
        const detected = await getClient().detect(bitmap)
        if (detected) {
          corners = detected
          detectedOk = true
        } else {
          toast.info("No encontré los bordes. Ajustalos vos.")
        }
      } catch {
        setDegraded(true)
        toast.warning("La detección automática no está disponible. Ajustá los bordes a mano.")
      }

      const cap: Capture = { file, url: displayUrl, corners }
      setCapture(cap)

      if (detectedOk) {
        if (documentOverflowsFrame(corners, width, height)) {
          toast.warning("El documento se sale de la foto. Alejate un poco y sacala de nuevo.")
        }
        await runWarp(cap)
      } else {
        setState("adjusting")
      }
    },
    [getClient, runWarp],
  )

  const changeMode = useCallback(
    async (next: ScanMode) => {
      if (state !== "previewing") {
        setMode(next)
        return
      }
      const previous = mode
      setMode(next)
      setPreviewBusy(true)
      let result: ImageBitmap | null = null
      try {
        result = await getClient().restyle(next)
        const blob = await bitmapToBlob(result, JPEG_QUALITY)
        setPreview((prev) => {
          if (prev) URL.revokeObjectURL(prev.url)
          return { url: URL.createObjectURL(blob), blob }
        })
      } catch {
        setMode(previous)
        toast.error("No se pudo cambiar el modo")
      } finally {
        result?.close()
        setPreviewBusy(false)
      }
    },
    [state, mode, getClient],
  )

  const rotatePage = useCallback(async () => {
    if (state !== "previewing") return
    setPreviewBusy(true)
    let result: ImageBitmap | null = null
    try {
      result = await getClient().rotate(mode)
      const blob = await bitmapToBlob(result, JPEG_QUALITY)
      setPreview((prev) => {
        if (prev) URL.revokeObjectURL(prev.url)
        return { url: URL.createObjectURL(blob), blob }
      })
    } catch {
      toast.error("No se pudo girar la página")
    } finally {
      result?.close()
      setPreviewBusy(false)
    }
  }, [state, mode, getClient])

  const fileName = useCallback(() => `escaneo-${Date.now()}`, [])

  const saveImage = useCallback(() => {
    if (!preview) return
    triggerDownload(preview.blob, `${fileName()}.jpg`)
    toast.success("Imagen guardada")
  }, [preview, fileName])

  const shareImage = useCallback(async () => {
    if (!preview) return
    const file = new File([preview.blob], `${fileName()}.jpg`, { type: "image/jpeg" })
    try {
      await navigator.share({
        files: [file],
        title: "Documento escaneado",
      })
    } catch (err) {
      // El usuario cerró el panel de compartir sin elegir nada: no es un error.
      if (err instanceof Error && err.name === "AbortError") return
      toast.error("No se pudo compartir la imagen")
    }
  }, [preview, fileName])

  const downloadAsPdf = useCallback(async () => {
    if (!preview) return
    try {
      const file = await imagesToPdf([preview.blob], fileName())
      triggerDownload(file, file.name)
      toast.success("PDF guardado")
    } catch {
      toast.error("No se pudo generar el PDF")
    }
  }, [preview, fileName])

  const saveUnprocessed = useCallback(() => {
    if (!capture) return
    triggerDownload(capture.file, `${fileName()}.jpg`)
    toast.info("Imagen guardada sin enderezar")
    resetToIdle()
    getClient().release()
  }, [capture, fileName, resetToIdle, getClient])

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

  const scanAnother = useCallback(() => {
    getClient().release()
    resetToIdle()
    fileInputRef.current?.click()
  }, [getClient, resetToIdle])

  const busy = state === "detecting" || state === "warping"
  const previewFile = preview ? new File([preview.blob], `${fileName()}.jpg`, { type: "image/jpeg" }) : null
  const canShare = previewFile ? canShareFile(previewFile) : false

  return (
    <div className="space-y-3">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0]
          e.target.value = ""
          if (file) void handleFile(file)
        }}
      />

      <p className="text-sm text-muted-foreground">
        {state === "idle" && "Sacá una foto del documento con la cámara del celular"}
        {state === "detecting" && "Buscando los bordes del documento…"}
        {state === "adjusting" && "Ajustá las esquinas arrastrando los puntos"}
        {state === "warping" && "Enderezando y mejorando…"}
        {state === "previewing" && "Así queda. Probá otro modo si no te convence"}
      </p>

      {state === "idle" && (
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="w-full flex flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed py-16 hover:bg-muted/50 transition-colors"
        >
          <Camera className="h-10 w-10 text-muted-foreground" />
          <span className="text-sm font-medium">Sacar foto</span>
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
          <img src={preview.url} alt="Página procesada" className="w-full h-auto rounded-lg" />
          <div className="flex items-center gap-2">
            <div className="flex-1 min-w-0">
              <ModeToggle value={mode} onChange={changeMode} disabled={previewBusy} />
            </div>
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={rotatePage}
              disabled={previewBusy}
              aria-label="Girar 90 grados"
              title="Girar 90°"
              className="shrink-0"
            >
              <RotateCw className="h-4 w-4" />
            </Button>
          </div>

          <div className="flex gap-2">
            <Button onClick={saveImage} disabled={previewBusy} className="flex-1">
              <Check className="h-4 w-4 mr-1" />
              Guardar
            </Button>
            {canShare && (
              <Button variant="outline" onClick={shareImage} disabled={previewBusy} className="flex-1">
                <Share2 className="h-4 w-4 mr-1" />
                Compartir
              </Button>
            )}
          </div>

          <Button variant="ghost" onClick={downloadAsPdf} disabled={previewBusy} className="w-full text-xs">
            Descargar como PDF
          </Button>

          <div className="flex gap-2">
            <Button variant="outline" onClick={backToCorners} className="flex-1">
              Ajustar esquinas
            </Button>
            <Button variant="outline" onClick={scanAnother} disabled={previewBusy} className="flex-1">
              <Camera className="h-4 w-4 mr-1" />
              Escanear otra
            </Button>
          </div>

          <Button
            variant="ghost"
            onClick={discardCapture}
            disabled={previewBusy}
            className="w-full text-muted-foreground"
          >
            <X className="h-4 w-4 mr-1" />
            Descartar esta foto
          </Button>
        </div>
      )}

      {state === "idle" && (
        <Button variant="ghost" onClick={onClose} className="w-full text-muted-foreground">
          Volver
        </Button>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Verificar tipos**

Run: `npx tsc --noEmit`
Expected: mismo único error preexistente, ninguno nuevo. `ShareData` es un tipo del DOM lib estándar de TypeScript (`lib.dom.d.ts`) — no requiere una dependencia nueva.

- [ ] **Step 3: Commit**

```bash
git add components/editor/scanner/simple-scan.tsx
git commit -m "feat: modo Simple del scanner - captura, guardar, compartir, PDF"
```

---

### Task 6: `multi-scan.tsx` — la ráfaga de captura

**Files:**
- Create: `components/editor/scanner/multi-scan.tsx`

**Interfaces:**
- Consumes: `useScannerClient` (Tarea 3), `detectAndWarp`/`warpWithCorners`/`JPEG_QUALITY` de `lib/scanner/capture.ts` (Tarea 1), `ScanPageStrip` (Tarea 4), `MultiScanReview` (Tarea 7).
- Produces: `MultiPage` (tipo, exportado para que `multi-scan-review.tsx` lo importe con `import type`), `MultiScan({ onClose, onBusyChange }: { onClose: () => void; onBusyChange: (busy: boolean) => void })`. Montado por `scan-modal.tsx` (Tarea 8).

La cola se procesa de a una foto por vez, ver la sección 5.2 de la spec. El pump de la cola es imperativo (se llama a sí mismo al terminar, y se dispara al encolar), no una reacción a que cambie el arreglo de páginas — así una foto nueva encolada mientras otra está a mitad de proceso nunca aborta el trabajo en curso.

- [ ] **Step 1: Escribir el componente completo**

```typescript
// components/editor/scanner/multi-scan.tsx
"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { Camera, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ScanPageStrip } from "./scan-page-strip"
import { MultiScanReview } from "./multi-scan-review"
import { useScannerClient } from "./use-scanner-client"
import { detectAndWarp } from "@/lib/scanner/capture"
import type { Corners, ScanMode } from "@/lib/scanner/types"

export interface MultiPage {
  id: string
  file: File
  status: "queued" | "processing" | "done" | "error"
  corners: Corners | null
  mode: ScanMode
  result: { blob: Blob; url: string } | null
  errorMessage: string | null
}

interface MultiScanProps {
  onClose: () => void
  onBusyChange: (busy: boolean) => void
}

export function MultiScan({ onClose, onBusyChange }: MultiScanProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const getClient = useScannerClient()

  const [screen, setScreen] = useState<"capturing" | "reviewing">("capturing")
  const [pages, setPages] = useState<MultiPage[]>([])

  /** Espejo de `pages` para que `processNext` lea el estado fresco sin
   *  necesitar recrearse en cada captura — mismo patrón que `cornersRef` en
   *  corner-editor.tsx. */
  const pagesRef = useRef<MultiPage[]>([])
  useEffect(() => {
    pagesRef.current = pages
  }, [pages])

  const queueRef = useRef<string[]>([])
  const processingRef = useRef(false)

  useEffect(() => {
    onBusyChange(false) // la ráfaga nunca bloquea el cierre: ver manejo de errores en la spec
  }, [onBusyChange])

  // Revocar las URLs de objeto generadas al desmontar (se sale del modo Múltiple).
  useEffect(
    () => () => {
      pagesRef.current.forEach((p) => {
        if (p.result) URL.revokeObjectURL(p.result.url)
      })
    },
    [],
  )

  const processNext = useCallback(async () => {
    if (processingRef.current) return
    const id = queueRef.current.shift()
    if (!id) return

    processingRef.current = true
    setPages((prev) => prev.map((p) => (p.id === id ? { ...p, status: "processing" } : p)))

    try {
      const target = pagesRef.current.find((p) => p.id === id)
      if (!target) return // se eliminó de la lista mientras esperaba en la cola
      const { blob, url, corners } = await detectAndWarp(getClient, target.file, target.mode)
      setPages((prev) =>
        prev.map((p) => (p.id === id ? { ...p, status: "done", corners, result: { blob, url } } : p)),
      )
    } catch (err) {
      setPages((prev) =>
        prev.map((p) =>
          p.id === id
            ? {
                ...p,
                status: "error",
                errorMessage: err instanceof Error ? err.message : "No se pudo procesar",
              }
            : p,
        ),
      )
    } finally {
      processingRef.current = false
      void processNext() // sigue con lo que haya quedado en la cola, si hay
    }
  }, [getClient])

  const enqueueCapture = useCallback(
    (file: File) => {
      const id = crypto.randomUUID()
      setPages((prev) => [
        ...prev,
        { id, file, status: "queued", corners: null, mode: "document", result: null, errorMessage: null },
      ])
      queueRef.current.push(id)
      void processNext()
    },
    [processNext],
  )

  const handleFile = useCallback(
    (file: File) => {
      enqueueCapture(file)
      // Se intenta reabrir la cámara en el mismo instante, sin esperar nada
      // de por medio: si el navegador lo permite, la ráfaga se siente
      // continua. Si lo bloquea, no pasa nada — el botón "Sacar otra" sigue
      // ahí para seguir a mano. Ver Tarea 10: esto no se da por andando
      // hasta verificarlo en un navegador real.
      fileInputRef.current?.click()
    },
    [enqueueCapture],
  )

  const removePage = useCallback((id: string) => {
    setPages((prev) => {
      const target = prev.find((p) => p.id === id)
      if (target?.result) URL.revokeObjectURL(target.result.url)
      return prev.filter((p) => p.id !== id)
    })
  }, [])

  const updatePage = useCallback((id: string, patch: Partial<MultiPage>) => {
    setPages((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)))
  }, [])

  if (screen === "reviewing") {
    return (
      <MultiScanReview
        pages={pages}
        getClient={getClient}
        onRemove={removePage}
        onUpdate={updatePage}
        onBackToCapture={() => setScreen("capturing")}
        onClose={onClose}
      />
    )
  }

  return (
    <div className="space-y-3">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0]
          e.target.value = ""
          if (file) handleFile(file)
        }}
      />

      <p className="text-sm text-muted-foreground">
        Segui sacando fotos — se procesan solas de fondo. Cerrá con la X cuando termines.
      </p>

      <ScanPageStrip
        pages={pages.map((p) => ({ id: p.id, dataUrl: p.result?.url ?? null, status: p.status }))}
        onRemove={removePage}
      />

      <Button
        type="button"
        onClick={() => fileInputRef.current?.click()}
        className="w-full flex items-center justify-center gap-2 py-6"
      >
        <Camera className="h-5 w-5" />
        {pages.length === 0 ? "Sacar foto" : "Sacar otra"}
      </Button>

      <Button
        type="button"
        variant="outline"
        onClick={() => (pages.length > 0 ? setScreen("reviewing") : onClose())}
        className="w-full"
      >
        <X className="h-4 w-4 mr-1" />
        {pages.length > 0 ? "Terminar y revisar" : "Cancelar"}
      </Button>
    </div>
  )
}
```

Nota sobre `onBusyChange(false)` fijo: a diferencia de Simple (donde detectar/enderezar bloquea el cierre porque hay una sola captura en vuelo), en Múltiple el procesamiento es siempre de fondo — cerrar el diálogo mientras una foto se procesa no bloquea nada, así que nunca hace falta impedir el cierre desde acá.

- [ ] **Step 2: Verificar tipos**

Este paso va a fallar hasta la Tarea 7, porque `multi-scan-review.tsx` todavía no existe. Se deja así a propósito — la Tarea 7 lo completa. No hacer commit todavía.

Run: `npx tsc --noEmit`
Expected: error `Cannot find module './multi-scan-review'` — esperado, se resuelve en la Tarea 7.

---

### Task 7: `multi-scan-review.tsx` — revisión, edición por página y exportar

**Files:**
- Create: `components/editor/scanner/multi-scan-review.tsx`

**Interfaces:**
- Consumes: `MultiPage` (tipo) de `multi-scan.tsx` (Tarea 6, `import type`), `warpWithCorners`/`JPEG_QUALITY`/`decodeCapped` de `lib/scanner/capture.ts` (Tarea 1), `imagesToPdf` de `lib/scanner/export.ts` (Tarea 2), `triggerDownload`/`downloadZip` de `lib/pdf/utils.ts` (ya existen), `ScanPageStrip` (Tarea 4), `CornerEditor`, `ModeToggle`, `defaultCorners`.
- Produces: `MultiScanReview({ pages, getClient, onRemove, onUpdate, onBackToCapture, onClose }: MultiScanReviewProps)`.

`import type { MultiPage } from "./multi-scan"` no crea una dependencia circular real: al ser `import type`, se borra por completo en tiempo de compilación (TypeScript lo verifica, no queda ningún `require`/`import` en el JS emitido) — es el mismo patrón que ya usa el proyecto para tipos compartidos entre archivos que se importan entre sí.

- [ ] **Step 1: Escribir el componente completo**

```typescript
// components/editor/scanner/multi-scan-review.tsx
"use client"

import { useCallback, useRef, useState } from "react"
import { Check, FileArchive, FileText } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { CornerEditor } from "./corner-editor"
import { ModeToggle } from "./mode-toggle"
import { ScanPageStrip } from "./scan-page-strip"
import { warpWithCorners, decodeCapped, JPEG_QUALITY } from "@/lib/scanner/capture"
import { imagesToPdf } from "@/lib/scanner/export"
import { triggerDownload, downloadZip } from "@/lib/pdf/utils"
import { defaultCorners } from "@/lib/scanner/detect"
import type { ScannerClient } from "@/lib/scanner/client"
import type { ScanMode } from "@/lib/scanner/types"
import type { MultiPage } from "./multi-scan"

interface MultiScanReviewProps {
  pages: MultiPage[]
  getClient: () => ScannerClient
  onRemove: (id: string) => void
  onUpdate: (id: string, patch: Partial<MultiPage>) => void
  onBackToCapture: () => void
  onClose: () => void
}

export function MultiScanReview({
  pages,
  getClient,
  onRemove,
  onUpdate,
  onBackToCapture,
  onClose,
}: MultiScanReviewProps) {
  const [editingId, setEditingId] = useState<string | null>(null)
  const [exporting, setExporting] = useState(false)

  const editingPage = pages.find((p) => p.id === editingId) ?? null
  const donePages = pages.filter((p) => p.status === "done" && p.result)

  const startEdit = useCallback((id: string) => {
    const target = pages.find((p) => p.id === id)
    // "queued"/"processing": todavía no hay nada que mostrar, el toque en la
    // miniatura ya está deshabilitado en ScanPageStrip para estos casos, pero
    // se repite la guarda acá por si se llama a startEdit desde otro lado.
    if (!target || target.status === "processing" || target.status === "queued") return
    setEditingId(id)
  }, [pages])

  const confirmEdit = useCallback(
    async (corners: MultiPage["corners"], mode: ScanMode) => {
      if (!editingPage || !corners) return
      onUpdate(editingPage.id, { status: "processing" })
      try {
        const { blob, url } = await warpWithCorners(getClient, editingPage.file, corners, mode)
        if (editingPage.result) URL.revokeObjectURL(editingPage.result.url)
        onUpdate(editingPage.id, { status: "done", corners, mode, result: { blob, url } })
        setEditingId(null)
      } catch (err) {
        onUpdate(editingPage.id, {
          status: "error",
          errorMessage: err instanceof Error ? err.message : "No se pudo procesar",
        })
      }
    },
    [editingPage, onUpdate, getClient],
  )

  const retakePage = useCallback(
    async (id: string, file: File) => {
      onUpdate(id, { status: "processing", file })
      try {
        // Se detectan esquinas de nuevo para la foto nueva, no se reusan las
        // viejas — son de un encuadre distinto.
        const bitmap = await decodeCapped(file)
        const detected = await getClient().detect(bitmap).catch(() => null)
        const corners = detected ?? defaultCorners(bitmap.width, bitmap.height)
        const { blob, url } = await warpWithCorners(getClient, file, corners, "document")
        const previousResult = pages.find((p) => p.id === id)?.result
        if (previousResult) URL.revokeObjectURL(previousResult.url)
        onUpdate(id, { status: "done", corners, mode: "document", result: { blob, url } })
      } catch (err) {
        onUpdate(id, {
          status: "error",
          errorMessage: err instanceof Error ? err.message : "No se pudo procesar",
        })
      }
    },
    [getClient, onUpdate, pages],
  )

  const exportName = useCallback(() => `escaneo-${Date.now()}`, [])

  const exportSinglePdf = useCallback(async () => {
    if (donePages.length === 0) return
    setExporting(true)
    try {
      const file = await imagesToPdf(donePages.map((p) => p.result!.blob), exportName())
      triggerDownload(file, file.name)
      toast.success("PDF guardado")
    } catch {
      toast.error("No se pudo generar el PDF")
    } finally {
      setExporting(false)
    }
  }, [donePages, exportName])

  const exportZipOfPdfs = useCallback(async () => {
    if (donePages.length === 0) return
    setExporting(true)
    try {
      const entries = await Promise.all(
        donePages.map(async (p, i) => {
          const file = await imagesToPdf([p.result!.blob], `pagina-${i + 1}`)
          return { name: file.name, data: file }
        }),
      )
      await downloadZip(entries, `${exportName()}-pdfs.zip`)
      toast.success("ZIP guardado")
    } catch {
      toast.error("No se pudo generar el ZIP")
    } finally {
      setExporting(false)
    }
  }, [donePages, exportName])

  const exportZipOfImages = useCallback(async () => {
    if (donePages.length === 0) return
    setExporting(true)
    try {
      const entries = donePages.map((p, i) => ({
        name: `pagina-${i + 1}.jpg`,
        data: p.result!.blob,
      }))
      await downloadZip(entries, `${exportName()}-imagenes.zip`)
      toast.success("ZIP guardado")
    } catch {
      toast.error("No se pudo generar el ZIP")
    } finally {
      setExporting(false)
    }
  }, [donePages, exportName])

  if (editingPage) {
    return (
      <PageEditor
        page={editingPage}
        onConfirm={confirmEdit}
        onRetake={(file) => {
          void retakePage(editingPage.id, file)
          setEditingId(null)
        }}
        onCancel={() => setEditingId(null)}
      />
    )
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        {pages.length} página(s) — tocá una para ajustarla o volver a sacarla
      </p>

      <ScanPageStrip
        pages={pages.map((p) => ({ id: p.id, dataUrl: p.result?.url ?? null, status: p.status }))}
        onRemove={onRemove}
        onSelect={startEdit}
        wrap
      />

      <div className="grid grid-cols-1 gap-2">
        <Button onClick={exportSinglePdf} disabled={exporting || donePages.length === 0} className="w-full">
          <FileText className="h-4 w-4 mr-1" />
          Descargar como un PDF único
        </Button>
        <Button
          variant="outline"
          onClick={exportZipOfPdfs}
          disabled={exporting || donePages.length === 0}
          className="w-full"
        >
          <FileArchive className="h-4 w-4 mr-1" />
          ZIP con un PDF por página
        </Button>
        <Button
          variant="outline"
          onClick={exportZipOfImages}
          disabled={exporting || donePages.length === 0}
          className="w-full"
        >
          <FileArchive className="h-4 w-4 mr-1" />
          ZIP de imágenes
        </Button>
      </div>

      <div className="flex gap-2">
        <Button variant="ghost" onClick={onBackToCapture} className="flex-1">
          Seguir capturando
        </Button>
        <Button variant="ghost" onClick={onClose} className="flex-1 text-muted-foreground">
          <Check className="h-4 w-4 mr-1" />
          Listo
        </Button>
      </div>
    </div>
  )
}

interface PageEditorProps {
  page: MultiPage
  onConfirm: (corners: MultiPage["corners"], mode: ScanMode) => void
  onRetake: (file: File) => void
  onCancel: () => void
}

/**
 * Edición de una sola página: ajustar esquinas, cambiar modo, o volver a
 * sacarla. Una página en "error" no tiene `corners` ni `result` — no hay nada
 * que editar, así que se muestra el motivo y la única salida es volver a
 * sacarla o volver a la grilla. Sin esta rama, `!corners || !imageUrl` caía
 * en un `return null` — pantalla en blanco, un callejón sin salida.
 */
function PageEditor({ page, onConfirm, onRetake, onCancel }: PageEditorProps) {
  const [corners, setCorners] = useState(page.corners)
  const [mode, setMode] = useState<ScanMode>(page.mode)
  const retakeInputRef = useRef<HTMLInputElement>(null)
  const imageUrl = page.result?.url ?? null
  const broken = page.status === "error" || !corners || !imageUrl

  return (
    <div className="space-y-3">
      <input
        ref={retakeInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0]
          e.target.value = ""
          if (file) onRetake(file)
        }}
      />

      {broken ? (
        <p className="text-sm text-destructive">
          {page.errorMessage ?? "No se pudo procesar esta página."}
        </p>
      ) : (
        <>
          <CornerEditor imageUrl={imageUrl!} corners={corners!} onChange={setCorners} />
          <ModeToggle value={mode} onChange={setMode} />
        </>
      )}

      <div className="flex gap-2">
        <Button variant="outline" onClick={onCancel} className="flex-1">
          {broken ? "Volver" : "Cancelar"}
        </Button>
        {!broken && (
          <Button onClick={() => onConfirm(corners, mode)} className="flex-1">
            <Check className="h-4 w-4 mr-1" />
            Confirmar
          </Button>
        )}
      </div>

      <Button variant="ghost" onClick={() => retakeInputRef.current?.click()} className="w-full text-xs">
        Volver a sacar esta página
      </Button>
    </div>
  )
}
```

- [ ] **Step 2: Verificar tipos, ahora que Tarea 6 y 7 están las dos**

Run: `npx tsc --noEmit`
Expected: mismo único error preexistente en `lib/pdf/image-to-pdf.ts:46`, ninguno nuevo.

- [ ] **Step 3: Commit conjunto de las Tareas 6 y 7**

```bash
git add components/editor/scanner/multi-scan.tsx components/editor/scanner/multi-scan-review.tsx
git commit -m "feat: modo Multiple del scanner - rafaga, revision y exportar"
```

---

### Task 8: `scan-modal.tsx` — selector de modo

**Files:**
- Modify: `components/editor/scanner/scan-modal.tsx` (reescritura completa)

**Interfaces:**
- Consumes: `SimpleScan` (Tarea 5), `MultiScan` (Tarea 6).
- Produces: `ScanModal({ open, onOpenChange }: ScanModalProps)` — **misma firma pública que hoy**, así que `pdf-editor.tsx` no necesita ningún cambio.

- [ ] **Step 1: Reescribir el archivo completo**

```typescript
// components/editor/scanner/scan-modal.tsx
"use client"

import { useCallback, useEffect, useState } from "react"
import { FileStack, ScanLine } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { SimpleScan } from "./simple-scan"
import { MultiScan } from "./multi-scan"

type Mode = "select" | "simple" | "multi"

interface ScanModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

/**
 * El scanner es una herramienta aparte del editor de PDF: lo que se escanea
 * se guarda o comparte desde acá mismo, no se manda al documento que se está
 * armando en el editor principal. Ver
 * docs/superpowers/specs/2026-08-16-scanner-modos-simple-multiple-design.md.
 */
export function ScanModal({ open, onOpenChange }: ScanModalProps) {
  const [mode, setMode] = useState<Mode>("select")
  const [busy, setBusy] = useState(false)

  // Al cerrar el diálogo, siempre se vuelve a la selección de modo. Esto
  // desmonta a SimpleScan/MultiScan (Radix no renderiza los hijos de
  // DialogContent mientras open=false), lo que dispara su propia limpieza
  // (terminar el ScannerClient, revocar URLs de objeto) sin que este
  // componente necesite saber nada de esos detalles.
  useEffect(() => {
    if (!open) {
      setMode("select")
      setBusy(false)
    }
  }, [open])

  const close = useCallback(() => onOpenChange(false), [onOpenChange])

  return (
    <Dialog open={open} onOpenChange={(next) => !busy && onOpenChange(next)}>
      <DialogContent className="sm:max-w-2xl max-sm:max-w-full max-sm:h-dvh max-sm:rounded-none max-sm:m-0 flex flex-col gap-0 p-0">
        <DialogHeader className="px-5 pt-4 pb-2 shrink-0">
          <DialogTitle>Escanear documento</DialogTitle>
          <DialogDescription>
            {mode === "select" && "Elegí cómo querés escanear"}
            {mode === "simple" && "Una foto, la guardás o la compartís"}
            {mode === "multi" && "Sacá todas las hojas que necesites"}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-4 pb-4 space-y-3 min-h-0">
          {mode === "select" && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 py-4">
              <button
                type="button"
                onClick={() => setMode("simple")}
                className="flex flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed py-12 hover:bg-muted/50 transition-colors"
              >
                <ScanLine className="h-10 w-10 text-muted-foreground" />
                <span className="text-sm font-medium">Escaneo simple</span>
                <span className="text-xs text-muted-foreground px-4 text-center">
                  Una sola foto, la guardás o compartís al toque
                </span>
              </button>
              <button
                type="button"
                onClick={() => setMode("multi")}
                className="flex flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed py-12 hover:bg-muted/50 transition-colors"
              >
                <FileStack className="h-10 w-10 text-muted-foreground" />
                <span className="text-sm font-medium">Escaneo múltiple</span>
                <span className="text-xs text-muted-foreground px-4 text-center">
                  Varias hojas seguidas, revisás y exportás al final
                </span>
              </button>
            </div>
          )}

          {mode === "simple" && <SimpleScan onClose={close} onBusyChange={setBusy} />}
          {mode === "multi" && <MultiScan onClose={close} onBusyChange={setBusy} />}
        </div>
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Step 2: Borrar `ScannedPage`/`Capture`/`Preview`/`imagesToPdf`/`decodeCapped`/`bitmapToBlob` de cualquier otro lugar que los duplique**

Confirmar que no queda ninguna copia vieja de estas funciones fuera de `lib/scanner/capture.ts` y `lib/scanner/export.ts`:

Run: `grep -rn "async function decodeCapped\|async function bitmapToBlob\|async function imagesToPdf" components/ lib/`
Expected: cada función aparece una sola vez, en `lib/scanner/capture.ts` o `lib/scanner/export.ts` — ninguna en `components/`.

- [ ] **Step 3: Verificar tipos**

Run: `npx tsc --noEmit`
Expected: mismo único error preexistente en `lib/pdf/image-to-pdf.ts:46`, ninguno nuevo.

- [ ] **Step 4: Correr toda la suite existente**

Run: `npx vitest run`
Expected: PASS, mismos archivos y cantidad de tests que antes de este plan (51 + los nuevos de `capture.test.ts` y `export.test.ts` de las Tareas 1 y 2 — 51 + 1 + 2 = 54).

- [ ] **Step 5: Commit**

```bash
git add components/editor/scanner/scan-modal.tsx
git commit -m "feat: scan-modal.tsx pasa a ser el selector de modo Simple/Multiple"
```

---

### Task 9: Verificación en navegador real — modo Simple

**Files:** ninguno (solo verificación).

No se da por terminado el modo Simple sin esto — mismo principio que las tareas de verificación de los specs anteriores del scanner.

- [ ] **Step 1: Build de producción**

```bash
npm run build
```
Expected: build sin errores.

- [ ] **Step 2: Levantar el server de producción**

```bash
npx next start -p 3210
```

- [ ] **Step 3: Con Playwright (o el navegador a mano), verificar el flujo completo**

1. Abrir el scanner → aparece la pantalla de elección con dos botones.
2. Tocar "Escaneo simple" → se abre el selector de cámara (`input[capture="environment"]`).
3. Subir una foto de prueba (cualquiera de `lib/scanner/__tests__/photos/`) → se llega a la vista previa.
4. Tocar "Guardar" → confirmar que dispara una descarga real (evento de descarga del navegador, no solo que no tire error).
5. Confirmar que el botón "Compartir" aparece si `navigator.canShare` lo permite en ese navegador, y no rompe nada si no aparece.
6. Tocar "Descargar como PDF" → confirmar que el archivo descargado abre y tiene una página.
7. Tocar "Escanear otra" → vuelve a abrir el selector de cámara.
8. Tocar "Descartar esta foto" → vuelve a la pantalla de "Sacar foto" sin nada guardado.

- [ ] **Step 4: Si algo del Step 3 falla, arreglar antes de seguir a la Tarea 10**

El modo Simple tiene que andar de punta a punta en un navegador real antes de invertir tiempo en Múltiple, que es más grande.

No hay commit en esta tarea — es solo verificación. Si hizo falta un arreglo, ese arreglo lleva su propio commit chico.

---

### Task 10: Verificación en navegador real — modo Múltiple, y regresión final

**Files:** ninguno (solo verificación).

Esta es la tarea que decide si el intento automático de reabrir la cámara (Tarea 6, `handleFile`) se puede confiar tal como está o si hay que asumir directamente que siempre hace falta el toque manual — ver spec, sección 5.1, y Global Constraints de este plan.

- [ ] **Step 1: Con el mismo server de producción de la Tarea 9, verificar el flujo de Múltiple**

1. Tocar "Escaneo múltiple" → se abre la cámara de inmediato.
2. Sacar una foto → confirmar en la consola/red si la cámara se reabre sola o si queda esperando el toque en "Sacar otra". **Anotar cuál pasó** — determina si en un futuro ajuste conviene invertir tiempo en mejorar el intento automático o asumir que siempre hace falta el toque.
3. Sacar 3 fotos seguidas (a mano o automático según lo que haya dado el Step anterior) → confirmar que la tira de miniaturas se va completando sola, con el spinner mientras cada una procesa, sin que haya que esperar a que termine una para seguir sacando.
4. Tocar la X ("Terminar y revisar") → se llega a la grilla de revisión con las 3 páginas.
5. Tocar una miniatura → se abre el editor de esa página con las esquinas detectadas.
6. Cambiar el modo de esa página y confirmar → vuelve a la grilla con esa miniatura actualizada, las otras dos intactas.
7. En otra página, tocar "Volver a sacar esta página" → dispara la cámara, la foto nueva reemplaza solo a esa página.
8. Eliminar una página → desaparece de la grilla y de cualquier exportación posterior.
9. Con 2 páginas restantes, probar las tres exportaciones: "PDF único" (abre y tiene 2 páginas), "ZIP con un PDF por página" (2 archivos .pdf adentro, cada uno de una página), "ZIP de imágenes" (2 archivos .jpg adentro).

- [ ] **Step 2: Si el intento automático de reabrir la cámara (Step 1.2) resultó poco confiable**

No es necesariamente un bloqueante — el diseño ya contempla la degradación a botón manual (spec, sección 6). Si en la práctica NUNCA funciona en los navegadores probados, considerar simplificar `handleFile` en `multi-scan.tsx` quitando el intento automático (dejar solo el toque manual), documentando la decisión con un comentario y el resultado observado. Esto es una mejora chica sobre el código de la Tarea 6, no un cambio de diseño.

- [ ] **Step 3: Regresión completa**

```bash
npx vitest run
npx tsc --noEmit
npm run build
```
Expected: toda la suite en verde (54 tests), mismo único error preexistente de tsc, build sin errores.

- [ ] **Step 4: Commit final si hubo ajustes de la Tarea 10**

```bash
git add -A
git commit -m "fix: ajustes de verificacion en navegador real para el modo Multiple"
```

Si no hizo falta ningún ajuste, no hay commit en esta tarea — ya quedó todo en la Tarea 6/7.

---

## Fuera de alcance de este plan

Los mismos puntos que la spec deja fuera: reordenar páginas en la revisión, cámara propia embebida, carpeta personalizada, bucket de almacenamiento, mandar lo escaneado al editor principal.
