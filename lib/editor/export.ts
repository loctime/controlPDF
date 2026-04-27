"use client"

import { PDFDocument, degrees } from "@cantoo/pdf-lib"
import type { EditorState, SourceId } from "./types"

export interface ExportResult {
  name: string
  bytes: Uint8Array
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

  const out = await PDFDocument.create()
  for (const entry of visible) {
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

  const bytes = await out.save()
  const firstSourceId = state.sourceOrder[0]
  const firstName = firstSourceId
    ? state.sources[firstSourceId]?.fileName ?? "documento.pdf"
    : "documento.pdf"
  const baseName = firstName.replace(/\.pdf$/i, "")
  return { name: `${baseName}-editado.pdf`, bytes }
}
