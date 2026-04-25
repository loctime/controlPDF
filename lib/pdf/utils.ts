import type { SplitRange } from "./types"

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function bytesToBlob(bytes: Uint8Array, mime = "application/pdf"): Blob {
  const ab = bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer
  return new Blob([ab], { type: mime })
}

export function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 0)
}

export function downloadBytes(
  bytes: Uint8Array,
  filename: string,
  mime = "application/pdf",
) {
  triggerDownload(bytesToBlob(bytes, mime), filename)
}

export async function downloadZip(
  files: Array<{ name: string; data: Uint8Array | Blob }>,
  zipName: string,
) {
  const { default: JSZip } = await import("jszip")
  const zip = new JSZip()
  for (const f of files) {
    const data =
      f.data instanceof Blob
        ? f.data
        : (bytesToBlob(f.data, "application/octet-stream") as Blob)
    zip.file(f.name, data)
  }
  const blob = await zip.generateAsync({ type: "blob" })
  triggerDownload(blob, zipName)
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
