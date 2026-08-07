import { onCall } from "firebase-functions/v2/https";
import { FieldValue, getFirestore, type Firestore } from "firebase-admin/firestore";
import { crearCategoriaSchema, type CrearCategoriaInput } from "@conteo/contracts";
import { exigirAdmin } from "../lib/exigir-admin.js";
import { validar } from "../lib/validar.js";
import { registrarAuditoria } from "../lib/auditoria.js";

/**
 * crearCategoriaImpl — núcleo de la callable (docs/plan-panel-administrador.md
 * §3). Nace activa; auditoría en la MISMA transacción. I-7: no toca
 * `sesiones/*\/lineas` — una sesión ya abierta no ve esta categoría hasta la
 * próxima apertura ("Invariante I-7 en las categorías" en ese mismo §3).
 */
export async function crearCategoriaImpl(
  db: Firestore,
  ejecutadoPor: string,
  input: CrearCategoriaInput,
): Promise<{ categoriaId: string; creada: true }> {
  const categoriaRef = db.collection("categoriasValor").doc();

  await db.runTransaction(async (tx) => {
    tx.create(categoriaRef, {
      ...input,
      activa: true,
      creadaEn: FieldValue.serverTimestamp(),
    });
    registrarAuditoria(tx, db, {
      tipo: "CATEGORIA_CREADA",
      categoriaId: categoriaRef.id,
      ejecutadoPor,
    });
  });

  return { categoriaId: categoriaRef.id, creada: true };
}

export const crearCategoria = onCall({ region: "us-central1" }, async (req) => {
  exigirAdmin(req);
  const datos = validar(req.data, crearCategoriaSchema);
  return crearCategoriaImpl(getFirestore(), req.auth!.uid, datos);
});
