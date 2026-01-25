/**
 * Service for ControlPDF API operations
 */

export interface MergeRequest {
  inputs: Array<{ fileId: string }>
  options: {
    keepBookmarks: boolean
  }
  context: {
    app: string
    userId: string
    ownerId: string
    source: string
    correlationId?: string
  }
}

export interface MergeResponse {
  jobId: string
  status: string
  resultFileId: string
  resultFileName: string
  pages: number
  size: number
}

export interface ApiError {
  code: string
  message: string
}

class ControlPDFService {
  private baseUrl: string

  constructor() {
    this.baseUrl = process.env.NEXT_PUBLIC_CONTROLPDF_API_URL || 'http://localhost:3001'
  }

  async mergePDFs(
    request: MergeRequest,
    idToken: string
  ): Promise<MergeResponse> {
    const response = await fetch(`${this.baseUrl}/api/pdf/merge`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${idToken}`,
      },
      body: JSON.stringify(request),
    })

    if (!response.ok) {
      const error: ApiError = await response.json()
      throw new Error(error.message || 'Error al fusionar PDFs')
    }

    return response.json()
  }
}

export const controlPDFService = new ControlPDFService()
