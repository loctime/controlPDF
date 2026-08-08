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
