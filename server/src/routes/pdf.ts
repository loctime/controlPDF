/**
 * Rutas para operaciones de PDF
 */

import { Router, Response } from "express";
import { v4 as uuidv4 } from "uuid";
import { AuthenticatedRequest, verifyFirebaseToken } from "../middleware/auth";
import { ControlFileClient } from "../services/controlfile";
import { mergePDFs, validatePDF } from "../services/pdf";
import { ControlPDFError } from "../utils/errors";
import { MergeRequest, MergeResponse } from "../types";

const router = Router();

// Todas las rutas requieren autenticación
router.use(verifyFirebaseToken);

/**
 * POST /api/pdf/merge
 * Fusiona múltiples PDFs en uno solo
 */
router.post("/merge", async (req: AuthenticatedRequest, res: Response) => {
  try {
    const body = req.body as MergeRequest;
    const userId = req.user!.uid;
    const authToken = req.headers.authorization!.split("Bearer ")[1];

    // Validar que haya al menos 2 PDFs para fusionar
    if (!body.inputs || !Array.isArray(body.inputs) || body.inputs.length < 2) {
      return res.status(400).json({
        code: "INVALID_INPUT",
        message: "Se requieren al menos 2 archivos para fusionar",
      });
    }

    // Validar que context.userId coincida con el token
    if (!body.context || body.context.userId !== userId) {
      return res.status(400).json({
        code: "INVALID_INPUT",
        message: "El userId del contexto debe coincidir con el token de autenticación",
      });
    }

    // Generar jobId único
    const jobId = uuidv4();

    // Crear cliente de ControlFile
    const controlFileClient = new ControlFileClient();

    // Paso 1: Obtener URLs de descarga para todos los PDFs de entrada
    const downloadUrls = await Promise.all(
      body.inputs.map((input) =>
        controlFileClient.getDownloadUrl(input.fileId, authToken)
      )
    );

    // Paso 2: Descargar todos los PDFs
    const pdfBuffers = await Promise.all(
      downloadUrls.map((url) => controlFileClient.downloadFile(url))
    );

    // Paso 3: Validar que todos los archivos sean PDFs válidos
    // (mergePDFs también validará, pero es bueno hacerlo antes)
    for (let i = 0; i < pdfBuffers.length; i++) {
      const isValid = await validatePDF(pdfBuffers[i]);
      if (!isValid) {
        return res.status(400).json({
          code: "INVALID_INPUT",
          message: `El archivo ${body.inputs[i].fileId} no es un PDF válido`,
        });
      }
    }

    // Paso 4: Fusionar los PDFs
    const mergeOptions = body.options || {};
    const mergeResult = await mergePDFs(pdfBuffers, mergeOptions);

    // Paso 5: Obtener URL de subida desde ControlFile
    const presignResponse = await controlFileClient.getUploadUrl(
      {
        fileName: "merged.pdf",
        fileSize: mergeResult.pdfBytes.length,
        mimeType: "application/pdf",
      },
      authToken
    );

    // Paso 6: Subir el PDF fusionado
    const pdfBuffer = Buffer.from(mergeResult.pdfBytes);
    const uploadEtag = await controlFileClient.uploadFile(
      presignResponse.uploadUrl,
      pdfBuffer,
      "application/pdf"
    );

    // Paso 7: Confirmar la subida
    const confirmResponse = await controlFileClient.confirmUpload(
      {
        uploadSessionId: presignResponse.uploadSessionId,
        etag: uploadEtag,
      },
      authToken
    );

    // Paso 8: Retornar respuesta exitosa
    const response: MergeResponse = {
      jobId: jobId,
      status: "completed",
      resultFileId: confirmResponse.fileId,
      resultFileName: "merged.pdf",
      pages: mergeResult.pages,
      size: pdfBuffer.length,
    };

    res.status(200).json(response);
  } catch (error) {
    if (error instanceof ControlPDFError) {
      const statusCode =
        error.code === "UNAUTHORIZED" ? 401 : error.code === "INVALID_INPUT" ? 400 : 500;
      return res.status(statusCode).json(error.toJSON());
    }

    // Error inesperado
    console.error("Error inesperado en /api/pdf/merge:", error);
    res.status(500).json({
      code: "PROCESSING_FAILED",
      message: "Error interno del servidor al procesar la solicitud",
    });
  }
});

export default router;
