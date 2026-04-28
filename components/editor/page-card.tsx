"use client"

import { useSortable } from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { useShallow } from "zustand/react/shallow"
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
import { toast } from "sonner"
import { exportEditor } from "@/lib/editor/export"
import { downloadBytes } from "@/lib/pdf"

const THUMB_WIDTH = 200

interface PageCardProps {
  pageId: PageId
  onSign: (pageId: PageId) => void
  isOverlay?: boolean
}

export function PageCard({ pageId, onSign, isOverlay }: PageCardProps) {
  const entry = useEditorStore((s) => s.pages.find((p) => p.id === pageId))
  const file = useEditorStore((s) =>
    entry ? s.sources[entry.sourceId]?.file ?? null : null,
  )
  const isSelected = useEditorStore((s) => s.selection.pageIds.has(pageId))
  const { rotatePage, deletePage, restorePage, duplicatePage, selectPage, createGroupFromSelection } =
    useEditorStore(
      useShallow((s) => ({
        rotatePage: s.rotatePage,
        deletePage: s.deletePage,
        restorePage: s.restorePage,
        duplicatePage: s.duplicatePage,
        selectPage: s.selectPage,
        createGroupFromSelection: s.createGroupFromSelection,
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
          mode: "reconstruct" as const,
        },
      },
    }

    toast.promise(
      exportEditor(tempState).then((result) => {
        const fileBaseName = file?.name.replace(/\.pdf$/i, "") ?? "documento"
        const finalName = `${fileBaseName}-pag${entry.sourcePageIndex + 1}-texto.pdf`
        downloadBytes(result.pdfs[0].bytes, finalName)
      }),
      {
        loading: "Procesando página con OCR (Reconstrucción)...",
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
        onRotate={entry.deleted ? undefined : () => rotatePage(pageId, 90)}
        onSign={entry.deleted ? undefined : () => onSign(pageId)}
        onDuplicate={entry.deleted ? undefined : () => duplicatePage(pageId)}
        onRemove={entry.deleted ? undefined : () => deletePage(pageId)}
      />
    </div>
  )

  if (isOverlay) return content

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        {content}
      </ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem onClick={() => createGroupFromSelection()}>
          + Agrupar
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem onClick={handleDownloadAsText}>
          Descargar como PDF con texto
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  )
}
