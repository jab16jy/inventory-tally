import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import { actualizarSucursalSchema, type ActualizarSucursalInput } from "@conteo/contracts";
import { exigirAdmin } from "../lib/exigir-admin.js";
import { validar } from "../lib/validar.js";
import { registrarAuditoria } from "../lib/auditoria.js";

/**
 * actualizarSucursalImpl — núcleo de la callable (docs/plan-panel-administrador.md
 * §3). Reemplazo total, igual que actualizarCajero. Desactivar (`activa:false`)
 * una sucursal con `sesionAbiertaId` no nulo se rechaza: dejar una sesión
 * abierta colgando de una sucursal inactiva es un estado que ni abrirSesion
 * ni cerrarSesion esperan.
 */
export async function actualizarSucursalImpl(
  db: Firestore,
  ejecutadoPor: string,
  input: ActualizarSucursalInput,
): Promise<{ sucursalId: string; actualizada: true }> {
  const { sucursalId, nombre, direccion, conectividad, activa } = input;
  const sucursalRef = db.doc(`sucursales/${sucursalId}`);

  await db.runTransaction(async (tx) => {
    const sucursal = await tx.get(sucursalRef);
    if (!sucursal.exists) {
      throw new HttpsError("not-found", "Sucursal inexistente");
    }
    if (!activa && sucursal.get("sesionAbiertaId")) {
      throw new HttpsError(
        "failed-precondition",
        "No se puede desactivar una sucursal con sesión abierta",
      );
    }

    tx.update(sucursalRef, { nombre, direccion, conectividad, activa });
    registrarAuditoria(tx, db, {
      tipo: "SUCURSAL_ACTUALIZADA",
      sucursalId,
      ejecutadoPor,
    });
  });

  return { sucursalId, actualizada: true };
}

export const actualizarSucursal = onCall({ region: "us-central1" }, async (req) => {
  exigirAdmin(req);
  const datos = validar(req.data, actualizarSucursalSchema);
  return actualizarSucursalImpl(getFirestore(), req.auth!.uid, datos);
});
