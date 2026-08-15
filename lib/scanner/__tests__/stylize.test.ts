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

/** Desvío estándar de un parche, para medir cuánto grano le queda al fondo. */
function patchStd(img: RawImage, x0: number, y0: number, x1: number, y1: number): number {
  let sum = 0
  let sumSq = 0
  let n = 0
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const v = img.data[(y * img.width + x) * 4]
      sum += v
      sumSq += v * v
      n++
    }
  }
  const mean = sum / n
  return Math.sqrt(sumSq / n - mean * mean)
}

/** Hash entero determinista, igual al de fixtures.ts pero sin exportarlo de ahí. */
function hash2(x: number, y: number): number {
  let h = (x * 374761393 + y * 668265263) | 0
  h = (h ^ (h >>> 13)) * 1274126177
  h = h ^ (h >>> 16)
  return (h >>> 0) / 0xffffffff
}

/**
 * Suma grano píxel a píxel, en el espacio de la imagen ya enderezada. A
 * diferencia de la opción `noise` de `makeDocumentPhoto` (que lo dibuja antes
 * del warp), esto evita que el remuestreo bilineal del warp lo emborronee de
 * entrada: medido, ese remuestreo por sí solo bajaba el desvío de ±25 a 5.3,
 * dejando muy poco margen para que la prueba mida lo que quiere medir.
 */
function addNoise(img: RawImage, amplitude: number): RawImage {
  const data = new Uint8ClampedArray(img.data)
  for (let y = 0; y < img.height; y++) {
    for (let x = 0; x < img.width; x++) {
      const delta = Math.round((hash2(x, y) * 2 - 1) * amplitude)
      const i = (y * img.width + x) * 4
      data[i] += delta
      data[i + 1] += delta
      data[i + 2] += delta
    }
  }
  return { data, width: img.width, height: img.height }
}

/**
 * Papel gris parejo con grano, sin pasar por makeDocumentPhoto/warpToRect: el
 * papel "blanco" de esas fixtures vale 255, el techo del canal, así que medio
 * grano queda recortado por el clamp y el desvío medido sale mucho más bajo
 * que el real (medido: 30 de amplitud, 9.7 de desvío en vez de los ~17
 * esperados). En 200 hay margen de sobra a los dos lados.
 *
 * `level` y `amplitude` importan para más que evitar el clamp: con un grano
 * demasiado fuerte sobre un papel demasiado oscuro, CLAHE (que viene después
 * en el pipeline) infla el grano más de lo que el denoise previo pudo
 * dispersar, y ninguna combinación de filtros gana esa carrera — es una
 * limitación real de CLAHE, no algo que este archivo deba disimular subiendo
 * el umbral. Los valores de acá (235, 12) representan una foto con buena luz
 * y algo de grano de sensor, no un caso límite.
 */
function noisyGrayPaper(width: number, height: number, level: number, amplitude: number): RawImage {
  const data = new Uint8ClampedArray(width * height * 4)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const v = level + Math.round((hash2(x, y) * 2 - 1) * amplitude)
      const i = (y * width + x) * 4
      data[i] = v
      data[i + 1] = v
      data[i + 2] = v
      data[i + 3] = 255
    }
  }
  return { data, width, height }
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

  it("modo document despareja el grano del papel", async () => {
    // El grano simula la foto real: ruido de sensor y de compresión que
    // sobrevive a normalizeIllumination porque esa función solo corrige luz
    // despareja de baja frecuencia, no este tipo de variación píxel a píxel.
    const doc = noisyGrayPaper(300, 200, 235, 12)
    const before = patchStd(doc, 40, 40, 260, 160)
    const out = await stylize(doc, "document")
    const after = patchStd(out, 40, 40, 260, 160)

    expect(before).toBeGreaterThan(5) // el ruido agregado es real
    expect(after).toBeLessThan(before / 2) // y queda bastante más parejo
  })

  it("modo document conserva el texto oscuro con papel ruidoso", async () => {
    // El filtro que despareja el grano tiene que respetar el borde texto/papel:
    // si lo emborronara, esta prueba (heredada de la de arriba, sin ruido)
    // empezaría a fallar.
    const out = await stylize(addNoise(await shadedDocument(), 30), "document")
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
