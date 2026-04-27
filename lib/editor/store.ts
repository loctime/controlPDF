"use client"

import { create } from "zustand"
import { getPageCount, releaseDocument } from "@/lib/pdf"
import type {
  EditorState,
  PageEntry,
  PageId,
  SelectMode,
  SourceFile,
  SourceId,
} from "./types"

const HISTORY_LIMIT = 50

type SnapshotState = Omit<EditorState, "selection">

interface HistoryFrame {
  past: SnapshotState
}

interface EditorActions {
  addSources: (files: File[]) => void
  removeSource: (id: SourceId) => void
  clearAll: () => void
  reorderPages: (activeId: PageId, overId: PageId) => void
  rotatePage: (id: PageId, delta: number) => void
  rotateSelected: (delta: number) => void
  deletePage: (id: PageId) => void
  deleteSelected: () => void
  restorePage: (id: PageId) => void
  duplicatePage: (id: PageId) => void
  selectPage: (id: PageId, mode: SelectMode) => void
  clearSelection: () => void
  selectAll: () => void
  undo: () => void
  redo: () => void
  canUndo: () => boolean
  canRedo: () => boolean
}

type Store = EditorState & {
  history: HistoryFrame[]
  future: HistoryFrame[]
} & EditorActions

const emptyState = (): EditorState => ({
  sources: {},
  sourceOrder: [],
  pages: [],
  selection: { pageIds: new Set(), anchorId: null },
})

const snapshot = (s: EditorState): SnapshotState => ({
  sources: s.sources,
  sourceOrder: s.sourceOrder,
  pages: s.pages,
})

const newId = () => crypto.randomUUID()

const normalizeRotation = (r: number) => ((r % 360) + 360) % 360

export const useEditorStore = create<Store>((set, get) => {
  const pushHistory = () => {
    const s = get()
    const frame: HistoryFrame = { past: snapshot(s) }
    const next = [...s.history, frame]
    if (next.length > HISTORY_LIMIT) next.shift()
    set({ history: next, future: [] })
  }

  const visiblePageIds = () => get().pages.filter((p) => !p.deleted).map((p) => p.id)

  return {
    ...emptyState(),
    history: [],
    future: [],

    addSources: (files: File[]) => {
      if (files.length === 0) return
      pushHistory()
      const s = get()
      const newSources: Record<SourceId, SourceFile> = { ...s.sources }
      const newOrder: SourceId[] = [...s.sourceOrder]
      const newPages: PageEntry[] = [...s.pages]
      const pendingCounts: Array<{ sid: SourceId; file: File }> = []

      for (const file of files) {
        const sid = newId()
        newSources[sid] = {
          id: sid,
          file,
          fileName: file.name,
          pageCount: null,
        }
        newOrder.push(sid)
        pendingCounts.push({ sid, file })
      }
      set({ sources: newSources, sourceOrder: newOrder, pages: newPages })

      pendingCounts.forEach(({ sid, file }) => {
        getPageCount(file)
          .then((count) => {
            const cur = get()
            if (!cur.sources[sid]) return
            const sources = {
              ...cur.sources,
              [sid]: { ...cur.sources[sid], pageCount: count },
            }
            const entries: PageEntry[] = []
            for (let i = 0; i < count; i++) {
              entries.push({
                id: newId(),
                sourceId: sid,
                sourcePageIndex: i,
                rotation: 0,
                deleted: false,
              })
            }
            set({ sources, pages: [...cur.pages, ...entries] })
          })
          .catch(() => {
            const cur = get()
            if (!cur.sources[sid]) return
            const sources = {
              ...cur.sources,
              [sid]: { ...cur.sources[sid], pageCount: 0, error: "PDF inválido" },
            }
            set({ sources })
          })
      })
    },

    removeSource: (id: SourceId) => {
      const s = get()
      if (!s.sources[id]) return
      pushHistory()
      releaseDocument(s.sources[id].file)
      const { [id]: _, ...rest } = s.sources
      const sourceOrder = s.sourceOrder.filter((sid) => sid !== id)
      const pages = s.pages.filter((p) => p.sourceId !== id)
      const removedIds = new Set(
        s.pages.filter((p) => p.sourceId === id).map((p) => p.id),
      )
      const pageIds = new Set(s.selection.pageIds)
      removedIds.forEach((pid) => pageIds.delete(pid))
      set({
        sources: rest,
        sourceOrder,
        pages,
        selection: {
          pageIds,
          anchorId:
            s.selection.anchorId && removedIds.has(s.selection.anchorId)
              ? null
              : s.selection.anchorId,
        },
      })
    },

    clearAll: () => {
      const s = get()
      Object.values(s.sources).forEach((src) => releaseDocument(src.file))
      set({ ...emptyState(), history: [], future: [] })
    },

    reorderPages: (activeId, overId) => {
      if (activeId === overId) return
      const s = get()
      const fromIdx = s.pages.findIndex((p) => p.id === activeId)
      const toIdx = s.pages.findIndex((p) => p.id === overId)
      if (fromIdx === -1 || toIdx === -1) return
      pushHistory()
      const next = [...s.pages]
      const [moved] = next.splice(fromIdx, 1)
      next.splice(toIdx, 0, moved)
      set({ pages: next })
    },

    rotatePage: (id, delta) => {
      const s = get()
      const idx = s.pages.findIndex((p) => p.id === id)
      if (idx === -1) return
      pushHistory()
      const next = [...s.pages]
      next[idx] = { ...next[idx], rotation: normalizeRotation(next[idx].rotation + delta) }
      set({ pages: next })
    },

    rotateSelected: (delta) => {
      const s = get()
      if (s.selection.pageIds.size === 0) return
      pushHistory()
      const next = s.pages.map((p) =>
        s.selection.pageIds.has(p.id)
          ? { ...p, rotation: normalizeRotation(p.rotation + delta) }
          : p,
      )
      set({ pages: next })
    },

    deletePage: (id) => {
      const s = get()
      const idx = s.pages.findIndex((p) => p.id === id)
      if (idx === -1 || s.pages[idx].deleted) return
      pushHistory()
      const next = [...s.pages]
      next[idx] = { ...next[idx], deleted: true }
      const pageIds = new Set(s.selection.pageIds)
      pageIds.delete(id)
      set({ pages: next, selection: { ...s.selection, pageIds } })
    },

    deleteSelected: () => {
      const s = get()
      if (s.selection.pageIds.size === 0) return
      pushHistory()
      const sel = s.selection.pageIds
      const next = s.pages.map((p) => (sel.has(p.id) ? { ...p, deleted: true } : p))
      set({ pages: next, selection: { pageIds: new Set(), anchorId: null } })
    },

    restorePage: (id) => {
      const s = get()
      const idx = s.pages.findIndex((p) => p.id === id)
      if (idx === -1 || !s.pages[idx].deleted) return
      pushHistory()
      const next = [...s.pages]
      next[idx] = { ...next[idx], deleted: false }
      set({ pages: next })
    },

    duplicatePage: (id) => {
      const s = get()
      const idx = s.pages.findIndex((p) => p.id === id)
      if (idx === -1) return
      pushHistory()
      const src = s.pages[idx]
      const dup: PageEntry = { ...src, id: newId() }
      const next = [...s.pages]
      next.splice(idx + 1, 0, dup)
      set({ pages: next })
    },

    selectPage: (id, mode) => {
      const s = get()
      const visible = visiblePageIds()
      if (!visible.includes(id)) return
      const cur = s.selection
      let pageIds: Set<PageId>
      let anchorId: PageId | null = cur.anchorId

      if (mode === "single") {
        pageIds = new Set([id])
        anchorId = id
      } else if (mode === "toggle") {
        pageIds = new Set(cur.pageIds)
        if (pageIds.has(id)) pageIds.delete(id)
        else pageIds.add(id)
        anchorId = id
      } else {
        // range
        const anchor = cur.anchorId ?? id
        const a = visible.indexOf(anchor)
        const b = visible.indexOf(id)
        if (a === -1 || b === -1) {
          pageIds = new Set([id])
          anchorId = id
        } else {
          const [lo, hi] = a < b ? [a, b] : [b, a]
          pageIds = new Set(visible.slice(lo, hi + 1))
          anchorId = anchor
        }
      }
      set({ selection: { pageIds, anchorId } })
    },

    clearSelection: () => {
      set({ selection: { pageIds: new Set(), anchorId: null } })
    },

    selectAll: () => {
      const ids = new Set(visiblePageIds())
      set({ selection: { pageIds: ids, anchorId: null } })
    },

    undo: () => {
      const s = get()
      if (s.history.length === 0) return
      const last = s.history[s.history.length - 1]
      const present: HistoryFrame = { past: snapshot(s) }
      set({
        sources: last.past.sources,
        sourceOrder: last.past.sourceOrder,
        pages: last.past.pages,
        selection: { pageIds: new Set(), anchorId: null },
        history: s.history.slice(0, -1),
        future: [...s.future, present],
      })
    },

    redo: () => {
      const s = get()
      if (s.future.length === 0) return
      const next = s.future[s.future.length - 1]
      const present: HistoryFrame = { past: snapshot(s) }
      set({
        sources: next.past.sources,
        sourceOrder: next.past.sourceOrder,
        pages: next.past.pages,
        selection: { pageIds: new Set(), anchorId: null },
        history: [...s.history, present],
        future: s.future.slice(0, -1),
      })
    },

    canUndo: () => get().history.length > 0,
    canRedo: () => get().future.length > 0,
  }
})
