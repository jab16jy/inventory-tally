import { HttpsError, onCall } from "firebase-functions/v2/https";
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
 *
 * Rechaza `nombre` duplicado entre áreas ACTIVAS: `totalPorArea` agrupa por
 * ese nombre (no por areaId), así que dos áreas activas homónimas
 * fusionarían silenciosamente sus totales en FinalizarScreen.
 */
export async function crearAreaImpl(
  db: Firestore,
  ejecutadoPor: string,
  input: CrearAreaInput,
): Promise<{ areaId: string; creada: true }> {
  const duplicadas = db
    .collection("areas")
    .where("nombre", "==", input.nombre)
    .where("activa", "==", true)
    .limit(1);

  const areaRef = db.collection("areas").doc();

  await db.runTransaction(async (tx) => {
    // La consulta va DENTRO de la transacción, y con `tx.get`, no antes con
    // un `.get()` suelto: Firestore sólo detecta conflicto sobre lo que se
    // lee dentro: eso es lo que forma el read set. Con la comprobación
    // afuera, el cuerpo de la transacción no leía nada, así que dos llamadas
    // concurrentes con el mismo nombre veían las dos `empty` y creaban las
    // dos — justo la fusión silenciosa de totales que esta guarda existe
    // para impedir. `tx.create` tampoco lo atrapaba: `areaRef` es un id
    // aleatorio recién generado, nunca colisiona.
    //
    // Las lecturas van antes que las escrituras porque Firestore lo exige
    // dentro de una transacción, no por estilo.
    if (!(await tx.get(duplicadas)).empty) {
      throw new HttpsError("already-exists", "Ya existe un área activa con ese nombre");
    }

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
