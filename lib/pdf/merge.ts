import { PDFDocument } from "pdf-lib"

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
