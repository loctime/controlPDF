export type SourceId = string
export type PageId = string
export type GroupId = string

export interface SourceFile {
  id: SourceId
  file: File
  fileName: string
  pageCount: number | null
  error?: string
}

export interface PageEntry {
  id: PageId
  sourceId: SourceId
  sourcePageIndex: number
  rotation: number
  deleted: boolean
  groupId: GroupId | null
}

export interface Group {
  id: GroupId
  name: string
}

export interface Selection {
  pageIds: Set<PageId>
  anchorId: PageId | null
}

export interface EditorState {
  sources: Record<SourceId, SourceFile>
  sourceOrder: SourceId[]
  pages: PageEntry[]
  groups: Record<GroupId, Group>
  groupOrder: GroupId[]
  selection: Selection
}

export type SelectMode = "single" | "toggle" | "range"
