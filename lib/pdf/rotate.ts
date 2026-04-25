import { PDFDocument, degrees } from "@cantoo/pdf-lib"
import type { RotationAngle } from "./types"

export async function rotatePDF(
  file: File,
  angle: RotationAngle,
  pageNumbers?: number[],
): Promise<Uint8Array> {
  const buffer = await file.arrayBuffer()
  const doc = await PDFDocument.load(buffer)
  const total = doc.getPageCount()
  const targets =
    pageNumbers && pageNumbers.length > 0
      ? pageNumbers.filter((n) => n >= 1 && n <= total).map((n) => n - 1)
      : doc.getPageIndices()

  for (const idx of targets) {
    const page = doc.getPage(idx)
    const current = page.getRotation().angle
    page.setRotation(degrees((current + angle) % 360))
  }
  return doc.save()
}

export async function rotatePagesIndividually(
  file: File,
  rotations: Map<number, number>,
): Promise<Uint8Array> {
  const buffer = await file.arrayBuffer()
  const doc = await PDFDocument.load(buffer)
  const total = doc.getPageCount()

  for (const [pageNumber, rotation] of rotations.entries()) {
    if (pageNumber < 1 || pageNumber > total) continue
    const normalized = ((rotation % 360) + 360) % 360
    if (normalized === 0) continue
    const page = doc.getPage(pageNumber - 1)
    const current = page.getRotation().angle
    page.setRotation(degrees((current + normalized) % 360))
  }
  return doc.save()
}
