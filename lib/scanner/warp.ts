import { loadCv } from "./cv"
import type { Corners, RawImage } from "./types"

/** Tope del lado largo del resultado. Protege la memoria de celulares. */
const MAX_OUTPUT_SIDE = 3000

const dist = (a: { x: number; y: number }, b: { x: number; y: number }) =>
  Math.hypot(a.x - b.x, a.y - b.y)

/**
 * Endereza el cuadrilátero a un rectángulo. El tamaño de salida sale de los
 * lados del cuadrilátero, así que conserva la resolución real del documento.
 */
export async function warpToRect(img: RawImage, corners: Corners): Promise<RawImage> {
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

  const src = cv.matFromImageData(img)
  const srcTri = cv.matFromArray(4, 1, cv.CV_32FC2, [
    tl.x, tl.y, tr.x, tr.y, br.x, br.y, bl.x, bl.y,
  ])
  const dstTri = cv.matFromArray(4, 1, cv.CV_32FC2, [
    0, 0, outW, 0, outW, outH, 0, outH,
  ])
  const M = cv.getPerspectiveTransform(srcTri, dstTri)
  const dst = new cv.Mat()

  try {
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
    src.delete()
    srcTri.delete()
    dstTri.delete()
    M.delete()
    dst.delete()
  }
}
