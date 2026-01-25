/**
 * Punto de entrada del servidor ControlPDF
 */

import express, { Express, Request, Response } from "express";
import pdfRoutes from "./routes/pdf";

const app: Express = express();
const PORT = process.env.PORT || 3002;

// Middleware para parsear JSON
app.use(express.json({ limit: "50mb" }));

// Middleware para logging (opcional, útil para debugging)
app.use((req: Request, res: Response, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

// Health check endpoint
app.get("/health", (req: Request, res: Response) => {
  res.json({ status: "ok", service: "controlpdf" });
});

// Rutas de PDF
app.use("/api/pdf", pdfRoutes);

// Manejo de rutas no encontradas
app.use((req: Request, res: Response) => {
  res.status(404).json({
    code: "NOT_FOUND",
    message: "Endpoint no encontrado",
  });
});

// Manejo de errores globales
app.use((err: Error, req: Request, res: Response, next: any) => {
  console.error("Error no manejado:", err);
  res.status(500).json({
    code: "PROCESSING_FAILED",
    message: "Error interno del servidor",
  });
});

// Iniciar servidor
app.listen(PORT, () => {
  console.log(`🚀 ControlPDF Backend ejecutándose en puerto ${PORT}`);
  console.log(`📄 Health check: http://localhost:${PORT}/health`);
  console.log(`🔗 Merge endpoint: http://localhost:${PORT}/api/pdf/merge`);
});
