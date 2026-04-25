"use client"

import type { PDFDocumentProxy } from "pdfjs-dist"

let pdfjsPromise: Promise<typeof import("pdfjs-dist")> | null = null

async function getPdfjs() {
  if (pdfjsPromise) return pdfjsPromise
  pdfjsPromise = (async () => {
    const mod = await import("pdfjs-dist")
    const workerUrl = new URL(
      "pdfjs-dist/build/pdf.worker.min.mjs",
      import.meta.url,
    ).toString()
    mod.GlobalWorkerOptions.workerSrc = workerUrl
    return mod
  })()
  return pdfjsPromise
}

function fileSig(file: File): string {
  return `${file.name}__${file.size}__${file.lastModified}`
}

const docCache = new Map<string, Promise<PDFDocumentProxy>>()
const thumbCache = new Map<string, string>()
const MAX_THUMBS = 300

async function getDoc(file: File): Promise<PDFDocumentProxy> {
  const sig = fileSig(file)
  let pending = docCache.get(sig)
  if (!pending) {
    pending = (async () => {
      const pdfjs = await getPdfjs()
      const buffer = await file.arrayBuffer()
      return pdfjs.getDocument({ data: buffer }).promise
    })()
    docCache.set(sig, pending)
  }
  return pending
}

export function releaseDocument(file: File) {
  const sig = fileSig(file)
  const pending = docCache.get(sig)
  if (!pending) return
  docCache.delete(sig)
  pending.then((doc) => doc.destroy()).catch(() => {})
  const prefix = `${sig}::`
  for (const key of Array.from(thumbCache.keys())) {
    if (key.startsWith(prefix)) thumbCache.delete(key)
  }
}

export async function getPageCount(file: File): Promise<number> {
  const doc = await getDoc(file)
  return doc.numPages
}

export interface ThumbnailOptions {
  width?: number
  rotation?: number
}

export async function renderThumbnail(
  file: File,
  pageNumber: number,
  options: ThumbnailOptions = {},
): Promise<string> {
  const sig = fileSig(file)
  const width = options.width ?? 200
  const rotation = options.rotation ?? 0
  const key = `${sig}::${pageNumber}::${width}::${rotation}`
  const cached = thumbCache.get(key)
  if (cached) return cached

  const doc = await getDoc(file)
  const page = await doc.getPage(pageNumber)
  const baseViewport = page.getViewport({ scale: 1, rotation })
  const scale = width / baseViewport.width
  const viewport = page.getViewport({ scale, rotation })
  const canvas = document.createElement("canvas")
  canvas.width = Math.ceil(viewport.width)
  canvas.height = Math.ceil(viewport.height)
  const ctx = canvas.getContext("2d")
  if (!ctx) throw new Error("No 2D canvas context")
  await page.render({ canvasContext: ctx, viewport }).promise
  const dataUrl = canvas.toDataURL("image/jpeg", 0.85)

  if (thumbCache.size >= MAX_THUMBS) {
    const first = thumbCache.keys().next().value
    if (first) thumbCache.delete(first)
  }
  thumbCache.set(key, dataUrl)
  return dataUrl
}
