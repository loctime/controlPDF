/**
 * Cliente para interactuar con la API de ControlFile
 * ControlPDF nunca accede directamente al storage, siempre usa ControlFile
 */

import axios, { AxiosInstance } from "axios";
import { ControlPDFError } from "../utils/errors";
import {
  ControlFilePresignRequest,
  ControlFilePresignResponse,
  ControlFileConfirmRequest,
  ControlFileConfirmResponse,
  ControlFileDownloadResponse,
} from "../types";

export class ControlFileClient {
  private client: AxiosInstance;
  private baseUrl: string;

  constructor(baseUrl?: string) {
    // URL base de ControlFile API (debe venir de variable de entorno)
    this.baseUrl = baseUrl || process.env.CONTROLFILE_API_URL || "http://localhost:3001";
    this.client = axios.create({
      baseURL: this.baseUrl,
      timeout: 30000, // 30 segundos de timeout
    });
  }

  /**
   * Obtiene una URL presignada para descargar un archivo
   * @param fileId ID del archivo en ControlFile
   * @param token Token de autenticación Firebase
   */
  async getDownloadUrl(
    fileId: string,
    token: string
  ): Promise<string> {
    try {
      const response = await this.client.get<ControlFileDownloadResponse>(
        `/api/files/${fileId}/download`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      return response.data.downloadUrl;
    } catch (error: any) {
      if (axios.isAxiosError(error)) {
        if (error.response?.status === 404) {
          throw new ControlPDFError(
            "INVALID_INPUT",
            `Archivo con ID ${fileId} no encontrado`
          );
        }
        if (error.response?.status === 403) {
          throw new ControlPDFError(
            "UNAUTHORIZED",
            `No tienes permiso para acceder al archivo ${fileId}`
          );
        }
        throw new ControlPDFError(
          "PROCESSING_FAILED",
          `Error al obtener URL de descarga: ${error.message}`
        );
      }
      throw error;
    }
  }

  /**
   * Descarga un archivo usando una URL presignada
   * @param downloadUrl URL presignada para descargar
   */
  async downloadFile(downloadUrl: string): Promise<Buffer> {
    try {
      const response = await axios.get(downloadUrl, {
        responseType: "arraybuffer",
        timeout: 60000, // 60 segundos para descargas grandes
      });

      return Buffer.from(response.data);
    } catch (error: any) {
      throw new ControlPDFError(
        "PROCESSING_FAILED",
        `Error al descargar archivo: ${error.message}`
      );
    }
  }

  /**
   * Obtiene una URL presignada para subir un archivo
   * @param request Información del archivo a subir
   * @param token Token de autenticación Firebase
   */
  async getUploadUrl(
    request: ControlFilePresignRequest,
    token: string
  ): Promise<ControlFilePresignResponse> {
    try {
      const response = await this.client.post<ControlFilePresignResponse>(
        "/api/uploads/presign",
        request,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
        }
      );

      return response.data;
    } catch (error: any) {
      if (axios.isAxiosError(error)) {
        throw new ControlPDFError(
          "PROCESSING_FAILED",
          `Error al obtener URL de subida: ${error.message}`
        );
      }
      throw error;
    }
  }

  /**
   * Sube un archivo a una URL presignada
   * @param uploadUrl URL presignada para subir
   * @param fileBuffer Buffer del archivo a subir
   * @param contentType Tipo de contenido del archivo
   */
  async uploadFile(
    uploadUrl: string,
    fileBuffer: Buffer,
    contentType: string
  ): Promise<void> {
    try {
      await axios.put(uploadUrl, fileBuffer, {
        headers: {
          "Content-Type": contentType,
        },
        timeout: 120000, // 2 minutos para subidas grandes
      });
    } catch (error: any) {
      throw new ControlPDFError(
        "PROCESSING_FAILED",
        `Error al subir archivo: ${error.message}`
      );
    }
  }

  /**
   * Confirma la subida de un archivo y lo registra en ControlFile
   * @param request Información de confirmación
   * @param token Token de autenticación Firebase
   */
  async confirmUpload(
    request: ControlFileConfirmRequest,
    token: string
  ): Promise<ControlFileConfirmResponse> {
    try {
      const response = await this.client.post<ControlFileConfirmResponse>(
        "/api/uploads/confirm",
        request,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
        }
      );

      return response.data;
    } catch (error: any) {
      if (axios.isAxiosError(error)) {
        throw new ControlPDFError(
          "PROCESSING_FAILED",
          `Error al confirmar subida: ${error.message}`
        );
      }
      throw error;
    }
  }
}
