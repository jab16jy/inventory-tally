import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import { desactivarAreaSchema, type DesactivarAreaInput } from "@conteo/contracts";
import { exigirAdmin } from "../lib/exigir-admin.js";
import { validar } from "../lib/validar.js";
import { registrarAuditoria } from "../lib/auditoria.js";

/**
 * desactivarAreaImpl — núcleo de la callable (docs/plan-panel-administrador.md
 * §3). I-7: no toca `sesiones/*\/lineas` — una sesión ya abierta conserva su
 * `area` congelada aunque el área se desactive (mismo patrón que
 * `desactivarCategoriaImpl`).
 */
export async function desactivarAreaImpl(
  db: Firestore,
  ejecutadoPor: string,
  input: DesactivarAreaInput,
): Promise<{ areaId: string; desactivada: true }> {
  const { areaId } = input;
  const areaRef = db.doc(`areas/${areaId}`);

  await db.runTransaction(async (tx) => {
    const area = await tx.get(areaRef);
    if (!area.exists) {
      throw new HttpsError("not-found", "Área inexistente");
    }
    tx.update(areaRef, { activa: false });
    registrarAuditoria(tx, db, {
      tipo: "AREA_DESACTIVADA",
      areaId,
      ejecutadoPor,
    });
  });

  return { areaId, desactivada: true };
}

export const desactivarArea = onCall({ region: "us-central1" }, async (req) => {
  exigirAdmin(req);
  const datos = validar(req.data, desactivarAreaSchema);
  return desactivarAreaImpl(getFirestore(), req.auth!.uid, datos);
});
