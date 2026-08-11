import { describe, it, expect } from "vitest"
import { readFileSync, existsSync } from "node:fs"
import { join } from "node:path"
import jpeg from "jpeg-js"
import { detectOrientation, rotateQuarterTurns } from "../orientation"
import { warpToRect } from "../warp"
import type { Corners, RawImage } from "../types"

/** Imagen chica con un valor distinto por píxel, para seguirle el rastro. */
function ramp(w: number, h: number): RawImage {
  const data = new Uint8ClampedArray(w * h * 4)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4
      data[i] = x
      data[i + 1] = y
      data[i + 2] = 0
      data[i + 3] = 255
    }
  }
  return { data, width: w, height: h }
}

function pixel(img: RawImage, x: number, y: number): [number, number] {
  const i = (y * img.width + x) * 4
  return [img.data[i], img.data[i + 1]]
}

describe("rotateQuarterTurns", () => {
  it("no toca la imagen con 0 giros, pero devuelve una copia", () => {
    const src = ramp(3, 5)
    const out = rotateQuarterTurns(src, 0)
    expect(out.width).toBe(3)
    expect(out.height).toBe(5)
    expect(Array.from(out.data)).toEqual(Array.from(src.data))
    expect(out.data).not.toBe(src.data)
  })

  it("intercambia ancho y alto en los giros impares", () => {
    const src = ramp(3, 5)
    expect(rotateQuarterTurns(src, 1)).toMatchObject({ width: 5, height: 3 })
    expect(rotateQuarterTurns(src, 2)).toMatchObject({ width: 3, height: 5 })
    expect(rotateQuarterTurns(src, 3)).toMatchObject({ width: 5, height: 3 })
  })

  it("gira en sentido horario: la esquina de arriba a la izquierda va a la de arriba a la derecha", () => {
    const src = ramp(3, 5)
    const out = rotateQuarterTurns(src, 1)
    // El píxel (0,0) del original queda en el extremo derecho de la fila 0.
    expect(pixel(out, out.width - 1, 0)).toEqual([0, 0])
    // Y el (2,0) —arriba a la derecha— cae abajo a la derecha.
    expect(pixel(out, out.width - 1, out.height - 1)).toEqual([2, 0])
  })

  it("gira en sentido antihorario con 3", () => {
    const src = ramp(3, 5)
    const out = rotateQuarterTurns(src, 3)
    expect(pixel(out, 0, out.height - 1)).toEqual([0, 0])
  })

  it("cuatro giros vuelven al original", () => {
    const src = ramp(7, 4)
    let out = src
    for (let i = 0; i < 4; i++) out = rotateQuarterTurns(out, 1)
    expect(out.width).toBe(src.width)
    expect(out.height).toBe(src.height)
    expect(Array.from(out.data)).toEqual(Array.from(src.data))
  })

  it("un giro horario y uno antihorario se cancelan", () => {
    const src = ramp(7, 4)
    const out = rotateQuarterTurns(rotateQuarterTurns(src, 1), 3)
    expect(Array.from(out.data)).toEqual(Array.from(src.data))
  })

  it("dos giros de a uno equivalen a uno de a dos", () => {
    const src = ramp(7, 4)
    const a = rotateQuarterTurns(rotateQuarterTurns(src, 1), 1)
    const b = rotateQuarterTurns(src, 2)
    expect(Array.from(a.data)).toEqual(Array.from(b.data))
  })

  it("normaliza giros negativos y mayores a 3", () => {
    const src = ramp(7, 4)
    for (const [a, b] of [[-1, 3], [5, 1], [4, 0], [-4, 0]]) {
      expect(Array.from(rotateQuarterTurns(src, a).data)).toEqual(
        Array.from(rotateQuarterTurns(src, b).data),
      )
    }
  })
})

const DIR = join(__dirname, "photos")
const EXPECTED_PATH = join(DIR, "expected.json")
const hasPhotos = existsSync(EXPECTED_PATH)

/**
 * Cada foto real se endereza y después se la gira a las cuatro posiciones. La
 * detección tiene que pedir exactamente el giro que la devuelve a la original.
 *
 * Es una prueba fuerte y barata: una foto sola da cuatro casos, y cubre los
 * dos problemas por separado —el eje (acostada o no) y el sentido (derecha o
 * cabeza abajo)— sin necesitar más fixtures que las que ya están en el repo.
 */
describe.skipIf(!hasPhotos)("detectOrientation sobre fotos reales", () => {
  const expected: Record<string, { corners: number[][] | null }> = hasPhotos
    ? JSON.parse(readFileSync(EXPECTED_PATH, "utf8"))
    : {}

  const conDocumento = Object.entries(expected).filter(([f, e]) => e.corners && existsSync(join(DIR, f)))

  it.each(conDocumento)("%s: acierta las cuatro rotaciones", async (file, entry) => {
    const raw = jpeg.decode(readFileSync(join(DIR, file)), { useTArray: true })
    const img: RawImage = {
      data: new Uint8ClampedArray(raw.data),
      width: raw.width,
      height: raw.height,
    }
    const corners = entry.corners!.map(([x, y]) => ({ x, y })) as Corners
    const derecha = await warpToRect(img, corners)

    for (let giros = 0; giros < 4; giros++) {
      const got = await detectOrientation(rotateQuarterTurns(derecha, giros))
      expect(got.turns, `girada ${giros * 90}° (skew ${got.skew.toFixed(3)})`).toBe(
        (4 - giros) % 4,
      )
    }
  }, 120_000)
})
