import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import { desactivarCategoriaSchema, type DesactivarCategoriaInput } from "@conteo/contracts";
import {
  exigirAdminDeSucursal,
  exigirExclusivaDeSucursal,
  type AlcanceAdmin,
} from "../lib/exigir-admin.js";
import { validar } from "../lib/validar.js";
import { registrarAuditoria } from "../lib/auditoria.js";

/**
 * desactivarCategoriaImpl — núcleo de la callable (docs/plan-panel-administrador.md
 * §3). I-7: no toca `sesiones/*\/lineas` — una sesión ya abierta conserva su
 * línea con el `valorUnitario` congelado aunque la categoría se desactive
 * ("Invariante I-7 en las categorías" en ese mismo §3).
 */
export async function desactivarCategoriaImpl(
  db: Firestore,
  ejecutadoPor: string,
  input: DesactivarCategoriaInput,
  alcance: AlcanceAdmin,
): Promise<{ categoriaId: string; desactivada: true }> {
  const { categoriaId } = input;
  const categoriaRef = db.doc(`categoriasValor/${categoriaId}`);

  await db.runTransaction(async (tx) => {
    const categoria = await tx.get(categoriaRef);
    if (!categoria.exists) {
      throw new HttpsError("not-found", "Categoría inexistente");
    }
    // D2/S3b: mismo chequeo que actualizarCategoria sobre el valor GUARDADO,
    // antes de cualquier `tx.update` (Gerente sin restricción).
    exigirExclusivaDeSucursal(alcance, categoria.get("sucursalesAsignadas"));

    tx.update(categoriaRef, { activa: false });
    registrarAuditoria(tx, db, {
      tipo: "CATEGORIA_DESACTIVADA",
      categoriaId,
      ejecutadoPor,
    });
  });

  return { categoriaId, desactivada: true };
}

export const desactivarCategoria = onCall({ region: "us-central1" }, async (req) => {
  const alcance = exigirAdminDeSucursal(req);
  const datos = validar(req.data, desactivarCategoriaSchema);
  return desactivarCategoriaImpl(getFirestore(), req.auth!.uid, datos, alcance);
});
