import { onCall, HttpsError } from "firebase-functions/v2/https";
import { type Auth, getAuth } from "firebase-admin/auth";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import { actualizarCajeroSchema, type ActualizarCajeroInput } from "@conteo/contracts";
import {
  exigirAdminDeSucursal,
  exigirCajeroDeAlcance,
  exigirCajeroObjetivo,
} from "../lib/exigir-admin.js";
import { validar } from "../lib/validar.js";
import { registrarAuditoria } from "../lib/auditoria.js";

/**
 * actualizarCajeroImpl — núcleo de la callable (design.md D-6, gestion-cajeros
 * spec). Objeto siempre completo (reemplazo total), pero la revocación de
 * tokens SÓLO se dispara si `rol`/`sucursalesAsignadas` difieren de lo
 * almacenado: un cambio de sólo `nombre` no fuerza un nuevo inicio de sesión.
 * Total-overwrite ⇒ una falla parcial converge con un reintento, sin compensación.
 */
export async function actualizarCajeroImpl(
  db: Firestore,
  auth: Auth,
  ejecutadoPor: string,
  input: ActualizarCajeroInput,
): Promise<{ uid: string; actualizado: true }> {
  const { uid, nombre, rol, sucursalesAsignadas } = input;
  const perfilRef = db.doc(`usuarios/${uid}`);
  const perfilAntes = await perfilRef.get();
  if (!perfilAntes.exists) {
    throw new HttpsError("not-found", "Cajero inexistente");
  }

  const campos: string[] = [];
  if (perfilAntes.get("nombre") !== nombre) campos.push("nombre");

  const rolCambio = perfilAntes.get("rol") !== rol;
  const sucursalesAntes = (perfilAntes.get("sucursalesAsignadas") as string[] | undefined) ?? [];
  const sucursalesCambio =
    JSON.stringify([...sucursalesAntes].sort()) !== JSON.stringify([...sucursalesAsignadas].sort());
  if (rolCambio) campos.push("rol");
  if (sucursalesCambio) campos.push("sucursalesAsignadas");

  if (rolCambio || sucursalesCambio) {
    await auth.setCustomUserClaims(uid, { rol, sucursales: sucursalesAsignadas });
    await auth.revokeRefreshTokens(uid);
  }

  await db.runTransaction(async (tx) => {
    tx.update(perfilRef, { nombre, rol, sucursalesAsignadas });
    registrarAuditoria(tx, db, {
      tipo: "USUARIO_ACTUALIZADO",
      usuarioId: uid,
      usuarioNombre: nombre,
      campos,
      ejecutadoPor,
    });
  });

  return { uid, actualizado: true };
}

export const actualizarCajero = onCall({ region: "us-central1" }, async (req) => {
  const alcance = exigirAdminDeSucursal(req);
  const datos = validar(req.data, actualizarCajeroSchema);
  // D3/S4-actualizar: anti-escalada de entrada + el objetivo debe ser
  // ACTUALMENTE un cajero exclusivo de la sucursal del admin_sucursal (claims,
  // nunca `usuarios/{uid}`).
  exigirCajeroDeAlcance(alcance, datos.rol, datos.sucursalesAsignadas);
  await exigirCajeroObjetivo(getAuth(), alcance, datos.uid);
  return actualizarCajeroImpl(getFirestore(), getAuth(), req.auth!.uid, datos);
});
