import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import { eliminarAreaSchema, type EliminarAreaInput } from "@conteo/contracts";
import { exigirAdmin } from "../lib/exigir-admin.js";
import { validar } from "../lib/validar.js";
import { registrarAuditoria } from "../lib/auditoria.js";

/**
 * eliminarAreaImpl — núcleo de la callable (docs/plan-panel-administrador.md
 * §3, issue #86). Borrado FÍSICO, bloqueado por referencias vivas en catálogo
 * (categoriasValor) y en conteos activos (lineas.porArea). Mismo patrón que
 * `eliminarCategoriaImpl`: sin cascada, historial nunca purgado.
 */
export async function eliminarAreaImpl(
  db: Firestore,
  ejecutadoPor: string,
  input: EliminarAreaInput,
): Promise<{ areaId: string; eliminada: true }> {
  const { areaId } = input;
  const areaRef = db.doc(`areas/${areaId}`);

  const usos = await db
    .collection("categoriasValor")
    .where("areaIds", "array-contains", areaId)
    .count()
    .get();
  const n = usos.data().count;
  if (n > 0) {
    throw new HttpsError(
      "failed-precondition",
      `No se puede eliminar: usada en ${n} ${n === 1 ? "categoría" : "categorías"}.`,
    );
  }

  const usosEnLineas = await db
    .collectionGroup("lineas")
    .where(`porArea.${areaId}`, ">", 0)
    .count()
    .get();
  if (usosEnLineas.data().count > 0) {
    throw new HttpsError("failed-precondition", "No se puede eliminar: usada en conteos activos");
  }

  await db.runTransaction(async (tx) => {
    const area = await tx.get(areaRef);
    if (!area.exists) {
      throw new HttpsError("not-found", "Área inexistente");
    }
    tx.delete(areaRef);
    registrarAuditoria(tx, db, {
      tipo: "AREA_ELIMINADA",
      areaId,
      ejecutadoPor,
    });
  });

  return { areaId, eliminada: true };
}

export const eliminarArea = onCall({ region: "us-central1" }, async (req) => {
  exigirAdmin(req);
  const datos = validar(req.data, eliminarAreaSchema);
  return eliminarAreaImpl(getFirestore(), req.auth!.uid, datos);
});
