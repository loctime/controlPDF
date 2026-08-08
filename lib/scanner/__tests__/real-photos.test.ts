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
