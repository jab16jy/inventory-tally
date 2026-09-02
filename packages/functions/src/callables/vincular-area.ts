import { HttpsError, onCall } from "firebase-functions/v2/https";
import { FieldValue, getFirestore, type Firestore } from "firebase-admin/firestore";
import { vincularAreaSchema, type VincularAreaInput } from "@conteo/contracts";
import { SIN_AREA } from "@conteo/shared/models/linea-conteo.js";
import {
  autorizacionDe,
  exigirAdminOCajeroDeSesion,
  type AutorizacionCajero,
} from "../lib/exigir-cajero-de-sesion.js";
import { validar } from "../lib/validar.js";
import { registrarAuditoria } from "../lib/auditoria.js";

/**
 * vincularAreaImpl — núcleo de la callable (doc 08 §3, ADR-21). El cajero
 * vincula un área EXISTENTE a una categoría EXISTENTE desde su sesión
 * abierta; no crea ni edita ninguna de las dos.
 *
 * UNA sola transacción: el snapshot de la sesión se lee aquí mismo y se pasa
 * a `exigirAdminOCajeroDeSesion` (cierra la ventana TOCTOU, ver ese archivo).
 * Todas las lecturas (sesión, área, categoría, línea) van antes que
 * cualquier escritura porque Firestore lo exige dentro de una transacción.
 *
 * Guarda de no-edición: una categoría con OTRA área asignada rechaza
 * (`failed-precondition`); con la MISMA área es idempotente y sigue — un
 * cajero de otra sucursal con sesión abierta debe poder etiquetar su propia
 * línea después de que el primero vinculó la categoría.
 *
 * ADR-21: la línea sólo se re-etiqueta si su `area` sigue en `SIN_AREA`. Una
 * línea con área real nunca se toca de nuevo. Si la línea no existe (la
 * categoría no estaba sembrada en esta sesión), no es error: no se
 * actualiza nada y `lineaActualizada` vuelve `false`.
 */
export async function vincularAreaImpl(
  db: Firestore,
  auth: AutorizacionCajero,
  input: VincularAreaInput,
): Promise<{ categoriaId: string; areaId: string; lineaActualizada: boolean }> {
  const { sesionId, categoriaId, areaId } = input;
  const sesionRef = db.doc(`sesiones/${sesionId}`);
  const areaRef = db.doc(`areas/${areaId}`);
  const categoriaRef = db.doc(`categoriasValor/${categoriaId}`);
  const lineaRef = db.doc(`sesiones/${sesionId}/lineas/${categoriaId}`);

  return db.runTransaction(async (tx) => {
    const sesion = await tx.get(sesionRef);
    const { sucursalId } = exigirAdminOCajeroDeSesion(auth, sesion);

    const area = await tx.get(areaRef);
    if (!area.exists) {
      throw new HttpsError("not-found", "Área inexistente");
    }
    if (area.get("activa") !== true) {
      throw new HttpsError("failed-precondition", "El área no está activa");
    }
    const nombreArea = area.get("nombre") as string;

    const categoria = await tx.get(categoriaRef);
    if (!categoria.exists) {
      throw new HttpsError("not-found", "Categoría inexistente");
    }
    const areaActual = categoria.get("areaId") as string | undefined;
    if (areaActual !== undefined && areaActual !== areaId) {
      throw new HttpsError("failed-precondition", "Esta categoría ya tiene otra área asignada");
    }

    const linea = await tx.get(lineaRef);
    const lineaActualizada = linea.exists && linea.get("area") === SIN_AREA;
    if (lineaActualizada) {
      tx.update(lineaRef, {
        area: nombreArea,
        actualizadaEn: FieldValue.serverTimestamp(),
        actualizadaPor: auth.uid,
      });
    }

    tx.update(categoriaRef, { areaId });

    registrarAuditoria(tx, db, {
      tipo: "AREA_VINCULADA",
      categoriaId,
      areaId,
      sesionId,
      sucursalId,
      ejecutadoPor: auth.uid,
    });

    return { categoriaId, areaId, lineaActualizada };
  });
}

export const vincularArea = onCall({ region: "us-central1" }, async (req) => {
  const auth = autorizacionDe(req);
  const datos = validar(req.data, vincularAreaSchema);
  return vincularAreaImpl(getFirestore(), auth, datos);
});
