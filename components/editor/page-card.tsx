"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { useSortable } from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { useShallow } from "zustand/react/shallow"
import { Loader2, Minus, Plus } from "lucide-react"
import { PageThumbnail } from "@/components/page-thumbnail"
import { useEditorStore } from "@/lib/editor/store"
import type { PageId } from "@/lib/editor/types"
import { cn } from "@/lib/utils"
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu"
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { toast } from "sonner"
import { exportEditor } from "@/lib/editor/export"
import { downloadBytes, renderPageToCanvas } from "@/lib/pdf"

const THUMB_WIDTH = 200
const RENDER_SCALE = 4

interface PageCardProps {
  pageId: PageId
  onSign: (pageId: PageId) => void
  isOverlay?: boolean
}

interface PreviewDialogProps {
  open: boolean
  onClose: () => void
  file: File
  pageNumber: number
  rotation: number
  fileName: string
}

function PagePreviewDialog({ open, onClose, file, pageNumber, rotation, fileName }: PreviewDialogProps) {
  const [src, setSrc] = useState<string | null>(null)
  const [imgSize, setImgSize] = useState<{ w: number; h: number } | null>(null)
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const containerRef = useRef<HTMLDivElement>(null)
  // refs so event handlers always see current values without re-binding
  const stateRef = useRef({ zoom: 1, pan: { x: 0, y: 0 } })
  stateRef.current = { zoom, pan }
  const dragRef = useRef<{ startX: number; startY: number; panX: number; panY: number } | null>(null)

  useEffect(() => {
    if (!open) {
      setSrc(null)
      setImgSize(null)
      setZoom(1)
      setPan({ x: 0, y: 0 })
      return
    }
    renderPageToCanvas(file, pageNumber, { scale: RENDER_SCALE, rotation })
      .then((canvas) => {
        setSrc(canvas.toDataURL())
        // store display size (canvas is RENDER_SCALE× the PDF point size)
        setImgSize({ w: canvas.width / RENDER_SCALE, h: canvas.height / RENDER_SCALE })
      })
      .catch(() => {})
  }, [open, file, pageNumber, rotation])

  const fitToContainer = useCallback(() => {
    if (!imgSize || !containerRef.current) return
    const { clientWidth: cw, clientHeight: ch } = containerRef.current
    const z = Math.max(0.1, Math.min((cw - 32) / imgSize.w, (ch - 32) / imgSize.h, 2))
    const p = { x: (cw - imgSize.w * z) / 2, y: (ch - imgSize.h * z) / 2 }
    stateRef.current = { zoom: z, pan: p }
    setZoom(z)
    setPan(p)
  }, [imgSize])

  useEffect(() => {
    const frame = requestAnimationFrame(fitToContainer)
    return () => cancelAnimationFrame(frame)
  }, [fitToContainer])

  // wheel + drag listeners — bound once per open, read state via stateRef
  useEffect(() => {
    if (!open) return
    let el: HTMLDivElement | null = null

    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const { zoom: z, pan: p } = stateRef.current
      // zoom centered on cursor
      const rect = el!.getBoundingClientRect()
      const cx = e.clientX - rect.left
      const cy = e.clientY - rect.top
      const factor = e.deltaY < 0 ? 1.1 : 0.9
      const newZoom = Math.min(8, Math.max(0.1, z * factor))
      const ratio = newZoom / z
      const newPan = { x: cx - (cx - p.x) * ratio, y: cy - (cy - p.y) * ratio }
      stateRef.current = { zoom: newZoom, pan: newPan }
      setZoom(newZoom)
      setPan(newPan)
    }

    const onMouseDown = (e: MouseEvent) => {
      if (e.button !== 0) return
      dragRef.current = { startX: e.clientX, startY: e.clientY, panX: stateRef.current.pan.x, panY: stateRef.current.pan.y }
      if (el) el.style.cursor = "grabbing"
    }
    const onMouseMove = (e: MouseEvent) => {
      if (!dragRef.current) return
      const { startX, startY, panX, panY } = dragRef.current
      const newPan = { x: panX + e.clientX - startX, y: panY + e.clientY - startY }
      stateRef.current = { ...stateRef.current, pan: newPan }
      setPan(newPan)
    }
    const onMouseUp = () => {
      dragRef.current = null
      if (el) el.style.cursor = "grab"
    }

    const frame = requestAnimationFrame(() => {
      el = containerRef.current
      if (!el) return
      el.addEventListener("wheel", onWheel, { passive: false })
      el.addEventListener("mousedown", onMouseDown)
      window.addEventListener("mousemove", onMouseMove)
      window.addEventListener("mouseup", onMouseUp)
    })
    return () => {
      cancelAnimationFrame(frame)
      if (el) {
        el.removeEventListener("wheel", onWheel)
        el.removeEventListener("mousedown", onMouseDown)
      }
      window.removeEventListener("mousemove", onMouseMove)
      window.removeEventListener("mouseup", onMouseUp)
    }
  }, [open])

  const changeZoom = (factor: number) => {
    if (!containerRef.current) return
    const { clientWidth: cw, clientHeight: ch } = containerRef.current
    const { zoom: z, pan: p } = stateRef.current
    const newZoom = Math.min(8, Math.max(0.1, z * factor))
    const cx = cw / 2
    const cy = ch / 2
    const ratio = newZoom / z
    const newPan = { x: cx - (cx - p.x) * ratio, y: cy - (cy - p.y) * ratio }
    stateRef.current = { zoom: newZoom, pan: newPan }
    setZoom(newZoom)
    setPan(newPan)
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="!max-w-[70vw] !w-[70vw] !h-[96vh] flex flex-col p-0 gap-0 overflow-hidden">
        <div className="flex items-center gap-3 px-4 py-2.5 border-b shrink-0 pr-14">
          <DialogTitle className="text-sm text-muted-foreground font-normal truncate flex-1">
            {fileName} — pág. {pageNumber}
          </DialogTitle>
          <div className="flex items-center gap-1 shrink-0">
            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => changeZoom(0.8)}>
              <Minus className="h-3.5 w-3.5" />
            </Button>
            <button
              className="text-xs w-12 text-center tabular-nums hover:text-primary"
              onClick={fitToContainer}
              title="Ajustar a pantalla"
            >
              {Math.round(zoom * 100)}%
            </button>
            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => changeZoom(1.25)}>
              <Plus className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
        <div
          ref={containerRef}
          className="flex-1 relative overflow-hidden bg-neutral-100 dark:bg-neutral-900 select-none"
          style={{ cursor: "grab" }}
        >
          {src && imgSize ? (
            <img
              src={src}
              alt={`Página ${pageNumber}`}
              style={{
                position: "absolute",
                left: 0,
                top: 0,
                width: imgSize.w,
                height: imgSize.h,
                transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                transformOrigin: "0 0",
                willChange: "transform",
              }}
              draggable={false}
            />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

export function PageCard({ pageId, onSign, isOverlay }: PageCardProps) {
  const [previewOpen, setPreviewOpen] = useState(false)
  const entry = useEditorStore((s) => s.pages.find((p) => p.id === pageId))
  const file = useEditorStore((s) =>
    entry ? s.sources[entry.sourceId]?.file ?? null : null,
  )
  const isSelected = useEditorStore((s) => s.selection.pageIds.has(pageId))
  const selectionCount = useEditorStore((s) => s.selection.pageIds.size)
  const groupName = useEditorStore((s) =>
    entry?.groupId ? (s.groups[entry.groupId]?.name ?? "Grupo") : null
  )
  const { rotatePage, deletePage, restorePage, duplicatePage, selectPage, createGroupFromSelection, deleteGroup } =
    useEditorStore(
      useShallow((s) => ({
        rotatePage: s.rotatePage,
        deletePage: s.deletePage,
        restorePage: s.restorePage,
        duplicatePage: s.duplicatePage,
        selectPage: s.selectPage,
        createGroupFromSelection: s.createGroupFromSelection,
        deleteGroup: s.deleteGroup,
      })),
    )

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: pageId })

  if (!entry || !file) return null

  const style: React.CSSProperties = isOverlay
    ? {
        width: THUMB_WIDTH,
        cursor: "grabbing",
        boxShadow: "0 20px 25px -5px rgb(0 0 0 / 0.2), 0 8px 10px -6px rgb(0 0 0 / 0.2)",
        zIndex: 50,
      }
    : {
        transform: CSS.Translate.toString(transform),
        transition,
        width: THUMB_WIDTH,
      }

  const handleClick = (e: React.MouseEvent) => {
    if (entry.deleted) {
      restorePage(pageId)
      return
    }
    const mode = e.shiftKey ? "range" : e.metaKey || e.ctrlKey ? "toggle" : "single"
    selectPage(pageId, mode)
  }

  const handleDownloadSelected = () => {
    const state = useEditorStore.getState()
    const selectedIds = state.selection.pageIds
    const selectedPages = state.pages.filter((p) => selectedIds.has(p.id) && !p.deleted)
    if (selectedPages.length === 0) return

    const firstName = state.sources[selectedPages[0].sourceId]?.fileName ?? "documento"
    const baseName = firstName.replace(/\.pdf$/i, "")
    const outName = selectedPages.length === 1
      ? `${baseName}-pag${selectedPages[0].sourcePageIndex + 1}.pdf`
      : `${baseName}-seleccion.pdf`

    const tempState = {
      ...state,
      pages: selectedPages,
      groups: {},
      groupOrder: [],
      selection: { pageIds: new Set<PageId>(), anchorId: null },
    }

    toast.promise(
      exportEditor(tempState).then((result) => {
        downloadBytes(result.pdfs[0].bytes, outName)
      }),
      {
        loading: `Exportando ${selectedPages.length} página${selectedPages.length !== 1 ? "s" : ""}…`,
        success: "Descarga lista",
        error: "Error al exportar",
      },
    )
  }

  const handleDownloadGroup = () => {
    const state = useEditorStore.getState()
    const gid = entry?.groupId
    if (!gid) return
    const groupPages = state.pages.filter((p) => p.groupId === gid && !p.deleted)
    if (groupPages.length === 0) return
    const name = state.groups[gid]?.name ?? "grupo"
    const outName = `${name}.pdf`
    const tempState = {
      ...state,
      pages: groupPages,
      groups: {},
      groupOrder: [],
      selection: { pageIds: new Set<PageId>(), anchorId: null },
    }
    toast.promise(
      exportEditor(tempState).then((result) => {
        downloadBytes(result.pdfs[0].bytes, outName)
      }),
      {
        loading: `Exportando grupo "${name}"…`,
        success: "Descarga lista",
        error: "Error al exportar",
      },
    )
  }

  const handleDownloadAsText = async () => {
    const currentState = useEditorStore.getState()
    const tempState = {
      ...currentState,
      pages: [entry],
      groups: {},
      groupOrder: [],
      selection: { pageIds: new Set<PageId>(), anchorId: null },
      globalOps: {
        ocr: {
          enabled: true,
          scope: { kind: "all" as const },
          language: currentState.globalOps.ocr?.language ?? "spa",
          dpi: currentState.globalOps.ocr?.dpi ?? 200,
          mode: "overlay" as const,
        },
      },
    }

    toast.promise(
      exportEditor(tempState).then((result) => {
        const fileBaseName = file?.name.replace(/\.pdf$/i, "") ?? "documento"
        const finalName = `${fileBaseName}-pag${entry.sourcePageIndex + 1}-ocr.pdf`
        downloadBytes(result.pdfs[0].bytes, finalName)
      }),
      {
        loading: "Procesando página con OCR (Capa Oculta)...",
        success: "Descarga completada",
        error: "Error al procesar",
      }
    )
  }

  const content = (
    <div
      ref={isOverlay ? undefined : setNodeRef}
      style={style}
      {...(isOverlay ? {} : attributes)}
      {...(isOverlay ? {} : listeners)}
      className={cn(
        "touch-none focus:outline-none transition-opacity duration-200 rounded-lg",
        !isOverlay && isDragging && "opacity-30",
        isOverlay && "scale-105"
      )}
      onContextMenu={() => {
        if (!isSelected) {
          selectPage(pageId, "single")
        }
      }}
    >
      <PageThumbnail
        file={file}
        pageNumber={entry.sourcePageIndex + 1}
        rotation={entry.rotation}
        width={THUMB_WIDTH}
        selected={isSelected}
        removed={entry.deleted}
        signed={!!entry.signature}
        onClick={handleClick}
        onPreview={() => setPreviewOpen(true)}
        onRotate={entry.deleted ? undefined : () => rotatePage(pageId, 90)}
        onSign={entry.deleted ? undefined : () => onSign(pageId)}
        onDuplicate={entry.deleted ? undefined : () => duplicatePage(pageId)}
        onRemove={entry.deleted ? undefined : () => deletePage(pageId)}
      />
    </div>
  )

  if (isOverlay) return content

  return (
    <>
      <ContextMenu>
        <ContextMenuTrigger asChild>
          {content}
        </ContextMenuTrigger>
        <ContextMenuContent>
          {groupName !== null ? (
            <>
              <ContextMenuItem onClick={handleDownloadGroup}>
                Descargar grupo "{groupName}"
              </ContextMenuItem>
              <ContextMenuItem
                onClick={() => entry?.groupId && deleteGroup(entry.groupId)}
                className="text-destructive focus:text-destructive"
              >
                Disolver grupo
              </ContextMenuItem>
            </>
          ) : (
            <ContextMenuItem onClick={() => createGroupFromSelection()}>
              Crear grupo
            </ContextMenuItem>
          )}
          <ContextMenuSeparator />
          <ContextMenuItem onClick={() => setPreviewOpen(true)}>
            Ver página
          </ContextMenuItem>
          <ContextMenuItem onClick={handleDownloadSelected}>
            {selectionCount > 1
              ? `Descargar seleccionadas (${selectionCount})`
              : "Descargar página"}
          </ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem onClick={handleDownloadAsText}>
            Descargar con OCR (Capa Oculta)
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>

      <PagePreviewDialog
        open={previewOpen}
        onClose={() => setPreviewOpen(false)}
        file={file}
        pageNumber={entry.sourcePageIndex + 1}
        rotation={entry.rotation}
        fileName={file.name}
      />
    </>
  )
}
