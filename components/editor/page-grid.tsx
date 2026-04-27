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
} from "@dnd-kit/core"
import {
  SortableContext,
  rectSortingStrategy,
  sortableKeyboardCoordinates,
} from "@dnd-kit/sortable"
import { useEditorStore } from "@/lib/editor/store"
import { PageCard } from "./page-card"
import { SignModal } from "./sign-modal"
import type { GroupId, PageId } from "@/lib/editor/types"

export function PageGrid() {
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

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(String(event.active.id) as PageId)
  }

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveId(null)
    const { active, over } = event
    if (!over || active.id === over.id) return
    reorderPages(String(active.id), String(over.id))
  }

  const handleDragCancel = () => {
    setActiveId(null)
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
              return (
                <div key={`group-${block.groupId}-${i}`} className="relative flex flex-wrap gap-3 border-[3px] border-blue-500 rounded-xl p-3 pt-8 bg-blue-500/5 min-w-[220px]">
                  <div className="absolute top-0 left-0 -mt-[3px] -ml-[3px] bg-blue-500 text-white px-3 py-0.5 rounded-br-lg rounded-tl-lg font-semibold text-xs shadow-sm">
                    {groups[block.groupId as GroupId]?.name || "Grupo"}
                  </div>
                  {block.pages.map(id => (
                    <PageCard key={id} pageId={id} onSign={setSigningPageId} />
                  ))}
                </div>
              )
            })}
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
