import { HttpsError, type CallableRequest } from "firebase-functions/v2/https";

/**
 * exigirAdmin — autorización antes de cualquier lectura (doc 08 §5).
 * Los custom claims son la fuente de verdad, nunca el documento `usuarios/{uid}`
 * (doc 09 §2): confiar en éste permitiría escalar privilegios si alguien lograra
 * escribirlo.
 */
export function exigirAdmin(req: CallableRequest): void {
  if (!req.auth) {
    throw new HttpsError("unauthenticated", "Se requiere autenticación.");
  }
  if (req.auth.token.rol !== "admin") {
    throw new HttpsError("permission-denied", "Se requiere rol admin.");
  }
}
