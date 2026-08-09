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

/**
 * Estos tests corren con `useModel: false` a propósito: ejercitan la cadena de
 * respaldo con OpenCV, no el modelo neuronal. Son la verificación de que la red
 * de seguridad funciona — sin ellos, un respaldo roto quedaría escondido detrás
 * del modelo hasta el día que un usuario se quede sin conexión.
 *
 * El modelo no se puede probar acá: necesita ImageData y WASM del navegador,
 * que en Node no existen. Se verifica end-to-end en el navegador.
 */
describe("detectCorners", () => {
  it("encuentra un documento en perspectiva dentro del 3%", async () => {
    const { image, corners } = makeDocumentPhoto({ text: true })
    const found = await detectCorners(image, { useModel: false })
    expect(found).not.toBeNull()
    expect(closeEnough(found!, corners)).toBe(true)
  })

  it("lo encuentra igual con iluminación despareja", async () => {
    const { image, corners } = makeDocumentPhoto({ shadeX: 90, shadeY: 40, text: true })
    const found = await detectCorners(image, { useModel: false })
    expect(found).not.toBeNull()
    expect(closeEnough(found!, corners)).toBe(true)
  })

  it("devuelve null si no hay documento", async () => {
    const { image } = makeDocumentPhoto({ paper: false })
    expect(await detectCorners(image, { useModel: false })).toBeNull()
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
    expect(await detectCorners(image, { useModel: false })).toBeNull()
  })

  it("devuelve las esquinas en orden tl, tr, br, bl", async () => {
    const { image } = makeDocumentPhoto()
    const c = (await detectCorners(image, { useModel: false }))!
    expect(c[0].x).toBeLessThan(c[1].x) // tl a la izquierda de tr
    expect(c[0].y).toBeLessThan(c[3].y) // tl arriba de bl
  })
})

describe("orderCorners bajo rotación", () => {
  const DOC: Corners = [
    { x: 170, y: 150 },
    { x: 740, y: 210 },
    { x: 700, y: 1030 },
    { x: 130, y: 970 },
  ]

  function rotar(pts: Corners, grados: number): Corners {
    const a = (grados * Math.PI) / 180
    const cx = 450
    const cy = 600
    return pts.map((p) => ({
      x: Math.round(cx + (p.x - cx) * Math.cos(a) - (p.y - cy) * Math.sin(a)),
      y: Math.round(cy + (p.x - cx) * Math.sin(a) + (p.y - cy) * Math.cos(a)),
    })) as Corners
  }

  const dist = (a: { x: number; y: number }, b: { x: number; y: number }) =>
    Math.hypot(a.x - b.x, a.y - b.y)

  // El método anterior (sumas y diferencias de coordenadas) repetía esquinas a
  // partir de unos 35 grados, y el enderezado salía degenerado.
  it("nunca devuelve esquinas repetidas, a ningún ángulo", () => {
    for (let grados = 0; grados <= 350; grados += 10) {
      const ordenadas = orderCorners(rotar(DOC, grados))
      const distintas = new Set(ordenadas.map((p) => `${p.x},${p.y}`))
      expect(distintas.size, `a ${grados} grados`).toBe(4)
    }
  })

  it("mantiene la página vertical hasta los 40 grados de inclinación", () => {
    for (const grados of [0, 10, 20, 30, 40]) {
      const [tl, tr, br, bl] = orderCorners(rotar(DOC, grados))
      const ancho = Math.max(dist(tl, tr), dist(bl, br))
      const alto = Math.max(dist(tl, bl), dist(tr, br))
      expect(alto, `a ${grados} grados salió apaisada`).toBeGreaterThan(ancho)
    }
  })

  it("sigue ordenando bien cuatro puntos desordenados", () => {
    const desordenados = [
      { x: 960, y: 790 },
      { x: 180, y: 120 },
      { x: 240, y: 700 },
      { x: 1010, y: 210 },
    ]
    expect(orderCorners(desordenados)).toEqual([
      { x: 180, y: 120 },
      { x: 1010, y: 210 },
      { x: 960, y: 790 },
      { x: 240, y: 700 },
    ])
  })
})
