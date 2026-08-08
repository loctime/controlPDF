import { loadCv } from "./cv"
import type { Corners, RawImage } from "./types"

/** Tope del lado largo del resultado. Protege la memoria de celulares. */
const MAX_OUTPUT_SIDE = 3000

/**
 * Por debajo de esta fracción del área de la foto, el cuadrilátero es
 * prácticamente un punto (las cuatro esquinas arrastradas juntas): la
 * transformación de perspectiva queda indeterminada y `getPerspectiveTransform`
 * puede tirar sobre un sistema singular. Se corta antes de asignar nada.
 */
const MIN_QUAD_AREA_RATIO = 0.001

const dist = (a: { x: number; y: number }, b: { x: number; y: number }) =>
  Math.hypot(a.x - b.x, a.y - b.y)

/** Área del cuadrilátero por la fórmula del cordón (shoelace), sin OpenCV. */
function quadArea(corners: Corners): number {
  let sum = 0
  for (let i = 0; i < 4; i++) {
    const a = corners[i]
    const b = corners[(i + 1) % 4]
    sum += a.x * b.y - b.x * a.y
  }
  return Math.abs(sum) / 2
}

/**
 * Endereza el cuadrilátero a un rectángulo. El tamaño de salida sale de los
 * lados del cuadrilátero, así que conserva la resolución real del documento.
 */
export async function warpToRect(img: RawImage, corners: Corners): Promise<RawImage> {
  const imgArea = img.width * img.height
  if (imgArea > 0 && quadArea(corners) < MIN_QUAD_AREA_RATIO * imgArea) {
    throw new Error("Las esquinas están demasiado juntas")
  }

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

  let src: any = null
  let srcTri: any = null
  let dstTri: any = null
  let M: any = null
  let dst: any = null

  try {
    src = cv.matFromImageData(img)
    srcTri = cv.matFromArray(4, 1, cv.CV_32FC2, [
      tl.x, tl.y, tr.x, tr.y, br.x, br.y, bl.x, bl.y,
    ])
    dstTri = cv.matFromArray(4, 1, cv.CV_32FC2, [
      0, 0, outW, 0, outW, outH, 0, outH,
    ])
    M = cv.getPerspectiveTransform(srcTri, dstTri)
    dst = new cv.Mat()
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
    src?.delete()
    srcTri?.delete()
    dstTri?.delete()
    M?.delete()
    dst?.delete()
  }
}
