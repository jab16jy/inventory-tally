import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import { reactivarAreaSchema, type ReactivarAreaInput } from "@conteo/contracts";
import { exigirAdmin } from "../lib/exigir-admin.js";
import { validar } from "../lib/validar.js";
import { registrarAuditoria } from "../lib/auditoria.js";

/**
 * reactivarAreaImpl — inversa de desactivarAreaImpl. Mismo patrón que
 * `reactivarCategoriaImpl`: cierra la asimetría con `reactivarCajero`, y sin
 * cuenta de Auth de por medio el orden de escritura no aplica (una sola
 * transacción de Firestore). Idempotente: no revisa `activa` antes de
 * escribir.
 */
export async function reactivarAreaImpl(
  db: Firestore,
  ejecutadoPor: string,
  input: ReactivarAreaInput,
): Promise<{ areaId: string; reactivada: true }> {
  const { areaId } = input;
  const areaRef = db.doc(`areas/${areaId}`);

  await db.runTransaction(async (tx) => {
    const area = await tx.get(areaRef);
    if (!area.exists) {
      throw new HttpsError("not-found", "Área inexistente");
    }
    tx.update(areaRef, { activa: true });
    registrarAuditoria(tx, db, {
      tipo: "AREA_REACTIVADA",
      areaId,
      ejecutadoPor,
    });
  });

  return { areaId, reactivada: true };
}

// Sin exigir reautenticación reciente: reactivar deshace un desactivar,
// no es una acción destructiva ni irreversible.
export const reactivarArea = onCall({ region: "us-central1" }, async (req) => {
  exigirAdmin(req);
  const datos = validar(req.data, reactivarAreaSchema);
  return reactivarAreaImpl(getFirestore(), req.auth!.uid, datos);
});
