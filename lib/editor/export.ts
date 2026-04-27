"use client"

import { PDFDocument, degrees } from "@cantoo/pdf-lib"
import type { EditorState, GroupId, PageEntry, SourceId } from "./types"

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

async function buildPdf(
  pages: PageEntry[],
  sourceDocs: Map<SourceId, PDFDocument>,
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

  // Single PDF when there are no groups.
  if (state.groupOrder.length === 0) {
    const bytes = await buildPdf(visible, sourceDocs)
    return { pdfs: [{ name: `${baseName}-editado.pdf`, bytes }] }
  }

  // Multi-PDF: one per group, ungrouped pages become a leading "Sin agrupar".
  const pdfs: ExportPdf[] = []
  const ungrouped = visible.filter((p) => p.groupId === null)
  if (ungrouped.length > 0) {
    const bytes = await buildPdf(ungrouped, sourceDocs)
    pdfs.push({ name: `${baseName}-sin-agrupar.pdf`, bytes })
  }
  for (const gid of state.groupOrder) {
    const groupPages = visible.filter((p) => p.groupId === gid)
    if (groupPages.length === 0) continue
    const group = state.groups[gid]
    const groupName = group ? sanitize(group.name) : `grupo-${gid.slice(0, 6)}`
    const bytes = await buildPdf(groupPages, sourceDocs)
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
