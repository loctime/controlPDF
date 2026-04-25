import { PDFDocument, degrees } from "pdf-lib"

export type RotationAngle = 90 | 180 | 270

export async function countPages(file: File | Blob): Promise<number> {
  const buffer = await file.arrayBuffer()
  const doc = await PDFDocument.load(buffer, { updateMetadata: false })
  return doc.getPageCount()
}

export async function mergePDFs(files: File[]): Promise<Uint8Array> {
  const merged = await PDFDocument.create()
  for (const file of files) {
    const buffer = await file.arrayBuffer()
    const source = await PDFDocument.load(buffer, { updateMetadata: false })
    const pages = await merged.copyPages(source, source.getPageIndices())
    pages.forEach((page) => merged.addPage(page))
  }
  return merged.save()
}

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

export interface SplitRange {
  from: number
  to: number
}

export async function splitPDF(
  file: File,
  ranges: SplitRange[],
): Promise<Array<{ name: string; bytes: Uint8Array }>> {
  const buffer = await file.arrayBuffer()
  const source = await PDFDocument.load(buffer, { updateMetadata: false })
  const total = source.getPageCount()
  const baseName = file.name.replace(/\.pdf$/i, "")
  const results: Array<{ name: string; bytes: Uint8Array }> = []

  for (const range of ranges) {
    const from = Math.max(1, Math.min(range.from, total))
    const to = Math.max(from, Math.min(range.to, total))
    const indices = Array.from({ length: to - from + 1 }, (_, i) => from - 1 + i)
    const out = await PDFDocument.create()
    const pages = await out.copyPages(source, indices)
    pages.forEach((p) => out.addPage(p))
    const bytes = await out.save()
    const suffix = from === to ? `pagina-${from}` : `paginas-${from}-${to}`
    results.push({ name: `${baseName}-${suffix}.pdf`, bytes })
  }
  return results
}

export function parseRanges(input: string, totalPages: number): SplitRange[] {
  const ranges: SplitRange[] = []
  const parts = input.split(",").map((p) => p.trim()).filter(Boolean)
  for (const part of parts) {
    const match = part.match(/^(\d+)(?:\s*-\s*(\d+))?$/)
    if (!match) continue
    const from = parseInt(match[1], 10)
    const to = match[2] ? parseInt(match[2], 10) : from
    if (from < 1 || from > totalPages || to < from || to > totalPages) continue
    ranges.push({ from, to })
  }
  return ranges
}

export function downloadBytes(bytes: Uint8Array, filename: string) {
  const arrayBuffer = bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer
  const blob = new Blob([arrayBuffer], { type: "application/pdf" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 0)
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
