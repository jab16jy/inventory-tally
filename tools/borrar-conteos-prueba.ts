/**
 * borrar-conteos-prueba.ts — revierte sembrar-conteos-prueba.ts: borra (por
 * query sobre el MARCADOR, sin manifiesto aparte) las sesiones fabricadas
 * con sus subcolecciones (`lineas`, `resumen`) vía `recursiveDelete` nativo
 * del Admin SDK, el `historicos/{sesionId}` correspondiente en cada
 * sucursal, y las 5 sucursales nuevas. NO toca `suc_norte` (la crea
 * sembrar-datos-prueba.ts / borra borrar-datos-prueba.ts).
 *
 * Uso:
 *   GOOGLE_APPLICATION_CREDENTIALS=<service-account.json> \
 *   node --experimental-strip-types tools/borrar-conteos-prueba.ts <proyecto>
 */
import { applicationDefault, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { MARCADOR, SUCURSALES_NUEVAS } from "./datos-conteos-prueba.ts";

const [, , proyecto] = process.argv;

if (!proyecto) {
  console.error("Uso: node --experimental-strip-types tools/borrar-conteos-prueba.ts <proyecto>");
  process.exit(1);
}

initializeApp({ credential: applicationDefault(), projectId: proyecto });
const db = getFirestore();

async function borrar(): Promise<void> {
  const sesiones = await db.collection("sesiones").where("abiertaPor", "==", MARCADOR).get();

  for (const sesion of sesiones.docs) {
    const sucursalId = sesion.get("sucursalId") as string;
    await db.recursiveDelete(sesion.ref);
    await db.doc(`sucursales/${sucursalId}/historicos/${sesion.id}`).delete();
  }

  for (const sucursal of SUCURSALES_NUEVAS) {
    await db.recursiveDelete(db.doc(`sucursales/${sucursal.id}`));
  }

  console.log(
    `Borrados en ${proyecto}: ${sesiones.size} conteos y ${SUCURSALES_NUEVAS.length} sucursales nuevas.`,
  );
}

await borrar();
