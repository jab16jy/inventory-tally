import { HttpsError, type CallableRequest } from "firebase-functions/v2/https";

// 5 minutos: para una operación destructiva e irreversible, el admin debe
// demostrar que sigue siendo él frente al teclado, no que dejó una sesión
// abierta hace horas. Una ventana más larga vuelve el chequeo cosmético.
const VENTANA_REAUTENTICACION_SEGUNDOS = 5 * 60;

/**
 * exigirReautenticacion — exige que el admin se haya autenticado (no sólo
 * refrescado el token) en los últimos 5 minutos, antes de una operación
 * destructiva irreversible (borrado de cajero/sucursal).
 *
 * La propiedad de seguridad que esto compra: `auth_time` marca cuándo
 * ocurrió el login real, y un refresh del ID token NO lo mueve — "In a
 * single session, the Firebase SDKs will refresh a user's ID tokens every
 * hour. Each ID token will have a different `iat` value, but the same
 * `auth_time` value." (node_modules/firebase-admin/lib/auth/token-verifier.d.ts:44).
 * Por eso se compara `auth_time`, no `iat`: un token refrescado en segundo
 * plano no puede colar como si el admin acabara de reautenticarse. El
 * límite: sólo prueba que hubo un login reciente en algún sitio, no que el
 * dispositivo/sesión sea el mismo ni que nadie más tenga esas credenciales.
 */
export function exigirReautenticacion(req: CallableRequest): void {
  if (!req.auth) {
    throw new HttpsError("unauthenticated", "Se requiere autenticación.");
  }
  // ponytail: sin reloj inyectado ni ventana configurable — `Date.now()`
  // directo; los tests construyen `auth_time` relativo a él. `auth_time` va
  // en SEGUNDOS desde epoch, de ahí el /1000: mezclarlo con milisegundos
  // dejaría la guarda siempre abierta o siempre cerrada, y ningún tipo lo
  // detectaría.
  const antiguedadSegundos = Date.now() / 1000 - req.auth.token.auth_time;
  if (antiguedadSegundos > VENTANA_REAUTENTICACION_SEGUNDOS) {
    throw new HttpsError(
      "permission-denied",
      "Por seguridad, vuelve a iniciar sesión para confirmar esta operación.",
    );
  }
}
