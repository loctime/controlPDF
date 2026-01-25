/**
 * Middleware de autenticación con Firebase Admin SDK
 */

import { Request, Response, NextFunction } from "express";
import admin from "firebase-admin";
import { ControlPDFError } from "../utils/errors";

// Inicializar Firebase Admin SDK si no está inicializado
if (!admin.apps.length) {
  // En producción, estas credenciales deben venir de variables de entorno
  // o de un archivo de credenciales de servicio
  const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT_KEY
    ? JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY)
    : undefined;

  if (serviceAccount) {
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });
  } else {
    // Para desarrollo local, puede usar Application Default Credentials
    // o una variable de entorno con la ruta al archivo de credenciales
    try {
      admin.initializeApp({
        credential: admin.credential.applicationDefault(),
      });
    } catch (error) {
      console.warn(
        "Firebase Admin no inicializado. Configura FIREBASE_SERVICE_ACCOUNT_KEY o Application Default Credentials."
      );
    }
  }
}

/**
 * Middleware para verificar el token de Firebase
 * Extrae el userId (uid) del token y lo agrega a req.user
 */
export interface AuthenticatedRequest extends Request {
  user?: {
    uid: string;
    email?: string;
  };
}

export async function verifyFirebaseToken(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      throw new ControlPDFError(
        "UNAUTHORIZED",
        "Token de autenticación faltante o inválido"
      );
    }

    const token = authHeader.split("Bearer ")[1];

    // Verificar el token con Firebase Admin SDK
    const decodedToken = await admin.auth().verifyIdToken(token);

    // Agregar información del usuario a la request
    req.user = {
      uid: decodedToken.uid,
      email: decodedToken.email,
    };

    next();
  } catch (error) {
    if (error instanceof ControlPDFError) {
      res.status(401).json(error.toJSON());
      return;
    }

    // Error de Firebase (token inválido, expirado, etc.)
    res.status(401).json({
      code: "UNAUTHORIZED",
      message: "Token de autenticación inválido o expirado",
    });
  }
}
