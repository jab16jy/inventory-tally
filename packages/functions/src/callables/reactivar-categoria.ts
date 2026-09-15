import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import { reactivarCategoriaSchema, type ReactivarCategoriaInput } from "@conteo/contracts";
import {
  exigirAdminDeSucursal,
  exigirExclusivaDeSucursal,
  type AlcanceAdmin,
} from "../lib/exigir-admin.js";
import { validar } from "../lib/validar.js";
import { registrarAuditoria } from "../lib/auditoria.js";

/**
 * reactivarCategoriaImpl — inversa de desactivarCategoriaImpl. Cierra la
 * asimetría con `reactivarCajero`: `desactivarCategoria` no tenía forma de
 * volver atrás salvo editando Firestore a mano. A diferencia de
 * `reactivarCajero` (que invierte deliberadamente el orden Firestore/Auth),
 * aquí no hay cuenta de Auth: es una sola transacción de Firestore, el orden
 * no aplica. Idempotente: no revisa `activa` antes de escribir, igual que
 * `reactivarCajeroImpl` no revisa `activo`.
 */
export async function reactivarCategoriaImpl(
  db: Firestore,
  ejecutadoPor: string,
  input: ReactivarCategoriaInput,
  alcance: AlcanceAdmin,
): Promise<{ categoriaId: string; reactivada: true }> {
  const { categoriaId } = input;
  const categoriaRef = db.doc(`categoriasValor/${categoriaId}`);

  await db.runTransaction(async (tx) => {
    const categoria = await tx.get(categoriaRef);
    if (!categoria.exists) {
      throw new HttpsError("not-found", "Categoría inexistente");
    }
    // D2/S3b: mismo chequeo que desactivarCategoria sobre el valor GUARDADO,
    // antes de cualquier `tx.update` (Gerente sin restricción).
    exigirExclusivaDeSucursal(alcance, categoria.get("sucursalesAsignadas"));

    tx.update(categoriaRef, { activa: true });
    registrarAuditoria(tx, db, {
      tipo: "CATEGORIA_REACTIVADA",
      categoriaId,
      ejecutadoPor,
    });
  });

  return { categoriaId, reactivada: true };
}

// Sin exigir reautenticación reciente: reactivar deshace un desactivar,
// no es una acción destructiva ni irreversible.
export const reactivarCategoria = onCall({ region: "us-central1" }, async (req) => {
  const alcance = exigirAdminDeSucursal(req);
  const datos = validar(req.data, reactivarCategoriaSchema);
  return reactivarCategoriaImpl(getFirestore(), req.auth!.uid, datos, alcance);
});
