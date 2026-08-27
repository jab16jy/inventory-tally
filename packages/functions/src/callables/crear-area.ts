import { onCall } from "firebase-functions/v2/https";
import { FieldValue, getFirestore, type Firestore } from "firebase-admin/firestore";
import { crearAreaSchema, type CrearAreaInput } from "@conteo/contracts";
import { exigirAdmin } from "../lib/exigir-admin.js";
import { validar } from "../lib/validar.js";
import { registrarAuditoria } from "../lib/auditoria.js";

/**
 * crearAreaImpl — núcleo de la callable (docs/plan-panel-administrador.md
 * §3). Nace activa; auditoría en la MISMA transacción. I-7: no toca
 * `sesiones/*\/lineas` — una sesión ya abierta no ve esta área hasta la
 * próxima apertura (mismo patrón que `crearCategoriaImpl`).
 */
export async function crearAreaImpl(
  db: Firestore,
  ejecutadoPor: string,
  input: CrearAreaInput,
): Promise<{ areaId: string; creada: true }> {
  const areaRef = db.collection("areas").doc();

  await db.runTransaction(async (tx) => {
    tx.create(areaRef, {
      nombre: input.nombre,
      activa: true,
      creadaEn: FieldValue.serverTimestamp(),
    });
    registrarAuditoria(tx, db, {
      tipo: "AREA_CREADA",
      areaId: areaRef.id,
      ejecutadoPor,
    });
  });

  return { areaId: areaRef.id, creada: true };
}

export const crearArea = onCall({ region: "us-central1" }, async (req) => {
  exigirAdmin(req);
  const datos = validar(req.data, crearAreaSchema);
  return crearAreaImpl(getFirestore(), req.auth!.uid, datos);
});
