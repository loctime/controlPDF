"use client"

import { useSortable } from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { useShallow } from "zustand/react/shallow"
import { PageThumbnail } from "@/components/page-thumbnail"
import { useEditorStore } from "@/lib/editor/store"
import type { PageId } from "@/lib/editor/types"
import { cn } from "@/lib/utils"

const THUMB_WIDTH = 200

interface PageCardProps {
  pageId: PageId
  onSign: (pageId: PageId) => void
}

export function PageCard({ pageId, onSign }: PageCardProps) {
  const entry = useEditorStore((s) => s.pages.find((p) => p.id === pageId))
  const file = useEditorStore((s) =>
    entry ? s.sources[entry.sourceId]?.file ?? null : null,
  )
  const isSelected = useEditorStore((s) => s.selection.pageIds.has(pageId))
  const { rotatePage, deletePage, restorePage, duplicatePage, selectPage } =
    useEditorStore(
      useShallow((s) => ({
        rotatePage: s.rotatePage,
        deletePage: s.deletePage,
        restorePage: s.restorePage,
        duplicatePage: s.duplicatePage,
        selectPage: s.selectPage,
      })),
    )

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: pageId })

  if (!entry || !file) return null

  const style: React.CSSProperties = {
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

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={cn(
        "touch-none focus:outline-none",
        isDragging && "z-10 opacity-80",
      )}
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
}
