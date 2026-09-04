import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import { eliminarAreaSchema, type EliminarAreaInput } from "@conteo/contracts";
import { exigirAdmin } from "../lib/exigir-admin.js";
import { validar } from "../lib/validar.js";
import { registrarAuditoria } from "../lib/auditoria.js";

/**
 * eliminarAreaImpl — núcleo de la callable (docs/plan-panel-administrador.md
 * §3, issue #86). Borrado FÍSICO, bloqueado por referencias vivas en catálogo
 * (categoriasValor). Mismo patrón que `eliminarCategoriaImpl`: sin cascada,
 * historial nunca purgado.
 *
 * NO hay guarda por conteos activos (`lineas.porArea`). Se evaluó y se
 * descartó (issue #86, corrección del veredicto de Judgment Day): la única
 * forma correcta de implementarla es un campo materializado nuevo en
 * `LineaConteo` (p.ej. `areasPresentes: string[]`, mismo patrón que
 * `categoriaId` — ver el índice de `eliminarCategoriaImpl` abajo), que exige
 * tocar el trigger `onAporteEscrito`, `reconciliarLineas`, `abrirSesion`
 * (siembra) y **todo fixture existente que construye un `LineaConteo`** (26+
 * archivos a la fecha de esta decisión, ninguno relacionado con áreas). El
 * costo real de esa guarda es desproporcionado frente a lo que protege:
 * `porArea` no fija ningún dato del área en la línea (a diferencia de
 * `valorUnitario`/`etiqueta` de `categoriaId`, protegidos por I-7) — un
 * `areaId` que pasa a apuntar a un área borrada sólo degrada a mostrar el id
 * crudo en pantalla (ya cubierto por el fallback `?? areaId` en
 * AnalisisConteoScreen/FinalizarScreen), nunca corrompe ni pierde un conteo.
 * Es exactamente la misma garantía por la que `eliminarCategoriaImpl` no
 * necesita compensar sus referencias colgantes.
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
