import type { ZodType } from "zod";
import { HttpsError } from "firebase-functions/v2/https";

/**
 * validar — nunca confiar en req.data (doc 08 §5). Cada callable valida su
 * entrada contra el esquema Zod correspondiente de @conteo/contracts antes de
 * tocar Firestore.
 */
export function validar<T>(datos: unknown, esquema: ZodType<T>): T {
  const resultado = esquema.safeParse(datos);
  if (!resultado.success) {
    throw new HttpsError("invalid-argument", resultado.error.message);
  }
  return resultado.data;
}
