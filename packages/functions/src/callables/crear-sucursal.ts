import { onCall } from "firebase-functions/v2/https";
import { FieldValue, getFirestore, type Firestore } from "firebase-admin/firestore";
import { crearSucursalSchema, type CrearSucursalInput } from "@conteo/contracts";
import { exigirAdmin } from "../lib/exigir-admin.js";
import { validar } from "../lib/validar.js";
import { registrarAuditoria } from "../lib/auditoria.js";

/**
 * crearSucursalImpl — núcleo de la callable (docs/plan-panel-administrador.md
 * §3). Nace activa y sin sesión abierta; auditoría en la MISMA transacción.
 *
 * ponytail: sin chequeo de unicidad de `nombre` — ningún documento de diseño
 * lo exige y añadirlo hoy sería una lectura extra en la transacción para un
 * caso que aún no ocurrió. Agregar una guardia de lectura por `nombre`
 * cuando los duplicados realmente duelan.
 */
export async function crearSucursalImpl(
  db: Firestore,
  ejecutadoPor: string,
  input: CrearSucursalInput,
): Promise<{ sucursalId: string; creada: true }> {
  const sucursalRef = db.collection("sucursales").doc();

  await db.runTransaction(async (tx) => {
    tx.create(sucursalRef, {
      ...input,
      activa: true,
      sesionAbiertaId: null,
      creadaEn: FieldValue.serverTimestamp(),
    });
    registrarAuditoria(tx, db, {
      tipo: "SUCURSAL_CREADA",
      sucursalId: sucursalRef.id,
      ejecutadoPor,
    });
  });

  return { sucursalId: sucursalRef.id, creada: true };
}

export const crearSucursal = onCall({ region: "us-central1" }, async (req) => {
  exigirAdmin(req);
  const datos = validar(req.data, crearSucursalSchema);
  return crearSucursalImpl(getFirestore(), req.auth!.uid, datos);
});
