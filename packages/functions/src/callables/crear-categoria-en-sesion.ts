import { HttpsError, onCall } from "firebase-functions/v2/https";
import { FieldValue, getFirestore, type Firestore } from "firebase-admin/firestore";
import { crearCategoriaEnSesionSchema, type CrearCategoriaEnSesionInput } from "@conteo/contracts";
import {
  autorizacionDe,
  exigirAdminOCajeroDeSesion,
  type AutorizacionCajero,
} from "../lib/exigir-cajero-de-sesion.js";
import { validar } from "../lib/validar.js";
import { registrarAuditoria } from "../lib/auditoria.js";
import { lineaSembrada } from "../lib/linea-sembrada.js";

/**
 * crearCategoriaEnSesionImpl — núcleo de la callable (doc 08 §3, ADR-21). El
 * cajero crea un "producto nombrado" (ticket #39, D1) DESDE su sesión
 * abierta. `valor: 0` y `orden: 0` los pone el SERVIDOR, nunca el cliente
 * (I-9/ADR-07): el schema ni siquiera acepta esos campos.
 *
 * UNA sola transacción, misma cierre TOCTOU que `vincularAreaImpl`: el
 * snapshot de la sesión se lee aquí y se pasa a `exigirAdminOCajeroDeSesion`.
 * `tx.create` en vez de `tx.set` en ambos documentos: son nuevos, nunca
 * deberían existir ya (`categoriaRef` es un id recién generado; `lineaRef`
 * usa ese mismo id, así que tampoco puede colisionar).
 *
 * `sucursalesAsignadas: [sucursalId]` reutiliza D4/D6: un producto inventado
 * en una sucursal no aparece en la próxima sesión de otra sin que el admin
 * lo revise, y ata la escritura a la sucursal que el claim ya autorizó.
 *
 * Sembrar la línea en la MISMA transacción es necesario: `sembrarLineas`
 * (abrir-sesion.ts) sólo corre al abrir, así que sin esto el producto recién
 * creado no aparecería en el conteo en curso.
 */
export async function crearCategoriaEnSesionImpl(
  db: Firestore,
  auth: AutorizacionCajero,
  input: CrearCategoriaEnSesionInput,
): Promise<{ categoriaId: string; creada: true }> {
  const { sesionId, etiqueta, areaId } = input;
  const sesionRef = db.doc(`sesiones/${sesionId}`);
  const areaRef = areaId ? db.doc(`areas/${areaId}`) : undefined;
  const categoriaRef = db.collection("categoriasValor").doc();
  const lineaRef = db.doc(`sesiones/${sesionId}/lineas/${categoriaRef.id}`);

  await db.runTransaction(async (tx) => {
    const sesion = await tx.get(sesionRef);
    const { sucursalId } = exigirAdminOCajeroDeSesion(auth, sesion);

    if (areaRef) {
      const area = await tx.get(areaRef);
      if (!area.exists) {
        throw new HttpsError("not-found", "Área inexistente");
      }
      if (area.get("activa") !== true) {
        throw new HttpsError("failed-precondition", "El área no está activa");
      }
    }

    tx.create(categoriaRef, {
      etiqueta,
      valor: 0,
      orden: 0,
      activa: true,
      creadaEn: FieldValue.serverTimestamp(),
      sucursalesAsignadas: [sucursalId],
      ...(areaId && { areaIds: [areaId] }),
    });

    tx.create(
      lineaRef,
      lineaSembrada({
        categoriaId: categoriaRef.id,
        valorUnitario: 0,
        etiqueta,
        actualizadaPor: auth.uid,
        // D-1 (docs/diseno/etapa-3-ui.md): misma areaIds que se acaba de
        // escribir en la categoría, arriba.
        areaIds: areaId ? [areaId] : undefined,
      }),
    );

    registrarAuditoria(tx, db, {
      tipo: "CATEGORIA_CREADA",
      categoriaId: categoriaRef.id,
      sesionId,
      sucursalId,
      origen: "conteo",
      ejecutadoPor: auth.uid,
    });
  });

  return { categoriaId: categoriaRef.id, creada: true };
}

export const crearCategoriaEnSesion = onCall({ region: "us-central1" }, async (req) => {
  const auth = autorizacionDe(req);
  const datos = validar(req.data, crearCategoriaEnSesionSchema);
  return crearCategoriaEnSesionImpl(getFirestore(), auth, datos);
});
