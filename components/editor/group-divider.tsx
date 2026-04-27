"use client"

import { useEffect, useRef, useState } from "react"
import { ArrowDown, ArrowUp, Folder, Trash2 } from "lucide-react"
import { useShallow } from "zustand/react/shallow"
import { useEditorStore } from "@/lib/editor/store"
import { cn } from "@/lib/utils"
import type { GroupId } from "@/lib/editor/types"

interface GroupDividerProps {
  groupId: GroupId | "ungrouped"
  pageCount: number
  isFirst?: boolean
  isLast?: boolean
}

export function GroupDivider({
  groupId,
  pageCount,
  isFirst,
  isLast,
}: GroupDividerProps) {
  const isUngrouped = groupId === "ungrouped"
  const group = useEditorStore((s) =>
    isUngrouped ? null : s.groups[groupId as GroupId] ?? null,
  )
  const { renameGroup, deleteGroup, moveGroup } = useEditorStore(
    useShallow((s) => ({
      renameGroup: s.renameGroup,
      deleteGroup: s.deleteGroup,
      moveGroup: s.moveGroup,
    })),
  )

  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState("")
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus()
      inputRef.current?.select()
    }
  }, [editing])

  const name = isUngrouped ? "Sin agrupar" : group?.name ?? "Grupo"

  const startEdit = () => {
    if (isUngrouped) return
    setDraft(name)
    setEditing(true)
  }

  const commit = () => {
    if (!isUngrouped) renameGroup(groupId as GroupId, draft)
    setEditing(false)
  }

  return (
    <div
      className={cn(
        "flex items-center gap-2 w-full py-2 px-3 rounded-md border-l-4 bg-muted/30",
        isUngrouped
          ? "border-l-muted-foreground/40"
          : "border-l-primary",
      )}
      style={{ flexBasis: "100%" }}
    >
      <Folder
        className={cn(
          "h-4 w-4 shrink-0",
          isUngrouped ? "text-muted-foreground" : "text-primary",
        )}
      />
      {editing ? (
        <input
          ref={inputRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit()
            if (e.key === "Escape") setEditing(false)
          }}
          className="flex-1 min-w-0 bg-transparent text-sm font-medium outline-none border-b border-primary"
        />
      ) : (
        <button
          type="button"
          onClick={startEdit}
          disabled={isUngrouped}
          className={cn(
            "flex-1 min-w-0 truncate text-left text-sm font-medium",
            !isUngrouped && "hover:underline cursor-text",
            isUngrouped && "text-muted-foreground",
          )}
          title={isUngrouped ? undefined : "Click para renombrar"}
        >
          {name}
        </button>
      )}
      <span className="text-xs text-muted-foreground shrink-0">
        {pageCount} {pageCount === 1 ? "página" : "páginas"}
      </span>
      {!isUngrouped && (
        <div className="flex items-center gap-0.5 shrink-0">
          <button
            type="button"
            onClick={() => moveGroup(groupId as GroupId, -1)}
            disabled={isFirst}
            aria-label="Mover grupo arriba"
            className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-30 disabled:hover:bg-transparent"
          >
            <ArrowUp className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => moveGroup(groupId as GroupId, 1)}
            disabled={isLast}
            aria-label="Mover grupo abajo"
            className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-30 disabled:hover:bg-transparent"
          >
            <ArrowDown className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => deleteGroup(groupId as GroupId)}
            aria-label="Disolver grupo"
            title="Disolver grupo (las páginas siguen ahí, sin agrupar)"
            className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
    </div>
  )
}
