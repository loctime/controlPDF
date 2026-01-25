/**
 * Utilidades para manejo de errores consistentes
 */

import { ErrorResponse } from "../types";

export class ControlPDFError extends Error {
  constructor(
    public code: ErrorResponse["code"],
    message: string
  ) {
    super(message);
    this.name = "ControlPDFError";
  }

  toJSON(): ErrorResponse {
    return {
      code: this.code,
      message: this.message,
    };
  }
}

/**
 * Crea una respuesta de error estándar
 */
export function createErrorResponse(
  code: ErrorResponse["code"],
  message: string
): ErrorResponse {
  return { code, message };
}
