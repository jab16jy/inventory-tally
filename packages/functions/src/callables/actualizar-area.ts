import { HttpsError, onCall } from "firebase-functions/v2/https";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import { actualizarAreaSchema, type ActualizarAreaInput } from "@conteo/contracts";
import { exigirAdmin } from "../lib/exigir-admin.js";
import { validar } from "../lib/validar.js";
import { registrarAuditoria } from "../lib/auditoria.js";

/**
 * actualizarAreaImpl — núcleo de la callable (docs/plan-panel-administrador.md
 * §3). Sólo `nombre` es editable aquí: `activa` la manejan
 * desactivarArea/reactivarArea (I-7), no esta callable.
 *
 * Misma guarda de nombre duplicado que crearAreaImpl (evita que
 * `totalPorArea` fusione dos áreas activas homónimas). La consulta no puede
 * excluir `areaId` por sí misma (mezclar un `!=` sobre documentId con los
 * `==` de nombre/activa exige un índice compuesto que `areas` no tiene) —
 * así que se pide `limit(2)` y se descarta en código el propio documento:
 * la invariante de crearAreaImpl (a lo sumo un área activa por nombre)
 * garantiza que sólo puede quedar, como mucho, un OTRO documento.
 *
 * I-7 (issue #67): esta callable NUNCA toca `sesiones/*\/lineas`. Renombrar
 * un área no afecta ninguna sesión ya abierta porque el nombre se copia y
 * congela en `linea.area` al abrir (ver `abrir-sesion.ts`) — la línea nunca
 * relee `areas` en vivo.
 */
export async function actualizarAreaImpl(
  db: Firestore,
  ejecutadoPor: string,
  input: ActualizarAreaInput,
): Promise<{ areaId: string; actualizada: true }> {
  const { areaId, nombre } = input;
  const areaRef = db.doc(`areas/${areaId}`);

  const duplicadas = db
    .collection("areas")
    .where("nombre", "==", nombre)
    .where("activa", "==", true)
    .limit(2);

  await db.runTransaction(async (tx) => {
    const area = await tx.get(areaRef);
    if (!area.exists) {
      throw new HttpsError("not-found", "Área inexistente");
    }

    const otraActivaConMismoNombre = (await tx.get(duplicadas)).docs.some(
      (doc) => doc.id !== areaId,
    );
    if (otraActivaConMismoNombre) {
      throw new HttpsError("already-exists", "Ya existe un área activa con ese nombre");
    }

    tx.update(areaRef, { nombre });
    registrarAuditoria(tx, db, {
      tipo: "AREA_ACTUALIZADA",
      areaId,
      ejecutadoPor,
    });
  });

  return { areaId, actualizada: true };
}

export const actualizarArea = onCall({ region: "us-central1" }, async (req) => {
  exigirAdmin(req);
  const datos = validar(req.data, actualizarAreaSchema);
  return actualizarAreaImpl(getFirestore(), req.auth!.uid, datos);
});
