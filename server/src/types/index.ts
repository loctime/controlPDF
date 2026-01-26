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
  fileName?: string;
  name?: string;
  fileSize?: number;
  size?: number;
  mimeType?: string;
  mime?: string;
}

export interface ControlFilePresignResponse {
  uploadSessionId: string;
  uploadUrl: string;
  fileKey: string;
}

export interface ControlFileConfirmRequest {
  uploadSessionId: string;
  etag?: string;
  parts?: Array<{ partNumber: number; etag: string }>;
}

export interface ControlFileConfirmResponse {
  fileId: string;
}

export interface ControlFileDownloadResponse {
  downloadUrl: string;
  fileName: string;
  fileSize: number;
}
