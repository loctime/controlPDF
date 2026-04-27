"use client"

import { Fragment, useState } from "react"
import {
  DndContext,
  PointerSensor,
  KeyboardSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core"
import {
  SortableContext,
  rectSortingStrategy,
  sortableKeyboardCoordinates,
} from "@dnd-kit/sortable"
import { useShallow } from "zustand/react/shallow"
import { useEditorStore } from "@/lib/editor/store"
import { PageCard } from "./page-card"
import { GroupDivider } from "./group-divider"
import { SignModal } from "./sign-modal"
import type { GroupId, PageId } from "@/lib/editor/types"

export function PageGrid() {
  const layout = useEditorStore(
    useShallow((s) => ({
      pages: s.pages.map((p) => ({ id: p.id, groupId: p.groupId })),
      groupOrder: s.groupOrder,
    })),
  )
  const reorderPages = useEditorStore((s) => s.reorderPages)
  const [signingPageId, setSigningPageId] = useState<PageId | null>(null)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    reorderPages(String(active.id), String(over.id))
  }

  const pageIds: PageId[] = layout.pages.map((p) => p.id)
  if (pageIds.length === 0) return null

  // Build interleaved render list: divider + pages, with divider at every
  // group boundary (including the implicit "Sin agrupar" first group when
  // there are ungrouped pages while groups exist).
  const showGroupingUI = layout.groupOrder.length > 0
  type Item =
    | { kind: "divider"; groupId: GroupId | "ungrouped"; count: number; isFirst: boolean; isLast: boolean }
    | { kind: "page"; id: PageId }
  const items: Item[] = []
  if (showGroupingUI) {
    let lastGroupId: GroupId | null | "__init__" = "__init__"
    for (const p of layout.pages) {
      const cur = p.groupId
      if (cur !== lastGroupId) {
        const groupKey: GroupId | "ungrouped" = cur ?? "ungrouped"
        const count = layout.pages.filter((q) => q.groupId === cur).length
        const groupIndex =
          cur === null ? -1 : layout.groupOrder.indexOf(cur)
        const isFirst = cur === null ? true : groupIndex === 0
        const isLast =
          cur === null
            ? layout.groupOrder.length === 0
            : groupIndex === layout.groupOrder.length - 1
        items.push({ kind: "divider", groupId: groupKey, count, isFirst, isLast })
        lastGroupId = cur
      }
      items.push({ kind: "page", id: p.id })
    }
  } else {
    for (const p of layout.pages) items.push({ kind: "page", id: p.id })
  }

  return (
    <>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext items={pageIds} strategy={rectSortingStrategy}>
          <div className="flex flex-wrap gap-3 justify-start items-start">
            {items.map((it, i) =>
              it.kind === "page" ? (
                <PageCard
                  key={it.id}
                  pageId={it.id}
                  onSign={setSigningPageId}
                />
              ) : (
                <Fragment key={`div-${it.groupId}-${i}`}>
                  <GroupDivider
                    groupId={it.groupId}
                    pageCount={it.count}
                    isFirst={it.isFirst}
                    isLast={it.isLast}
                  />
                </Fragment>
              ),
            )}
          </div>
        </SortableContext>
      </DndContext>
      <SignModal
        pageId={signingPageId}
        onClose={() => setSigningPageId(null)}
      />
    </>
  )
}
