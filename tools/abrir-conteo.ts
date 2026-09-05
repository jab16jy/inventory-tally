/**
 * abrir-conteo.ts — abre un conteo (sesión) en una sucursal de un proyecto
 * REAL, replicando exactamente lo que escribe `abrirSesionImpl`
 * (packages/functions/src/callables/abrir-sesion.ts: sesión + líneas desde
 * `categoriasValor` activas + `sucursales/{id}.sesionAbiertaId`).
 *
 * Necesario porque `PanelScreen.tsx` (admin) todavía no tiene un botón para
 * abrir una sesión nueva — sólo lista las que ya están abiertas ("Análisis"/
 * "Cerrar"). Sin una sesión abierta, `SucursalesScreen.tsx` del cajero
 * muestra la placa como "Sin sesión" y el botón queda deshabilitado: no es
 * un bug de login, es que aún no hay ningún conteo abierto en esa sucursal.
 *
 * Uso:
 *   GOOGLE_APPLICATION_CREDENTIALS=<service-account.json> \
 *   node --experimental-strip-types tools/abrir-conteo.ts <proyecto> <sucursalId>
 */
import { randomUUID } from "node:crypto";
import { applicationDefault, initializeApp } from "firebase-admin/app";
import { FieldValue, getFirestore } from "firebase-admin/firestore";

const [, , proyecto, sucursalId] = process.argv;

if (!proyecto || !sucursalId) {
  console.error(
    "Uso: node --experimental-strip-types tools/abrir-conteo.ts <proyecto> <sucursalId>",
  );
  process.exit(1);
}

initializeApp({ credential: applicationDefault(), projectId: proyecto });
const db = getFirestore();

function generarSesionId(sucursalId: string): string {
  const ahora = new Date();
  const fecha = [
    ahora.getUTCFullYear(),
    String(ahora.getUTCMonth() + 1).padStart(2, "0"),
    String(ahora.getUTCDate()).padStart(2, "0"),
  ].join("");
  return `ses_${fecha}_${sucursalId}_${randomUUID().slice(0, 8)}`;
}

async function abrirConteo(): Promise<void> {
  const sucursalRef = db.doc(`sucursales/${sucursalId}`);

  const sesionId = await db.runTransaction(async (tx) => {
    const sucursal = await tx.get(sucursalRef);
    if (!sucursal.exists) {
      throw new Error(`Sucursal inexistente: ${sucursalId}`);
    }
    if (sucursal.get("sesionAbiertaId")) {
      throw new Error(
        `Ya hay un conteo abierto en ${sucursalId}: ${sucursal.get("sesionAbiertaId")}`,
      );
    }
    const nuevoSesionId = generarSesionId(sucursalId!); // narrowed por el guard de argv de arriba
    tx.create(db.doc(`sesiones/${nuevoSesionId}`), {
      sucursalId,
      sucursalNombre: sucursal.get("nombre") ?? null,
      estado: "abierta",
      abiertaEn: FieldValue.serverTimestamp(),
      abiertaPor: "abrir-conteo-script",
      cerradaEn: null,
      cerradaPor: null,
      participantes: [],
      totalUnidades: 0,
      sesionCorregidaId: null,
    });
    tx.update(sucursalRef, { sesionAbiertaId: nuevoSesionId });
    return nuevoSesionId;
  });

  const categorias = await db.collection("categoriasValor").where("activa", "==", true).get();
  const lote = db.batch();
  for (const categoria of categorias.docs) {
    lote.set(db.doc(`sesiones/${sesionId}/lineas/${categoria.id}`), {
      categoriaId: categoria.id,
      valorUnitario: categoria.get("valor"),
      etiqueta: categoria.get("etiqueta"),
      cantidadTotal: 0,
      numAportantes: 0,
      versiones: {},
      actualizadaEn: FieldValue.serverTimestamp(),
      actualizadaPor: "abrir-conteo-script",
    });
  }
  await lote.commit();

  console.log(`Conteo abierto en ${sucursalId}: ${sesionId} (${categorias.size} categorías).`);
}

await abrirConteo();
