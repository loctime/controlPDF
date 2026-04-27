"use client"

import {
  PDFDocument,
  StandardFonts,
  degrees,
  rgb,
  type PDFFont,
} from "@cantoo/pdf-lib"
import type {
  EditorState,
  GlobalOps,
  PageEntry,
  PageId,
  PageScope,
  SourceId,
} from "./types"
import type {
  PageNumberFormat,
  PageNumberOptions,
  TextPosition,
  WatermarkOptions,
} from "@/lib/pdf"

export interface ExportPdf {
  name: string
  bytes: Uint8Array
}

export interface ExportResult {
  pdfs: ExportPdf[]
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
  // range — 1-based inclusive within the segment
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

async function buildSegment(
  pages: PageEntry[],
  sourceDocs: Map<SourceId, PDFDocument>,
  globalOps: GlobalOps,
): Promise<Uint8Array> {
  const out = await PDFDocument.create()
  for (const entry of pages) {
    const srcDoc = sourceDocs.get(entry.sourceId)
    if (!srcDoc) continue
    if (entry.sourcePageIndex < 0 || entry.sourcePageIndex >= srcDoc.getPageCount()) {
      continue
    }
    const [copied] = await out.copyPages(srcDoc, [entry.sourcePageIndex])
    const baseAngle = copied.getRotation().angle
    const total = (baseAngle + entry.rotation) % 360
    if (total !== baseAngle) copied.setRotation(degrees(total))
    out.addPage(copied)
  }

  // Apply scoped vector overlays (watermark first, page numbers after).
  if (globalOps.watermark?.enabled) {
    const indices = resolveScopeIndices(globalOps.watermark.scope, pages)
    if (indices.length > 0) {
      const font = await out.embedFont(StandardFonts.HelveticaBold)
      applyWatermark(out, font, globalOps.watermark.opts, indices)
    }
  }
  if (globalOps.pageNumbers?.enabled) {
    const indices = resolveScopeIndices(globalOps.pageNumbers.scope, pages)
    if (indices.length > 0) {
      const font = await out.embedFont(StandardFonts.Helvetica)
      applyPageNumbers(out, font, globalOps.pageNumbers.opts, indices)
    }
  }

  // Document-level metadata.
  if (globalOps.metadata?.enabled) {
    const m = globalOps.metadata.opts
    if (m.title !== undefined) out.setTitle(m.title)
    if (m.author !== undefined) out.setAuthor(m.author)
    if (m.subject !== undefined) out.setSubject(m.subject)
    if (m.keywords !== undefined) out.setKeywords(m.keywords)
    if (m.creator !== undefined) out.setCreator(m.creator)
    if (m.producer !== undefined) out.setProducer(m.producer)
    out.setModificationDate(new Date())
  }

  // Encryption MUST be last — it locks further mutations.
  if (globalOps.protect?.enabled) {
    const p = globalOps.protect.opts
    out.encrypt({
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

  return out.save()
}

export async function exportEditor(state: EditorState): Promise<ExportResult> {
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

  if (state.groupOrder.length === 0) {
    const bytes = await buildSegment(visible, sourceDocs, state.globalOps)
    return { pdfs: [{ name: `${baseName}-editado.pdf`, bytes }] }
  }

  const pdfs: ExportPdf[] = []
  const ungrouped = visible.filter((p) => p.groupId === null)
  if (ungrouped.length > 0) {
    const bytes = await buildSegment(ungrouped, sourceDocs, state.globalOps)
    pdfs.push({ name: `${baseName}-sin-agrupar.pdf`, bytes })
  }
  for (const gid of state.groupOrder) {
    const groupPages = visible.filter((p) => p.groupId === gid)
    if (groupPages.length === 0) continue
    const group = state.groups[gid]
    const groupName = group ? sanitize(group.name) : `grupo-${gid.slice(0, 6)}`
    const bytes = await buildSegment(groupPages, sourceDocs, state.globalOps)
    pdfs.push({ name: `${groupName}.pdf`, bytes })
  }
  if (pdfs.length === 0) {
    throw new Error("No hay páginas para exportar")
  }
  return { pdfs }
}

export function exportZipName(state: EditorState): string {
  const firstSourceId = state.sourceOrder[0]
  const firstName = firstSourceId
    ? state.sources[firstSourceId]?.fileName ?? "documento.pdf"
    : "documento.pdf"
  const baseName = firstName.replace(/\.pdf$/i, "")
  return `${baseName}-grupos.zip`
}
