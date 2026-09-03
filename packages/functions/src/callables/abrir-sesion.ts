import { randomUUID } from "node:crypto";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { FieldValue, getFirestore, type Firestore } from "firebase-admin/firestore";
import { abrirSesionSchema, type AbrirSesionInput } from "@conteo/contracts";
import { exigirAdmin } from "../lib/exigir-admin.js";
import { validar } from "../lib/validar.js";
import { registrarAuditoria } from "../lib/auditoria.js";
import { lineaSembrada } from "../lib/linea-sembrada.js";

const LOTE_MAXIMO = 400; // límite de 500 operaciones por batch (doc 08 §3)

/**
 * generarSesionId — `ses_{YYYYMMDD}_{sucursalId}_{corr}` (doc 04 §3): legible
 * y ordenable. El doc no especifica cómo se calcula `corr`; se usa un sufijo
 * corto aleatorio (decisión de la ola O3) porque un correlativo secuencial
 * exigiría una segunda transacción de conteo que la invariante I-1 ya hace
 * innecesaria — la unicidad real la garantiza `sesionAbiertaId`, no el ID.
 */
function generarSesionId(sucursalId: string, ahora = new Date()): string {
  const fecha = [
    ahora.getUTCFullYear(),
    String(ahora.getUTCMonth() + 1).padStart(2, "0"),
    String(ahora.getUTCDate()).padStart(2, "0"),
  ].join("");
  const corr = randomUUID().slice(0, 8);
  return `ses_${fecha}_${sucursalId}_${corr}`;
}

async function sembrarLineas(
  db: Firestore,
  sesionId: string,
  ejecutadoPor: string,
  sucursalId: string,
): Promise<void> {
  const categorias = await db.collection("categoriasValor").where("activa", "==", true).get();
  // D4/D6: `sucursalesAsignadas` ausente = global (todas la ven); presente =
  // sólo esas sucursales. Firestore no soporta "array-contains OR
  // campo-ausente" en una sola query, así que se filtra en memoria — la
  // colección es chica (decenas de docs), igual que el resto de catálogos
  // admin de este repo.
  const docs = categorias.docs.filter((categoria) => {
    const sucursalesAsignadas = categoria.get("sucursalesAsignadas") as
      readonly string[] | undefined;
    return sucursalesAsignadas === undefined || sucursalesAsignadas.includes(sucursalId);
  });

  const areas = await db.collection("areas").where("activa", "==", true).get();
  const nombresPorArea = new Map(areas.docs.map((area) => [area.id, area.get("nombre") as string]));

  for (let i = 0; i < docs.length; i += LOTE_MAXIMO) {
    const lote = db.batch();
    for (const categoria of docs.slice(i, i + LOTE_MAXIMO)) {
      const areaIds = categoria.get("areaIds") as readonly string[] | undefined;
      // ponytail: LineaConteo.area es un solo string y no puede representar
      // N áreas; con 0 o con varias queda SIN_AREA. El desglose real
      // (porArea, ADR-23) llega en la unidad que lo introduce.
      const area = areaIds && areaIds.length === 1 ? nombresPorArea.get(areaIds[0]!) : undefined;
      lote.set(
        db.doc(`sesiones/${sesionId}/lineas/${categoria.id}`),
        lineaSembrada({
          categoriaId: categoria.id,
          valorUnitario: categoria.get("valor"),
          etiqueta: categoria.get("etiqueta"),
          area,
          // ADR-22: fijado por admin en el catálogo al abrir la sesión si
          // asignó un área inequívoca (exactamente una). Con varias es ambiguo
          // y decide el cajero.
          areaFijaPorAdmin: areaIds?.length === 1,
          actualizadaPor: ejecutadoPor,
        }),
      );
    }
    await lote.commit();
  }
}

/**
 * abrirSesionImpl — núcleo de la callable (doc 08 §3), separado de `onCall`
 * para poder probarlo directamente contra el emulador de Firestore con un
 * `ejecutadoPor` ya resuelto (lo que queda tras `exigirAdmin`/`validar`).
 */
export async function abrirSesionImpl(
  db: Firestore,
  ejecutadoPor: string,
  input: AbrirSesionInput,
): Promise<{ sesionId: string }> {
  const sucursalRef = db.doc(`sucursales/${input.sucursalId}`);

  const { sesionId } = await db.runTransaction(async (tx) => {
    const sucursal = await tx.get(sucursalRef);
    if (!sucursal.exists) {
      throw new HttpsError("not-found", "Sucursal inexistente");
    }
    // I-1: una sola sesión abierta por sucursal, garantizado atómicamente.
    if (sucursal.get("sesionAbiertaId")) {
      throw new HttpsError("failed-precondition", "Ya existe un conteo abierto en esta sucursal");
    }

    const nuevoSesionId = generarSesionId(input.sucursalId);
    tx.create(db.doc(`sesiones/${nuevoSesionId}`), {
      sucursalId: input.sucursalId,
      sucursalNombre: sucursal.get("nombre") ?? null,
      estado: "abierta",
      abiertaEn: FieldValue.serverTimestamp(),
      abiertaPor: ejecutadoPor,
      cerradaEn: null,
      cerradaPor: null,
      participantes: [],
      totalUnidades: 0,
      sesionCorregidaId: null,
    });
    tx.update(sucursalRef, { sesionAbiertaId: nuevoSesionId });

    registrarAuditoria(tx, db, {
      tipo: "SESION_ABIERTA",
      sesionId: nuevoSesionId,
      sucursalId: input.sucursalId,
      ejecutadoPor,
    });

    return { sesionId: nuevoSesionId };
  });

  try {
    await sembrarLineas(db, sesionId, ejecutadoPor, input.sucursalId); // lotes de 400 (límite de 500 ops)
  } catch (error) {
    // D3: la siembra corre fuera de la transacción de apertura. Si un lote
    // falla a mitad de camino, la sesión quedaría abierta con líneas
    // incompletas y el reintento bloqueado (I-1 impide una segunda sesión
    // abierta). Se revierte para dejar la sucursal reintentable.
    await Promise.all([
      sucursalRef.update({ sesionAbiertaId: null }),
      db.doc(`sesiones/${sesionId}`).delete(),
    ]);
    throw error;
  }
  return { sesionId };
}

export const abrirSesion = onCall({ region: "us-central1" }, async (req) => {
  exigirAdmin(req);
  const datos = validar(req.data, abrirSesionSchema);
  return abrirSesionImpl(getFirestore(), req.auth!.uid, datos);
});
