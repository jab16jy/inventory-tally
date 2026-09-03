import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import { eliminarAreaSchema, type EliminarAreaInput } from "@conteo/contracts";
import { exigirAdmin } from "../lib/exigir-admin.js";
import { validar } from "../lib/validar.js";
import { registrarAuditoria } from "../lib/auditoria.js";

/**
 * eliminarAreaImpl — núcleo de la callable (docs/plan-panel-administrador.md
 * §3). Borrado FÍSICO, bloqueado por referencias vivas, mismo patrón que
 * `eliminarCategoriaImpl`: sin cascada, historial nunca purgado.
 *
 * ponytail: `LineaConteo.area` deliberadamente NO bloquea el borrado de un
 * área. Es el NOMBRE del área, copiado y congelado en la línea al abrir la
 * sesión (invariante I-7, ver abrir-sesion.ts donde `nombresPorArea` se
 * resuelve una sola vez y se escribe en cada línea) — es una etiqueta
 * desnormalizada, no una foreign key viva. Bloquear por esto haría
 * imborrable para siempre cualquier área que alguna vez apareció en algún
 * conteo, sin ninguna ganancia: la línea histórica sigue mostrando su nombre
 * congelado exista o no el documento de área. La ÚNICA referencia viva a un
 * área es `categoriasValor.areaIds` (N:M, issue #81), que es lo que la
 * guarda de abajo consulta con `array-contains` (misma ventana TOCTOU
 * documentada en eliminar-categoria.ts, y por el mismo motivo: `count()` no
 * puede ir dentro de una transacción).
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
