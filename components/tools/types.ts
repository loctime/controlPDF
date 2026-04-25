import type { FileItem } from "@/components/file-list"

export interface ToolPanelProps {
  files: FileItem[]
  isProcessing: boolean
  setIsProcessing: (v: boolean) => void
  setFiles: (updater: FileItem[] | ((prev: FileItem[]) => FileItem[])) => void
  onRemoveFile: (id: string) => void
  onClearFiles: () => void
}
