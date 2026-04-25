import { PDFDocument } from "pdf-lib"

export interface MergeInput {
  file: File
  includePages?: number[]
}

export async function mergePDFs(
  inputs: Array<File | MergeInput>,
): Promise<Uint8Array> {
  const merged = await PDFDocument.create()
  for (const input of inputs) {
    const file = input instanceof File ? input : input.file
    const includePages = input instanceof File ? undefined : input.includePages
    const buffer = await file.arrayBuffer()
    const source = await PDFDocument.load(buffer, { updateMetadata: false })
    const total = source.getPageCount()
    const indices =
      includePages && includePages.length > 0
        ? includePages
            .filter((n) => n >= 1 && n <= total)
            .map((n) => n - 1)
        : source.getPageIndices()
    if (indices.length === 0) continue
    const pages = await merged.copyPages(source, indices)
    pages.forEach((page) => merged.addPage(page))
  }
  return merged.save()
}
