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
