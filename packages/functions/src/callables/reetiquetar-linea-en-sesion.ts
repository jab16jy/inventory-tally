import { HttpsError, onCall } from "firebase-functions/v2/https";
import { FieldValue, getFirestore, type Firestore } from "firebase-admin/firestore";
import {
  reetiquetarLineaEnSesionSchema,
  type ReetiquetarLineaEnSesionInput,
} from "@conteo/contracts";
import { SIN_AREA } from "@conteo/shared/models/linea-conteo.js";
import {
  autorizacionDe,
  exigirAdminOCajeroDeSesion,
  type AutorizacionCajero,
} from "../lib/exigir-cajero-de-sesion.js";
import { validar } from "../lib/validar.js";
import { registrarAuditoria } from "../lib/auditoria.js";

/**
 * reetiquetarLineaEnSesionImpl — núcleo de la callable (ADR-22). Reemplaza el
 * uso cajero de `vincularArea`: en vez de fijar `categoriasValor.areaId` para
 * siempre, sólo reescribe `area` en la línea de ESTA sesión, tantas veces
 * como el cajero quiera, incluyendo volver a `SIN_AREA`.
 *
 * UNA sola transacción, mismo cierre TOCTOU que `vincularAreaImpl`: el
 * snapshot de la sesión se lee aquí mismo y se pasa a
 * `exigirAdminOCajeroDeSesion`.
 *
 * Condición dura (no negociable): una categoría con `areaIds` ya fijado en el
 * catálogo — por el admin, o por el propio cajero al crear el producto vía
 * `crearCategoriaEnSesion` — es intocable, sin excepción. Por eso el chequeo
 * lee `categoriasValor/{categoriaId}` EN VIVO dentro de la misma transacción,
 * en vez de confiar en el `areaFijaPorAdmin` que la línea guarda desde que se
 * sembró: ese campo es una foto para la UI (qué líneas ofrecer en la hoja de
 * reetiquetado), no la autorización — la autorización siempre re-lee el
 * catálogo actual.
 *
 * Nunca escribe `categoriaRef`: ésa es la diferencia estructural con
 * `vincularAreaImpl`, y es lo que permite reetiquetar más de una vez sin
 * congelar la categoría entera para el resto de sesiones.
 */
export async function reetiquetarLineaEnSesionImpl(
  db: Firestore,
  auth: AutorizacionCajero,
  input: ReetiquetarLineaEnSesionInput,
): Promise<{ categoriaId: string; areaId: string | null }> {
  const { sesionId, categoriaId } = input;
  const areaId = input.areaId ?? null; // nullish: undefined y null significan lo mismo
  const sesionRef = db.doc(`sesiones/${sesionId}`);
  const categoriaRef = db.doc(`categoriasValor/${categoriaId}`);
  const lineaRef = db.doc(`sesiones/${sesionId}/lineas/${categoriaId}`);
  const areaRef = areaId ? db.doc(`areas/${areaId}`) : undefined;

  return db.runTransaction(async (tx) => {
    const sesion = await tx.get(sesionRef);
    const { sucursalId } = exigirAdminOCajeroDeSesion(auth, sesion);

    const categoria = await tx.get(categoriaRef);
    if (!categoria.exists) {
      throw new HttpsError("not-found", "Categoría inexistente");
    }
    const areaIdsDeCatalogo = categoria.get("areaIds") as readonly string[] | undefined;
    if (areaIdsDeCatalogo !== undefined && areaIdsDeCatalogo.length === 1) {
      throw new HttpsError(
        "failed-precondition",
        "Esta categoría tiene un área fija asignada por administración",
      );
    }

    let nombreArea = SIN_AREA;
    if (areaRef) {
      const area = await tx.get(areaRef);
      if (!area.exists) {
        throw new HttpsError("not-found", "Área inexistente");
      }
      if (area.get("activa") !== true) {
        throw new HttpsError("failed-precondition", "El área no está activa");
      }
      nombreArea = area.get("nombre") as string;
    }

    tx.update(lineaRef, {
      area: nombreArea,
      actualizadaEn: FieldValue.serverTimestamp(),
      actualizadaPor: auth.uid,
    });

    registrarAuditoria(tx, db, {
      tipo: "LINEA_REETIQUETADA",
      categoriaId,
      areaId,
      sesionId,
      sucursalId,
      ejecutadoPor: auth.uid,
    });

    return { categoriaId, areaId };
  });
}

export const reetiquetarLineaEnSesion = onCall({ region: "us-central1" }, async (req) => {
  const auth = autorizacionDe(req);
  const datos = validar(req.data, reetiquetarLineaEnSesionSchema);
  return reetiquetarLineaEnSesionImpl(getFirestore(), auth, datos);
});
