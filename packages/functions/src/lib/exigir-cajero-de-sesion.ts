import { HttpsError, type CallableRequest } from "firebase-functions/v2/https";
import type { DocumentSnapshot } from "firebase-admin/firestore";

export interface AutorizacionCajero {
  readonly uid: string;
  readonly rol: string;
  readonly sucursales: readonly string[];
}

/** El claim puede venir ausente o mal tipado (nadie más lo escribe, pero no se confía). */
function sucursalesDelClaim(valor: unknown): readonly string[] {
  return Array.isArray(valor) ? valor.filter((s): s is string => typeof s === "string") : [];
}

/** Extrae la autorización del request. `unauthenticated` si no hay sesión. */
export function autorizacionDe(req: CallableRequest): AutorizacionCajero {
  if (!req.auth) {
    throw new HttpsError("unauthenticated", "Se requiere autenticación.");
  }
  return {
    uid: req.auth.uid,
    rol: req.auth.token.rol as string,
    sucursales: sucursalesDelClaim(req.auth.token.sucursales),
  };
}

/**
 * exigirAdminOCajeroDeSesion — autoriza una escritura acotada a UNA sesión:
 * admin siempre; cajero sólo si la sesión es de una sucursal de su claim
 * (A-3 / I-6) y está `abierta` (A-4).
 *
 * Recibe el `DocumentSnapshot` que el llamador YA leyó dentro de su propia
 * transacción — a propósito NO hace su propio `get()`. Si leyera la sesión
 * por su cuenta, fuera de esa transacción, se abriría una ventana TOCTOU: el
 * admin podría cerrar la sesión entre esa lectura y el commit del llamador,
 * y la escritura entraría igual sobre un conteo ya cerrado. Al recibir el
 * snapshot de la MISMA transacción, cualquier cierre concurrente invalida la
 * transacción entera (Firestore la reintenta contra el estado nuevo),
 * cerrando la ventana. No "simplificar" esto a un `get()` interno.
 *
 * El claim (`req.auth.token.rol` / `.sucursales`, vía `autorizacionDe`) es la
 * fuente de verdad, nunca `usuarios/{uid}` — mismo criterio anti-escalada de
 * `exigir-admin.ts` (doc 09 §2).
 */
export function exigirAdminOCajeroDeSesion(
  auth: AutorizacionCajero,
  sesion: DocumentSnapshot,
): { readonly sucursalId: string } {
  if (!sesion.exists) {
    throw new HttpsError("not-found", "Sesión inexistente");
  }
  if (sesion.get("estado") !== "abierta") {
    throw new HttpsError("failed-precondition", "El conteo ya está cerrado");
  }
  const sucursalId = sesion.get("sucursalId") as string;
  if (auth.rol !== "admin" && !auth.sucursales.includes(sucursalId)) {
    throw new HttpsError("permission-denied", "No tienes acceso a esta sucursal");
  }
  return { sucursalId };
}
