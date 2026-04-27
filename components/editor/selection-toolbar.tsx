"use client"

import {
  Copy,
  FolderMinus,
  FolderPlus,
  RotateCcw,
  RotateCw,
  Trash2,
  X,
} from "lucide-react"
import { useShallow } from "zustand/react/shallow"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { useEditorStore } from "@/lib/editor/store"

export function SelectionToolbar() {
  const count = useEditorStore((s) => s.selection.pageIds.size)
  const groups = useEditorStore(
    useShallow((s) => s.groupOrder.map((id) => s.groups[id]).filter(Boolean)),
  )
  const {
    rotateSelected,
    deleteSelected,
    clearSelection,
    duplicatePage,
    selection,
    createGroupFromSelection,
    ungroupSelection,
    assignSelectionToGroup,
  } = useEditorStore(
    useShallow((s) => ({
      rotateSelected: s.rotateSelected,
      deleteSelected: s.deleteSelected,
      clearSelection: s.clearSelection,
      duplicatePage: s.duplicatePage,
      selection: s.selection,
      createGroupFromSelection: s.createGroupFromSelection,
      ungroupSelection: s.ungroupSelection,
      assignSelectionToGroup: s.assignSelectionToGroup,
    })),
  )

  if (count === 0) return null

  const handleDuplicate = () => {
    Array.from(selection.pageIds).forEach((id) => duplicatePage(id))
  }

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-30 flex items-center gap-1 rounded-lg border bg-card shadow-lg px-2 py-1.5">
      <span className="text-xs text-muted-foreground px-2">
        {count} {count === 1 ? "página" : "páginas"}
      </span>
      <div className="h-5 w-px bg-border mx-1" />
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => rotateSelected(-90)}
            aria-label="Rotar selección -90°"
          >
            <RotateCcw className="h-4 w-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          <p>Rotar páginas -90°</p>
        </TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => rotateSelected(90)}
            aria-label="Rotar selección +90°"
          >
            <RotateCw className="h-4 w-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          <p>Rotar páginas +90°</p>
        </TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="ghost" size="sm" onClick={handleDuplicate} aria-label="Duplicar selección">
            <Copy className="h-4 w-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          <p>Duplicar páginas seleccionadas</p>
        </TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            onClick={deleteSelected}
            aria-label="Eliminar selección"
            className="text-destructive hover:text-destructive"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          <p>Eliminar páginas seleccionadas</p>
        </TooltipContent>
      </Tooltip>
      <div className="h-5 w-px bg-border mx-1" />
      <DropdownMenu>
        <Tooltip>
          <TooltipTrigger asChild>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" aria-label="Agrupar selección">
                <FolderPlus className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
          </TooltipTrigger>
          <TooltipContent>
            <p>Crear o mover a grupo</p>
          </TooltipContent>
        </Tooltip>
        <DropdownMenuContent align="center" side="top">
          <DropdownMenuItem onClick={() => createGroupFromSelection()}>
            Nuevo grupo
          </DropdownMenuItem>
          {groups.length > 0 && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuLabel>Mover a grupo</DropdownMenuLabel>
              {groups.map((g) => (
                <DropdownMenuItem
                  key={g.id}
                  onClick={() => assignSelectionToGroup(g.id)}
                >
                  {g.name}
                </DropdownMenuItem>
              ))}
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            onClick={ungroupSelection}
            aria-label="Quitar de grupo"
          >
            <FolderMinus className="h-4 w-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          <p>Quitar páginas del grupo actual</p>
        </TooltipContent>
      </Tooltip>
      <div className="h-5 w-px bg-border mx-1" />
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            onClick={clearSelection}
            aria-label="Limpiar selección"
          >
            <X className="h-4 w-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          <p>Deseleccionar todas las páginas</p>
        </TooltipContent>
      </Tooltip>
    </div>
  )
}
