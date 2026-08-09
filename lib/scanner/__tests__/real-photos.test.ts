import { describe, it, expect } from "vitest"
import { readFileSync, existsSync } from "node:fs"
import { join } from "node:path"
import jpeg from "jpeg-js"
import { detectCorners } from "../detect"
import type { Corners, RawImage } from "../types"

const DIR = join(__dirname, "photos")
const EXPECTED_PATH = join(DIR, "expected.json")

/**
 * El spec pide acertar al menos 6 de 8 sin intervención manual. Se expresa
 * como proporción para que el umbral siga teniendo sentido a medida que se
 * suman fotos: con un número fijo, un expected.json a medio llenar fallaría
 * de forma confusa o pasaría por acumulación.
 */
const HIT_RATIO = 0.75

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

  const entries = Object.entries(expected)
  const minHits = Math.ceil(entries.length * HIT_RATIO)

  it(`acierta al menos ${minHits} de ${entries.length}`, async () => {
    let hits = 0
    const misses: string[] = []

    for (const [file, entry] of entries) {
      // Un archivo listado en expected.json que no está en disco cuenta como
      // fallo con nombre, no como excepción sin contexto.
      if (!existsSync(join(DIR, file))) {
        misses.push(`${file}: falta el archivo`)
        continue
      }
      const img = decode(file)
      const found = await detectCorners(img, { useModel: false })

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
    expect(hits).toBeGreaterThanOrEqual(minHits)
  })
})
