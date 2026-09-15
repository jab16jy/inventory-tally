import { HttpsError, type CallableRequest } from "firebase-functions/v2/https";
import type { Auth } from "firebase-admin/auth";
import { autorizacionDe } from "./exigir-cajero-de-sesion.js";

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

/** `null` = Gerente (sin restricción); `string` = la única sucursal del admin_sucursal. */
export type AlcanceAdmin = string | null;

/**
 * exigirAdminDeSucursal — variante de `exigirAdmin` que también admite
 * `admin_sucursal`, acotado a su única sucursal (D1). Un claim con 0 o 2+
 * sucursales se rechaza antes de leer cualquier recurso (fail-closed).
 */
export function exigirAdminDeSucursal(req: CallableRequest): AlcanceAdmin {
  const auth = autorizacionDe(req);
  if (auth.rol === "admin") {
    return null;
  }
  if (auth.rol === "admin_sucursal" && auth.sucursales.length === 1) {
    return auth.sucursales[0]!;
  }
  throw new HttpsError("permission-denied", "Se requiere rol admin o admin_sucursal.");
}

/**
 * exigirExclusivaDeSucursal — D2: el recurso debe pertenecer EXACTAMENTE a la
 * sucursal del alcance (global o compartido con otra sucursal se rechaza).
 * Gerente (`alcance === null`) no tiene restricción.
 */
export function exigirExclusivaDeSucursal(alcance: AlcanceAdmin, sucursales: unknown): void {
  if (alcance === null) {
    return;
  }
  if (!Array.isArray(sucursales) || sucursales.length !== 1 || sucursales[0] !== alcance) {
    throw new HttpsError("permission-denied", "No tienes acceso a esta sucursal.");
  }
}

/**
 * exigirCajeroDeAlcance — anti-escalada (D3): un `admin_sucursal` sólo puede
 * asignar rol `cajero` en exactamente su propia sucursal. Gerente
 * (`alcance === null`) no tiene restricción.
 */
export function exigirCajeroDeAlcance(
  alcance: AlcanceAdmin,
  rol: unknown,
  sucursales: unknown,
): void {
  if (alcance === null) {
    return;
  }
  if (rol !== "cajero") {
    throw new HttpsError("permission-denied", "Sólo puedes asignar el rol cajero.");
  }
  exigirExclusivaDeSucursal(alcance, sucursales);
}

/**
 * exigirCajeroObjetivo — D3: la autorización sobre el OBJETIVO de
 * actualizar/desactivar/reactivar/eliminarCajero se decide sobre sus custom
 * claims de Auth (doc 09 §2), nunca sobre `usuarios/{uid}`. `alcance ===
 * null` (Gerente) no restringe y NO lee Auth — evita una llamada innecesaria
 * y deja probar el no-op sin depender del estado del emulador.
 */
export async function exigirCajeroObjetivo(
  auth: Auth,
  alcance: AlcanceAdmin,
  uid: string,
): Promise<void> {
  if (alcance === null) {
    return;
  }
  let objetivo;
  try {
    objetivo = await auth.getUser(uid);
  } catch (error) {
    if ((error as { code?: string }).code === "auth/user-not-found") {
      throw new HttpsError("not-found", "Cajero inexistente");
    }
    throw error;
  }
  exigirCajeroDeAlcance(alcance, objetivo.customClaims?.rol, objetivo.customClaims?.sucursales);
}
