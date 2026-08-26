/**
 * borrar-datos-prueba.ts — revierte EXACTAMENTE lo que sembró
 * sembrar-datos-prueba.ts (misma sucursal, mismas 60 categoriasValor,
 * mismos 2 cajeros). No toca el admin ni ninguna sesión/línea/auditoría
 * generada por el uso real de la app — eso se limpia aparte si hace falta
 * (`firebase firestore:delete --recursive sesiones --project <proyecto>`).
 *
 * Uso:
 *   GOOGLE_APPLICATION_CREDENTIALS=<service-account.json> \
 *   node --experimental-strip-types tools/borrar-datos-prueba.ts <proyecto>
 */
import { applicationDefault, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { CAJEROS, NUM_CATEGORIAS, SUCURSAL_ID } from "./datos-prueba.ts";

const [, , proyecto] = process.argv;

if (!proyecto) {
  console.error("Uso: node --experimental-strip-types tools/borrar-datos-prueba.ts <proyecto>");
  process.exit(1);
}

initializeApp({ credential: applicationDefault(), projectId: proyecto });
const auth = getAuth();
const db = getFirestore();

async function borrarCategorias(): Promise<void> {
  const lote = db.batch();
  for (let i = 1; i <= NUM_CATEGORIAS; i++) {
    lote.delete(db.doc(`categoriasValor/cat_${i * 500}`));
  }
  await lote.commit();
}

async function borrarCajero(correo: string): Promise<void> {
  let usuario;
  try {
    usuario = await auth.getUserByEmail(correo);
  } catch (error) {
    if ((error as { code?: string }).code === "auth/user-not-found") {
      console.log(`${correo} ya no existe, se omite.`);
      return;
    }
    throw error;
  }
  await auth.deleteUser(usuario.uid);
  await db.doc(`usuarios/${usuario.uid}`).delete();
  console.log(`Cajero borrado: ${correo}`);
}

async function borrar(): Promise<void> {
  await db.doc(`sucursales/${SUCURSAL_ID}`).delete();
  await borrarCategorias();
  for (const { correo } of CAJEROS) {
    await borrarCajero(correo);
  }
  console.log(
    `Datos de prueba borrados en ${proyecto}: sucursal ${SUCURSAL_ID}, ${NUM_CATEGORIAS} categoriasValor, ${CAJEROS.length} cajeros.`,
  );
}

await borrar();
