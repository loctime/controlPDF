/**
 * Tipos TypeScript para el backend de ControlPDF
 */

export interface MergeRequest {
  inputs: Array<{ fileId: string }>;
  options?: {
    keepBookmarks?: boolean;
  };
  context: {
    app: string;
    userId: string;
    ownerId: string;
    source?: "ui" | "automation" | "api";
    correlationId?: string;
  };
}

export interface MergeResponse {
  jobId: string;
  status: "completed";
  resultFileId: string;
  resultFileName: string;
  pages: number;
  size: number;
}

export interface ErrorResponse {
  code: "INVALID_INPUT" | "UNAUTHORIZED" | "PROCESSING_FAILED";
  message: string;
}

export interface ControlFilePresignRequest {
  fileName: string;
  contentType: string;
  metadata?: Record<string, string>;
}

export interface ControlFilePresignResponse {
  uploadUrl: string;
  fileId: string;
}

export interface ControlFileConfirmRequest {
  fileId: string;
  metadata?: Record<string, string>;
}

export interface ControlFileConfirmResponse {
  fileId: string;
  success: boolean;
}

export interface ControlFileDownloadResponse {
  downloadUrl: string;
}
