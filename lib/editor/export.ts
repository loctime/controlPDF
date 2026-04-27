"use client"

import {
  PDFDocument,
  StandardFonts,
  degrees,
  rgb,
  type PDFFont,
} from "@cantoo/pdf-lib"
import type {
  CompressOp,
  ConvertOp,
  EditorState,
  GlobalOps,
  OcrOp,
  PageEntry,
  PageScope,
  SourceId,
} from "./types"
import {
  renderPageToBlob,
  renderPageToCanvas,
  type CompressLevel,
  type PageNumberFormat,
  type PageNumberOptions,
  type TextPosition,
  type WatermarkOptions,
} from "@/lib/pdf"

export interface ExportPdf {
  name: string
  bytes: Uint8Array
}

export interface ExportImage {
  name: string
  blob: Blob
}

export interface ExportProgress {
  message: string
  current: number
  total: number
}

export interface ExportResult {
  pdfs: ExportPdf[]
  images: ExportImage[]
}

export interface ExportOptions {
  onProgress?: (info: ExportProgress) => void
  signal?: AbortSignal
}

const COMPRESS_PROFILES: Record<
  CompressLevel,
  { scale: number; quality: number }
> = {
  low: { scale: 2.0, quality: 0.85 },
  medium: { scale: 1.5, quality: 0.7 },
  high: { scale: 1.25, quality: 0.5 },
}

const sanitize = (s: string) =>
  s
    .replace(/[\\/:*?"<>|]/g, "_")
    .replace(/\s+/g, " ")
    .trim() || "documento"

function resolveScopeIndices(
  scope: PageScope,
  segmentPages: PageEntry[],
): number[] {
  if (scope.kind === "all") return segmentPages.map((_, i) => i)
  if (scope.kind === "selected") {
    const set = new Set(scope.pageIds)
    return segmentPages
      .map((p, i) => (set.has(p.id) ? i : -1))
      .filter((i) => i >= 0)
  }
  const lo = Math.max(1, Math.min(scope.from, segmentPages.length))
  const hi = Math.max(lo, Math.min(scope.to, segmentPages.length))
  const out: number[] = []
  for (let i = lo - 1; i < hi; i++) out.push(i)
  return out
}

function computeAnchor(
  pageWidth: number,
  pageHeight: number,
  textWidth: number,
  textHeight: number,
  position: TextPosition,
  margin: number,
): { x: number; y: number } {
  const left = margin
  const right = pageWidth - textWidth - margin
  const centerX = (pageWidth - textWidth) / 2
  const top = pageHeight - textHeight - margin
  const bottom = margin
  const centerY = (pageHeight - textHeight) / 2
  switch (position) {
    case "topLeft":
      return { x: left, y: top }
    case "topCenter":
      return { x: centerX, y: top }
    case "topRight":
      return { x: right, y: top }
    case "bottomLeft":
      return { x: left, y: bottom }
    case "bottomCenter":
      return { x: centerX, y: bottom }
    case "bottomRight":
      return { x: right, y: bottom }
    case "center":
      return { x: centerX, y: centerY }
  }
}

function applyWatermark(
  doc: PDFDocument,
  font: PDFFont,
  opts: WatermarkOptions,
  indices: number[],
) {
  const color = opts.color ?? { r: 0.6, g: 0.6, b: 0.6 }
  const opacity = Math.max(0.05, Math.min(1, opts.opacity))
  const pages = doc.getPages()
  for (const idx of indices) {
    const page = pages[idx]
    if (!page) continue
    const { width, height } = page.getSize()
    const textWidth = font.widthOfTextAtSize(opts.text, opts.fontSize)
    const { x, y } = computeAnchor(
      width,
      height,
      textWidth,
      opts.fontSize,
      opts.position,
      24,
    )
    page.drawText(opts.text, {
      x,
      y,
      size: opts.fontSize,
      font,
      color: rgb(color.r, color.g, color.b),
      opacity,
      rotate: degrees(opts.rotation),
    })
  }
}

function formatPageLabel(
  format: PageNumberFormat,
  current: number,
  total: number,
): string {
  switch (format) {
    case "n":
      return String(current)
    case "n-of-total":
      return `${current} / ${total}`
    case "page-n":
      return `Página ${current}`
    case "page-n-of-total":
      return `Página ${current} de ${total}`
  }
}

function applyPageNumbers(
  doc: PDFDocument,
  font: PDFFont,
  opts: PageNumberOptions,
  indices: number[],
) {
  const pages = doc.getPages()
  const skipFirst = opts.skipFirstPage ?? false
  const startAt = opts.startAtPage ?? 1
  const totalLabel = skipFirst ? indices.length - 1 : indices.length
  let counter = 0
  for (let k = 0; k < indices.length; k++) {
    if (k === 0 && skipFirst) continue
    const idx = indices[k]
    const page = pages[idx]
    if (!page) continue
    const { width, height } = page.getSize()
    const current = counter + startAt
    counter++
    const label = formatPageLabel(opts.format, current, totalLabel)
    const textWidth = font.widthOfTextAtSize(label, opts.fontSize)
    const { x, y } = computeAnchor(
      width,
      height,
      textWidth,
      opts.fontSize,
      opts.position,
      opts.margin,
    )
    page.drawText(label, {
      x,
      y,
      size: opts.fontSize,
      font,
      color: rgb(0, 0, 0),
    })
  }
}

interface SegmentContext {
  segmentName: string
  pages: PageEntry[]
  state: EditorState
  doc: PDFDocument
  signal?: AbortSignal
  onTick: (message: string) => void
}

async function applyCompress(
  ctx: SegmentContext,
  op: CompressOp,
  ocrIndices: Set<number>,
) {
  const profile = COMPRESS_PROFILES[op.level]
  // Replace pages descending so removePage/insertPage doesn't shift later targets.
  const targets: number[] = []
  for (let i = 0; i < ctx.pages.length; i++) {
    if (ocrIndices.has(i)) continue
    targets.push(i)
  }
  for (let k = targets.length - 1; k >= 0; k--) {
    if (ctx.signal?.aborted) throw new Error("Cancelado")
    const idx = targets[k]
    const entry = ctx.pages[idx]
    const src = ctx.state.sources[entry.sourceId]
    if (!src) continue
    const blob = await renderPageToBlob(src.file, entry.sourcePageIndex + 1, {
      scale: profile.scale,
      format: "image/jpeg",
      quality: profile.quality,
      rotation: entry.rotation,
    })
    const ab = await blob.arrayBuffer()
    const image = await ctx.doc.embedJpg(new Uint8Array(ab))
    const oldPage = ctx.doc.getPage(idx)
    const { width, height } = oldPage.getSize()
    ctx.doc.removePage(idx)
    const newPage = ctx.doc.insertPage(idx, [width, height])
    newPage.drawImage(image, { x: 0, y: 0, width, height })
    ctx.onTick(
      `Comprimiendo ${ctx.segmentName} · página ${idx + 1}/${ctx.pages.length}`,
    )
  }
}

async function applyOcr(
  ctx: SegmentContext,
  op: OcrOp,
  indices: number[],
) {
  if (indices.length === 0) return
  const { createWorker } = await import("tesseract.js")
  ctx.onTick(`Cargando modelo OCR (${op.language})…`)
  const worker = await createWorker(op.language)
  if (ctx.signal?.aborted) {
    await worker.terminate()
    throw new Error("Cancelado")
  }
  try {
    const scale = op.dpi / 72
    const font = await ctx.doc.embedFont(StandardFonts.Helvetica)
    // Replace descending so removePage/insertPage indices stay valid.
    const sorted = [...indices].sort((a, b) => b - a)
    for (const idx of sorted) {
      if (ctx.signal?.aborted) throw new Error("Cancelado")
      const entry = ctx.pages[idx]
      const src = ctx.state.sources[entry.sourceId]
      if (!src) continue
      const canvas = await renderPageToCanvas(
        src.file,
        entry.sourcePageIndex + 1,
        { scale, rotation: entry.rotation },
      )
      const blob: Blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(
          (b: Blob | null) =>
            b ? resolve(b) : reject(new Error("canvas->blob")),
          "image/png",
        )
      })
      const imageBytes = new Uint8Array(await blob.arrayBuffer())
      const { data } = await worker.recognize(blob)

      const pdfWidth = canvas.width / scale
      const pdfHeight = canvas.height / scale
      ctx.doc.removePage(idx)
      const newPage = ctx.doc.insertPage(idx, [pdfWidth, pdfHeight])
      const image = await ctx.doc.embedPng(imageBytes)
      newPage.drawImage(image, {
        x: 0,
        y: 0,
        width: pdfWidth,
        height: pdfHeight,
      })

      const blocks = data.blocks ?? []
      for (const block of blocks) {
        for (const para of block.paragraphs ?? []) {
          for (const line of para.lines ?? []) {
            for (const w of line.words ?? []) {
              if (!w.text) continue
              const sanitized = w.text.replace(/[^\x20-\x7E -ÿ]/g, "")
              if (!sanitized) continue
              const x = w.bbox.x0 / scale
              const y = pdfHeight - w.bbox.y1 / scale
              const heightPx = w.bbox.y1 - w.bbox.y0
              const fontHeight = Math.max(4, (heightPx / scale) * 0.85)
              try {
                newPage.drawText(sanitized, {
                  x,
                  y,
                  size: fontHeight,
                  font,
                  color: rgb(0, 0, 0),
                  opacity: 0,
                })
              } catch {
                // glyph not in Helvetica; skip
              }
            }
          }
        }
      }
      ctx.onTick(
        `OCR ${ctx.segmentName} · página ${idx + 1}/${ctx.pages.length}`,
      )
    }
  } finally {
    await worker.terminate().catch(() => {})
  }
}

function dataUrlToBytes(dataUrl: string): Uint8Array {
  const comma = dataUrl.indexOf(",")
  const base64 = dataUrl.slice(comma + 1)
  const binary = atob(base64)
  const len = binary.length
  const bytes = new Uint8Array(len)
  for (let i = 0; i < len; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

async function applySignatures(doc: PDFDocument, pages: PageEntry[]) {
  const docPages = doc.getPages()
  for (let i = 0; i < pages.length; i++) {
    const sig = pages[i].signature
    if (!sig) continue
    const page = docPages[i]
    if (!page) continue
    const bytes = dataUrlToBytes(sig.dataUrl)
    const isPng = sig.dataUrl.startsWith("data:image/png")
    const image = isPng ? await doc.embedPng(bytes) : await doc.embedJpg(bytes)
    const { width: pageWidth, height: pageHeight } = page.getSize()
    const targetWidth = pageWidth * sig.widthRatio
    const aspect = image.height / image.width
    const targetHeight = targetWidth * aspect
    const x = pageWidth * sig.xRatio
    const yFromTop = pageHeight * sig.yRatio
    const y = pageHeight - yFromTop - targetHeight
    page.drawImage(image, { x, y, width: targetWidth, height: targetHeight })
  }
}

async function buildSegment(
  segmentName: string,
  pages: PageEntry[],
  sourceDocs: Map<SourceId, PDFDocument>,
  state: EditorState,
  signal?: AbortSignal,
  onTick: (msg: string) => void = () => {},
): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  for (const entry of pages) {
    const srcDoc = sourceDocs.get(entry.sourceId)
    if (!srcDoc) continue
    if (
      entry.sourcePageIndex < 0 ||
      entry.sourcePageIndex >= srcDoc.getPageCount()
    ) {
      continue
    }
    const [copied] = await doc.copyPages(srcDoc, [entry.sourcePageIndex])
    const baseAngle = copied.getRotation().angle
    const total = (baseAngle + entry.rotation) % 360
    if (total !== baseAngle) copied.setRotation(degrees(total))
    doc.addPage(copied)
  }

  const ctx: SegmentContext = {
    segmentName,
    pages,
    state,
    doc,
    signal,
    onTick,
  }

  const ocr = state.globalOps.ocr?.enabled ? state.globalOps.ocr : null
  const ocrIndices = ocr ? resolveScopeIndices(ocr.scope, pages) : []
  const ocrSet = new Set(ocrIndices)

  if (state.globalOps.compress?.enabled) {
    await applyCompress(ctx, state.globalOps.compress, ocrSet)
  }
  if (ocr) {
    await applyOcr(ctx, ocr, ocrIndices)
  }

  // Apply per-page signatures (image overlays). Done after raster ops so
  // they remain crisp; before watermark/numbers so those still sit on top
  // if user wants them above the signature.
  await applySignatures(doc, pages)

  if (state.globalOps.watermark?.enabled) {
    const indices = resolveScopeIndices(
      state.globalOps.watermark.scope,
      pages,
    )
    if (indices.length > 0) {
      const font = await doc.embedFont(StandardFonts.HelveticaBold)
      applyWatermark(doc, font, state.globalOps.watermark.opts, indices)
    }
  }
  if (state.globalOps.pageNumbers?.enabled) {
    const indices = resolveScopeIndices(
      state.globalOps.pageNumbers.scope,
      pages,
    )
    if (indices.length > 0) {
      const font = await doc.embedFont(StandardFonts.Helvetica)
      applyPageNumbers(doc, font, state.globalOps.pageNumbers.opts, indices)
    }
  }

  if (state.globalOps.metadata?.enabled) {
    const m = state.globalOps.metadata.opts
    if (m.title !== undefined) doc.setTitle(m.title)
    if (m.author !== undefined) doc.setAuthor(m.author)
    if (m.subject !== undefined) doc.setSubject(m.subject)
    if (m.keywords !== undefined) doc.setKeywords(m.keywords)
    if (m.creator !== undefined) doc.setCreator(m.creator)
    if (m.producer !== undefined) doc.setProducer(m.producer)
    doc.setModificationDate(new Date())
  }

  if (state.globalOps.protect?.enabled) {
    const p = state.globalOps.protect.opts
    doc.encrypt({
      userPassword: p.userPassword || p.ownerPassword,
      ownerPassword: p.ownerPassword || p.userPassword,
      permissions: {
        printing: p.permissions?.printing ? "highResolution" : false,
        modifying: p.permissions?.modifying ?? false,
        copying: p.permissions?.copying ?? false,
        annotating: p.permissions?.annotating ?? false,
        fillingForms: p.permissions?.fillingForms ?? false,
        contentAccessibility: p.permissions?.contentAccessibility ?? true,
        documentAssembly: p.permissions?.documentAssembly ?? false,
      },
    })
  }

  return doc.save()
}

async function convertPagesToImages(
  segmentName: string,
  pages: PageEntry[],
  state: EditorState,
  op: ConvertOp,
  signal: AbortSignal | undefined,
  onTick: (msg: string) => void,
): Promise<ExportImage[]> {
  const indices = resolveScopeIndices(op.scope, pages)
  if (indices.length === 0) return []
  const scale = op.dpi / 72
  const mime = op.format === "png" ? "image/png" : "image/jpeg"
  const ext = op.format === "png" ? "png" : "jpg"
  const padTo = String(pages.length).length
  const baseName = sanitize(segmentName)
  const out: ExportImage[] = []
  for (const idx of indices) {
    if (signal?.aborted) throw new Error("Cancelado")
    const entry = pages[idx]
    const src = state.sources[entry.sourceId]
    if (!src) continue
    const blob = await renderPageToBlob(src.file, entry.sourcePageIndex + 1, {
      scale,
      format: mime,
      quality: 0.92,
      rotation: entry.rotation,
    })
    const padded = String(idx + 1).padStart(padTo, "0")
    out.push({ name: `${baseName}-${padded}.${ext}`, blob })
    onTick(
      `Convirtiendo ${segmentName} · imagen ${idx + 1}/${pages.length}`,
    )
  }
  return out
}

function estimateTotal(state: EditorState, segments: PageEntry[][]): number {
  const compress = state.globalOps.compress?.enabled
  const ocr = state.globalOps.ocr?.enabled ? state.globalOps.ocr : null
  const convert = state.globalOps.convert?.enabled
    ? state.globalOps.convert
    : null
  let total = 0
  for (const seg of segments) {
    const ocrIdx = ocr ? resolveScopeIndices(ocr.scope, seg) : []
    const ocrSet = new Set(ocrIdx)
    if (compress) total += seg.length - ocrSet.size
    // OCR is much slower than compress; weight it heavier so the bar isn't
    // misleading. Use 5x.
    total += ocrIdx.length * 5
    if (convert) {
      total += resolveScopeIndices(convert.scope, seg).length
    }
  }
  return Math.max(1, total)
}

export async function exportEditor(
  state: EditorState,
  opts: ExportOptions = {},
): Promise<ExportResult> {
  const visible = state.pages.filter((p) => !p.deleted)
  if (visible.length === 0) {
    throw new Error("No hay páginas para exportar")
  }

  const sourceDocs = new Map<SourceId, PDFDocument>()
  for (const sid of new Set(visible.map((p) => p.sourceId))) {
    const src = state.sources[sid]
    if (!src) continue
    const buffer = await src.file.arrayBuffer()
    const doc = await PDFDocument.load(buffer, { updateMetadata: false })
    sourceDocs.set(sid, doc)
  }

  const firstSourceId = state.sourceOrder[0]
  const firstName = firstSourceId
    ? state.sources[firstSourceId]?.fileName ?? "documento.pdf"
    : "documento.pdf"
  const baseName = firstName.replace(/\.pdf$/i, "")

  // Build (segmentName, pages) tuples — same logic as before.
  const segments: Array<{ name: string; pages: PageEntry[]; pdfName: string }> = []
  if (state.groupOrder.length === 0) {
    segments.push({
      name: "documento",
      pages: visible,
      pdfName: `${baseName}-editado.pdf`,
    })
  } else {
    const ungrouped = visible.filter((p) => p.groupId === null)
    if (ungrouped.length > 0) {
      segments.push({
        name: "sin-agrupar",
        pages: ungrouped,
        pdfName: `${baseName}-sin-agrupar.pdf`,
      })
    }
    for (const gid of state.groupOrder) {
      const groupPages = visible.filter((p) => p.groupId === gid)
      if (groupPages.length === 0) continue
      const group = state.groups[gid]
      const name = group ? sanitize(group.name) : `grupo-${gid.slice(0, 6)}`
      segments.push({ name, pages: groupPages, pdfName: `${name}.pdf` })
    }
  }

  const total = estimateTotal(
    state,
    segments.map((s) => s.pages),
  )
  let current = 0
  const tick = (message: string) => {
    if (opts.signal?.aborted) return
    current = Math.min(current + 1, total)
    opts.onProgress?.({ message, current, total })
  }
  // Initial nudge so the dialog has a message before any work starts.
  opts.onProgress?.({
    message: "Preparando…",
    current: 0,
    total,
  })

  const pdfs: ExportPdf[] = []
  const images: ExportImage[] = []

  for (const seg of segments) {
    if (opts.signal?.aborted) throw new Error("Cancelado")
    const bytes = await buildSegment(
      seg.name,
      seg.pages,
      sourceDocs,
      state,
      opts.signal,
      tick,
    )
    pdfs.push({ name: seg.pdfName, bytes })
    if (state.globalOps.convert?.enabled) {
      const segImages = await convertPagesToImages(
        seg.name,
        seg.pages,
        state,
        state.globalOps.convert,
        opts.signal,
        tick,
      )
      images.push(...segImages)
    }
  }

  if (pdfs.length === 0) throw new Error("No hay páginas para exportar")
  return { pdfs, images }
}

export function exportZipName(state: EditorState): string {
  const firstSourceId = state.sourceOrder[0]
  const firstName = firstSourceId
    ? state.sources[firstSourceId]?.fileName ?? "documento.pdf"
    : "documento.pdf"
  const baseName = firstName.replace(/\.pdf$/i, "")
  return `${baseName}-export.zip`
}
