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

export type PageScope =
  | { kind: "all" }
  | { kind: "selected"; pageIds: PageId[] }
  | { kind: "range"; from: number; to: number }

import type {
  CompressLevel,
  ImageFormat,
  MetadataOptions,
  OCRLanguage,
  PageNumberOptions,
  ProtectOptions,
  WatermarkOptions,
} from "@/lib/pdf"

export interface WatermarkOp {
  enabled: boolean
  scope: PageScope
  opts: WatermarkOptions
}
export interface PageNumbersOp {
  enabled: boolean
  scope: PageScope
  opts: PageNumberOptions
}
export interface ProtectOp {
  enabled: boolean
  opts: ProtectOptions
}
export interface MetadataOp {
  enabled: boolean
  opts: MetadataOptions
}
export interface CompressOp {
  enabled: boolean
  level: CompressLevel
}
export interface ConvertOp {
  enabled: boolean
  scope: PageScope
  format: ImageFormat
  dpi: number
}
export interface OcrOp {
  enabled: boolean
  scope: PageScope
  language: OCRLanguage
  dpi: number
}

export interface GlobalOps {
  watermark?: WatermarkOp
  pageNumbers?: PageNumbersOp
  protect?: ProtectOp
  metadata?: MetadataOp
  compress?: CompressOp
  convert?: ConvertOp
  ocr?: OcrOp
}

export type GlobalOpKey = keyof GlobalOps

export interface EditorState {
  sources: Record<SourceId, SourceFile>
  sourceOrder: SourceId[]
  pages: PageEntry[]
  groups: Record<GroupId, Group>
  groupOrder: GroupId[]
  selection: Selection
  globalOps: GlobalOps
}

export type SelectMode = "single" | "toggle" | "range"
