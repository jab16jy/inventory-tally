import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import { eliminarCategoriaSchema, type EliminarCategoriaInput } from "@conteo/contracts";
import {
  exigirAdminDeSucursal,
  exigirExclusivaDeSucursal,
  type AlcanceAdmin,
} from "../lib/exigir-admin.js";
import { validar } from "../lib/validar.js";
import { registrarAuditoria } from "../lib/auditoria.js";

/**
 * eliminarCategoriaImpl — núcleo de la callable (docs/plan-panel-administrador.md
 * §3). Borrado FÍSICO, bloqueado por referencias: no hay cascada — si la
 * categoría está en uso, la operación se rechaza entera y no se borra nada
 * más. El historial nunca se purga; `sesiones/*\/lineas` no se toca jamás
 * (ver el `ponytail:` de abajo sobre por qué es seguro que una línea vieja
 * quede apuntando a un `categoriaId` que ya no existe).
 *
 * ponytail: la guarda corre ANTES y FUERA de la transacción porque una
 * consulta de agregación (`count()`) no puede participar en una transacción
 * de Firestore. Eso deja una ventana TOCTOU entre la guarda y el borrado
 * (alguien podría abrir una sesión que referencia esta categoría justo en
 * medio). Es inofensiva SOLO aquí por la invariante I-7: `sesiones/{id}/lineas`
 * copia y congela `etiqueta`/`valorUnitario` al abrir la sesión (ver
 * abrir-sesion.ts), así que una línea que quede apuntando a un `categoriaId`
 * borrado sigue renderizando y sumando correctamente — nada del historial se
 * corrompe. No "arreglar" esto envolviendo el `count()` en la transacción.
 *
 * D2/S3b: para `admin_sucursal` (`alcance !== null`), el chequeo de
 * exclusividad corre en una pre-lectura ANTES del `count()` — el mensaje de
 * "usada en N conteos" filtraría cuántos conteos referencian una categoría
 * ajena a un llamador que de todos modos va a ser rechazado. Gerente
 * (`alcance === null`) mantiene el orden original, sin la pre-lectura extra.
 *
 * ponytail: el índice `fieldOverrides` de infra/firestore.indexes.json para
 * `lineas.categoriaId` debe declarar AMBOS scopes (COLLECTION y
 * COLLECTION_GROUP) — un override reemplaza el índice automático de
 * Firestore, que es sólo COLLECTION. El emulador NO valida índices: estos
 * tests pasan con o sin el override. Si falta, esta consulta sólo falla en
 * PRODUCCIÓN (mismo tipo de trampa que `ultimoHistoricoPorSucursal` en
 * packages/data/src/repositories/admin-repository.ts).
 */
export async function eliminarCategoriaImpl(
  db: Firestore,
  ejecutadoPor: string,
  input: EliminarCategoriaInput,
  alcance: AlcanceAdmin,
): Promise<{ categoriaId: string; eliminada: true }> {
  const { categoriaId } = input;
  const categoriaRef = db.doc(`categoriasValor/${categoriaId}`);

  if (alcance !== null) {
    const categoria = await categoriaRef.get();
    if (!categoria.exists) {
      throw new HttpsError("not-found", "Categoría inexistente");
    }
    exigirExclusivaDeSucursal(alcance, categoria.get("sucursalesAsignadas"));
  }

  const usos = await db
    .collectionGroup("lineas")
    .where("categoriaId", "==", categoriaId)
    .count()
    .get();
  const n = usos.data().count;
  if (n > 0) {
    throw new HttpsError(
      "failed-precondition",
      `No se puede eliminar: usada en ${n} ${n === 1 ? "conteo" : "conteos"}.`,
    );
  }

  await db.runTransaction(async (tx) => {
    const categoria = await tx.get(categoriaRef);
    if (!categoria.exists) {
      throw new HttpsError("not-found", "Categoría inexistente");
    }
    // Revalida en la tx (TOCTOU): la pre-lectura sólo evita filtrar el conteo.
    exigirExclusivaDeSucursal(alcance, categoria.get("sucursalesAsignadas"));
    tx.delete(categoriaRef);
    registrarAuditoria(tx, db, {
      tipo: "CATEGORIA_ELIMINADA",
      categoriaId,
      ejecutadoPor,
    });
  });

  return { categoriaId, eliminada: true };
}

export const eliminarCategoria = onCall({ region: "us-central1" }, async (req) => {
  const alcance = exigirAdminDeSucursal(req);
  const datos = validar(req.data, eliminarCategoriaSchema);
  return eliminarCategoriaImpl(getFirestore(), req.auth!.uid, datos, alcance);
});
