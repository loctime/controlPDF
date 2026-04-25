import { renderPageToBlob } from "./preview"

export type ImageFormat = "jpeg" | "png"

export interface ConvertToImagesOptions {
  format: ImageFormat
  dpi?: number
  quality?: number
  pageNumbers?: number[]
  onProgress?: (current: number, total: number) => void
}

export interface ImageResult {
  name: string
  blob: Blob
  pageNumber: number
}

export async function convertToImages(
  file: File,
  totalPages: number,
  options: ConvertToImagesOptions,
): Promise<ImageResult[]> {
  const dpi = options.dpi ?? 150
  const scale = dpi / 72
  const mime: "image/jpeg" | "image/png" =
    options.format === "png" ? "image/png" : "image/jpeg"
  const ext = options.format === "png" ? "png" : "jpg"
  const quality = options.quality ?? 0.92
  const pages =
    options.pageNumbers && options.pageNumbers.length > 0
      ? options.pageNumbers.filter((n) => n >= 1 && n <= totalPages)
      : Array.from({ length: totalPages }, (_, i) => i + 1)

  const baseName = file.name.replace(/\.pdf$/i, "")
  const padTo = String(totalPages).length
  const results: ImageResult[] = []

  for (let i = 0; i < pages.length; i++) {
    const pageNumber = pages[i]
    const blob = await renderPageToBlob(file, pageNumber, {
      scale,
      format: mime,
      quality,
    })
    const padded = String(pageNumber).padStart(padTo, "0")
    results.push({
      name: `${baseName}-${padded}.${ext}`,
      blob,
      pageNumber,
    })
    options.onProgress?.(i + 1, pages.length)
  }
  return results
}
