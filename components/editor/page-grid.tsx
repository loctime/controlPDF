"use client"

import { Fragment, useState, useMemo } from "react"
import {
  DndContext,
  PointerSensor,
  KeyboardSensor,
  closestCenter,
  useSensor,
  useSensors,
  DragOverlay,
  type DragStartEvent,
  type DragEndEvent,
  type DragOverEvent,
} from "@dnd-kit/core"
import {
  SortableContext,
  rectSortingStrategy,
  sortableKeyboardCoordinates,
} from "@dnd-kit/sortable"
import { Plus } from "lucide-react"
import { useEditorStore } from "@/lib/editor/store"
import { PageCard } from "./page-card"
import { SignModal } from "./sign-modal"
import type { GroupId, PageId } from "@/lib/editor/types"
import { cn } from "@/lib/utils"

const THUMB_WIDTH = 200

function AddPageCard({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{ width: THUMB_WIDTH }}
      className={cn(
        "group flex flex-col rounded-lg border-2 border-dashed border-border bg-card",
        "transition-all duration-150 hover:border-primary/60 hover:bg-primary/5 hover:shadow-sm",
        "focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50",
      )}
      aria-label="Agregar más archivos"
    >
      <div
        className="relative flex w-full flex-col items-center justify-center gap-2 overflow-hidden rounded-t-lg bg-muted/50 text-muted-foreground transition-colors group-hover:text-primary"
        style={{ aspectRatio: "210 / 297" }}
      >
        <Plus className="h-10 w-10 stroke-[1.5]" />
        <span className="text-xs font-medium">Agregar</span>
      </div>
      <div className="flex items-center justify-center px-2 py-1 text-xs text-muted-foreground">
        &nbsp;
      </div>
    </button>
  )
}

interface PageGridProps {
  onAddFiles?: () => void
}

export function PageGrid({ onAddFiles }: PageGridProps) {
  const pages = useEditorStore((s) => s.pages)
  const groupOrder = useEditorStore((s) => s.groupOrder)
  const groups = useEditorStore((s) => s.groups)
  
  const layout = useMemo(() => ({
    pages: pages.map((p) => ({ id: p.id, groupId: p.groupId })),
    groupOrder,
  }), [pages, groupOrder])
  const reorderPages = useEditorStore((s) => s.reorderPages)
  const [signingPageId, setSigningPageId] = useState<PageId | null>(null)
  const [activeId, setActiveId] = useState<PageId | null>(null)
  const [overId, setOverId] = useState<PageId | null>(null)

  const pageGroupMap = useMemo(() => {
    const map = new Map<PageId, GroupId | null>()
    layout.pages.forEach((p) => map.set(p.id, p.groupId))
    return map
  }, [layout.pages])

  const activeGroupId = activeId ? (pageGroupMap.get(activeId) ?? null) : null
  const overGroupId = overId ? (pageGroupMap.get(overId) ?? null) : null
  // group being entered from outside (activeId not in that group)
  const enteringGroupId =
    activeId && overId && overGroupId !== null && overGroupId !== activeGroupId
      ? overGroupId
      : null

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(String(event.active.id) as PageId)
    setOverId(null)
  }

  const handleDragOver = (event: DragOverEvent) => {
    setOverId(event.over ? String(event.over.id) as PageId : null)
  }

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveId(null)
    setOverId(null)
    const { active, over } = event
    if (!over || active.id === over.id) return
    reorderPages(String(active.id), String(over.id))
  }

  const handleDragCancel = () => {
    setActiveId(null)
    setOverId(null)
  }

  const pageIds: PageId[] = layout.pages.map((p) => p.id)
  if (pageIds.length === 0) return null

  const showGroupingUI = layout.groupOrder.length > 0
  const blocks: { groupId: GroupId | null, pages: PageId[] }[] = []
  
  if (showGroupingUI) {
    let currentBlock = { groupId: layout.pages[0]?.groupId ?? null, pages: [] as PageId[] }
    for (const p of layout.pages) {
      if (p.groupId !== currentBlock.groupId) {
        if (currentBlock.pages.length > 0) blocks.push(currentBlock)
        currentBlock = { groupId: p.groupId, pages: [p.id] }
      } else {
        currentBlock.pages.push(p.id)
      }
    }
    if (currentBlock.pages.length > 0) blocks.push(currentBlock)
  } else {
    blocks.push({ groupId: null, pages: layout.pages.map(p => p.id) })
  }

  return (
    <>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
        onDragCancel={handleDragCancel}
      >
        <SortableContext items={pageIds} strategy={rectSortingStrategy}>
          <div className="flex flex-wrap gap-3 justify-start items-start">
            {blocks.map((block, i) => {
              if (block.groupId === null) {
                return (
                  <div key={`ungrouped-${i}`} className="flex flex-wrap gap-3 pt-[35px]">
                    {block.pages.map(id => (
                      <PageCard key={id} pageId={id} onSign={setSigningPageId} />
                    ))}
                  </div>
                )
              }
              const isEntering = enteringGroupId === block.groupId
              return (
                <div
                  key={`group-${block.groupId}-${i}`}
                  className={cn(
                    "relative flex flex-wrap gap-3 rounded-xl p-3 pt-8 min-w-[220px] transition-colors duration-150",
                    isEntering
                      ? "border-[3px] border-blue-400 bg-blue-400/10 ring-2 ring-blue-300/30"
                      : "border-[3px] border-blue-500 bg-blue-500/5",
                  )}
                >
                  <div className="absolute top-0 left-0 -mt-[3px] -ml-[3px] bg-blue-500 text-white px-3 py-0.5 rounded-br-lg rounded-tl-lg font-semibold text-xs shadow-sm">
                    {groups[block.groupId as GroupId]?.name || "Grupo"}
                  </div>
                  {block.pages.map(id => (
                    <PageCard key={id} pageId={id} onSign={setSigningPageId} />
                  ))}
                  {isEntering && (
                    <div
                      style={{ width: THUMB_WIDTH, flexShrink: 0 }}
                      className="rounded-lg border-2 border-dashed border-blue-400 bg-blue-400/10"
                    >
                      <div style={{ aspectRatio: "210 / 297" }} />
                      <div className="py-1" />
                    </div>
                  )}
                </div>
              )
            })}
            {onAddFiles && (
              <div className="pt-[35px]">
                <AddPageCard onClick={onAddFiles} />
              </div>
            )}
          </div>
        </SortableContext>
        <DragOverlay>
          {activeId ? (
            <PageCard pageId={activeId} onSign={setSigningPageId} isOverlay />
          ) : null}
        </DragOverlay>
      </DndContext>
      <SignModal
        pageId={signingPageId}
        onClose={() => setSigningPageId(null)}
      />
    </>
  )
}
