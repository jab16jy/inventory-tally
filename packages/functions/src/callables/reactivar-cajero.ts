import { onCall, HttpsError } from "firebase-functions/v2/https";
import { type Auth, getAuth } from "firebase-admin/auth";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import { reactivarCajeroSchema, type ReactivarCajeroInput } from "@conteo/contracts";
import { exigirAdminDeSucursal, exigirCajeroObjetivo } from "../lib/exigir-admin.js";
import { validar } from "../lib/validar.js";
import { registrarAuditoria } from "../lib/auditoria.js";

/**
 * reactivarCajeroImpl — inversa de desactivarCajeroImpl, con el orden
 * DELIBERADAMENTE invertido (docs/plan-panel-administrador.md §3, "El orden
 * de escritura de reactivarCajero no es simétrico por accidente"): Firestore
 * PRIMERO, Auth AL FINAL. `verificarSincronizacion` (lib/sincronizacion.ts:72-76)
 * excluye de la puerta de cierre a cualquier participante cuyo
 * `usuarios/{uid}.activo === false`. Si Auth se habilitara primero y el
 * proceso muriera antes de escribir Firestore, quedaría un cajero que PUEDE
 * iniciar sesión y contar pero al que el cierre sigue ignorando: sus conteos
 * sin sincronizar se perderían en silencio. Con Firestore primero, el peor
 * corte deja a un cajero que no puede entrar pero sigue bloqueando el
 * cierre — molesto y reversible, nunca pérdida de datos.
 *
 * Sin `revokeRefreshTokens` (desactivarCajero ya los revocó, nada que
 * invalidar) y sin reescribir claims (desactivarCajero nunca los limpió).
 */
export async function reactivarCajeroImpl(
  db: Firestore,
  auth: Auth,
  ejecutadoPor: string,
  input: ReactivarCajeroInput,
): Promise<{ uid: string; reactivado: true }> {
  const { uid } = input;
  const perfilRef = db.doc(`usuarios/${uid}`);

  await db.runTransaction(async (tx) => {
    const perfil = await tx.get(perfilRef);
    if (!perfil.exists) {
      throw new HttpsError("not-found", "Cajero inexistente");
    }
    tx.update(perfilRef, { activo: true });
    registrarAuditoria(tx, db, {
      tipo: "USUARIO_ACTUALIZADO",
      usuarioId: uid,
      // Mismo `campos` que actualizarCajero: sin él, USUARIO_ACTUALIZADO no
      // distingue una reactivación de un cambio de nombre, y la pantalla de
      // auditoría no puede explicar qué pasó.
      campos: ["activo"],
      ejecutadoPor,
    });
  });

  await auth.updateUser(uid, { disabled: false });

  return { uid, reactivado: true };
}

export const reactivarCajero = onCall({ region: "us-central1" }, async (req) => {
  const alcance = exigirAdminDeSucursal(req);
  const datos = validar(req.data, reactivarCajeroSchema);
  // D3/S4-desactivar-reactivar: el objetivo debe ser ACTUALMENTE un cajero
  // exclusivo de la sucursal del admin_sucursal (claims, nunca `usuarios/{uid}`).
  // desactivarCajeroImpl nunca limpia claims, así que un objetivo ya
  // desactivado sigue siendo legible aquí.
  await exigirCajeroObjetivo(getAuth(), alcance, datos.uid);
  return reactivarCajeroImpl(getFirestore(), getAuth(), req.auth!.uid, datos);
});
