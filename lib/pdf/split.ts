import { PDFDocument } from "pdf-lib"
import type { SplitRange } from "./types"

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
