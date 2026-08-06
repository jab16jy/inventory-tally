import { onCall, HttpsError } from "firebase-functions/v2/https";
import { type Auth, getAuth } from "firebase-admin/auth";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import { desactivarCajeroSchema, type DesactivarCajeroInput } from "@conteo/contracts";
import { exigirAdmin } from "../lib/exigir-admin.js";
import { validar } from "../lib/validar.js";
import { registrarAuditoria } from "../lib/auditoria.js";

/**
 * desactivarCajeroImpl — núcleo de la callable (design.md D-6, gestion-cajeros
 * spec). El perfil se escribe ÚLTIMO a propósito: hace de `activo:false` una
 * señal conservadora (D-3) — un corte entre Auth y Firestore deja al cajero
 * deshabilitado pero aún contado por RF-16, nunca al revés. No limpia claims
 * (`disabled` + tokens revocados ya niegan todo) ni toca `sesiones.participantes`.
 */
export async function desactivarCajeroImpl(
  db: Firestore,
  auth: Auth,
  ejecutadoPor: string,
  input: DesactivarCajeroInput,
): Promise<{ uid: string; desactivado: true }> {
  const { uid } = input;

  try {
    await auth.updateUser(uid, { disabled: true });
  } catch (error) {
    if ((error as { code?: string }).code === "auth/user-not-found") {
      throw new HttpsError("not-found", "Cajero inexistente");
    }
    throw error;
  }
  await auth.revokeRefreshTokens(uid);

  await db.runTransaction(async (tx) => {
    tx.update(db.doc(`usuarios/${uid}`), { activo: false });
    registrarAuditoria(tx, db, {
      tipo: "USUARIO_DESACTIVADO",
      usuarioId: uid,
      ejecutadoPor,
    });
  });

  return { uid, desactivado: true };
}

export const desactivarCajero = onCall({ region: "us-central1" }, async (req) => {
  exigirAdmin(req);
  const datos = validar(req.data, desactivarCajeroSchema);
  return desactivarCajeroImpl(getFirestore(), getAuth(), req.auth!.uid, datos);
});
