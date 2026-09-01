import { HttpsError, onCall } from "firebase-functions/v2/https";
import { FieldValue, getFirestore, type Firestore } from "firebase-admin/firestore";
import { actualizarCategoriaSchema, type ActualizarCategoriaInput } from "@conteo/contracts";
import { exigirAdmin } from "../lib/exigir-admin.js";
import { validar } from "../lib/validar.js";
import { registrarAuditoria } from "../lib/auditoria.js";

/**
 * actualizarCategoriaImpl — núcleo de la callable (docs/plan-panel-administrador.md
 * §3). Editables: `etiqueta`, `valor`, `orden`, `areaId`, `sucursalesAsignadas`
 * — mismo conjunto que crearCategoriaImpl. `activa`/`creadaEn` los maneja
 * desactivar/reactivarCategoria (I-7), no esta callable. Sin guarda de
 * nombre duplicado: a diferencia de área, `categoriasValor` no tiene esa
 * invariante (ver crear-categoria.ts).
 *
 * `areaId`/`sucursalesAsignadas` son opcionales en el modelo: si el input
 * los omite, se borra el campo con `FieldValue.delete()` en vez de dejar un
 * `undefined` (que `tx.update` rechaza) — así una edición puede quitar un
 * área o volver una categoría "nombrada" a global.
 */
export async function actualizarCategoriaImpl(
  db: Firestore,
  ejecutadoPor: string,
  input: ActualizarCategoriaInput,
): Promise<{ categoriaId: string; actualizada: true }> {
  const { categoriaId, etiqueta, valor, orden, areaId, sucursalesAsignadas } = input;
  const categoriaRef = db.doc(`categoriasValor/${categoriaId}`);

  await db.runTransaction(async (tx) => {
    const categoria = await tx.get(categoriaRef);
    if (!categoria.exists) {
      throw new HttpsError("not-found", "Categoría inexistente");
    }

    tx.update(categoriaRef, {
      etiqueta,
      valor,
      orden,
      areaId: areaId ?? FieldValue.delete(),
      sucursalesAsignadas: sucursalesAsignadas ?? FieldValue.delete(),
    });
    registrarAuditoria(tx, db, {
      tipo: "CATEGORIA_ACTUALIZADA",
      categoriaId,
      ejecutadoPor,
    });
  });

  return { categoriaId, actualizada: true };
}

export const actualizarCategoria = onCall({ region: "us-central1" }, async (req) => {
  exigirAdmin(req);
  const datos = validar(req.data, actualizarCategoriaSchema);
  return actualizarCategoriaImpl(getFirestore(), req.auth!.uid, datos);
});
