"use client"

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

export function PageGrid() {
  const pageIds = useEditorStore(
    useShallow((s) => s.pages.map((p) => p.id)),
  )
  const reorderPages = useEditorStore((s) => s.reorderPages)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    reorderPages(String(active.id), String(over.id))
  }

  if (pageIds.length === 0) return null

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
    >
      <SortableContext items={pageIds} strategy={rectSortingStrategy}>
        <div className="flex flex-wrap gap-3 justify-start">
          {pageIds.map((id) => (
            <PageCard key={id} pageId={id} />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  )
}
