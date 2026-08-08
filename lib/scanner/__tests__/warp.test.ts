import { describe, it, expect } from "vitest"
import { warpToRect } from "../warp"
import { makeDocumentPhoto } from "./fixtures"
import type { Corners } from "../types"

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

  it("tira un error claro si las esquinas están todas juntas (cuadrilátero degenerado)", async () => {
    const { image } = makeDocumentPhoto()
    const degenerate: Corners = [
      { x: 600, y: 450 },
      { x: 601, y: 450 },
      { x: 601, y: 451 },
      { x: 600, y: 451 },
    ]
    await expect(warpToRect(image, degenerate)).rejects.toThrow(/esquinas/i)
  })
})
