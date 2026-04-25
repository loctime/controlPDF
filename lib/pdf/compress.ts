import { PDFDocument } from "@cantoo/pdf-lib"
import { renderPageToBlob } from "./preview"

export type CompressLevel = "low" | "medium" | "high"

interface CompressProfile {
  scale: number
  quality: number
}

const PROFILES: Record<CompressLevel, CompressProfile> = {
  low: { scale: 2.0, quality: 0.85 },
  medium: { scale: 1.5, quality: 0.7 },
  high: { scale: 1.25, quality: 0.5 },
}

export interface CompressOptions {
  level: CompressLevel
  onProgress?: (current: number, total: number) => void
}

export interface CompressResult {
  bytes: Uint8Array
  originalSize: number
  compressedSize: number
}

export async function compressPDF(
  file: File,
  totalPages: number,
  options: CompressOptions,
): Promise<CompressResult> {
  const profile = PROFILES[options.level]
  const out = await PDFDocument.create()

  const buffer = await file.arrayBuffer()
  const source = await PDFDocument.load(buffer, { updateMetadata: false })

  for (let i = 0; i < totalPages; i++) {
    const pageNumber = i + 1
    const sourcePage = source.getPage(i)
    const { width, height } = sourcePage.getSize()
    const blob = await renderPageToBlob(file, pageNumber, {
      scale: profile.scale,
      format: "image/jpeg",
      quality: profile.quality,
    })
    const arrayBuffer = await blob.arrayBuffer()
    const image = await out.embedJpg(new Uint8Array(arrayBuffer))
    const newPage = out.addPage([width, height])
    newPage.drawImage(image, { x: 0, y: 0, width, height })
    options.onProgress?.(i + 1, totalPages)
  }

  const bytes = await out.save()
  return {
    bytes,
    originalSize: file.size,
    compressedSize: bytes.byteLength,
  }
}
