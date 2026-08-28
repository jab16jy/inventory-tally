/**
 * fijar-version-minima.ts — escribe `config/app.versionMinima` en un proyecto
 * REAL vía Admin SDK (bypassa legítimamente el deny-all de `config/*` para
 * el cliente en infra/firestore.rules — ver useVersionMinima.ts).
 *
 * Necesario porque no existe ninguna callable ni pantalla para fijar la
 * versión mínima (issue #12/#38/#58): sin este doc, `useVersionMinima.ts`
 * nunca bloquea (D8, fail-open ante campo ausente).
 *
 * Uso:
 *   GOOGLE_APPLICATION_CREDENTIALS=<service-account.json> \
 *   node --experimental-strip-types tools/fijar-version-minima.ts <proyecto> <version>
 */
import { applicationDefault, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

// Mismo formato que packages/shared/src/services/version.ts (FORMATO_VERSION):
// no se importa @conteo/shared acá porque tools/ no lo declara como
// dependencia (sólo firebase-admin) y abrir-conteo.ts, el script hermano, ya
// evita cruzar ese límite de paquete.
const FORMATO_VERSION = /^(\d+)\.(\d+)\.(\d+)$/;

const [, , proyecto, version] = process.argv;

if (!proyecto || !version) {
  console.error(
    "Uso: node --experimental-strip-types tools/fijar-version-minima.ts <proyecto> <version>",
  );
  process.exit(1);
}

if (!FORMATO_VERSION.test(version)) {
  console.error(`Version invalida: "${version}" (formato esperado: X.Y.Z)`);
  process.exit(1);
}

initializeApp({ credential: applicationDefault(), projectId: proyecto });
const db = getFirestore();

async function fijarVersionMinima(): Promise<void> {
  await db.doc("config/app").set({ versionMinima: version }, { merge: true });
  console.log(`config/app.versionMinima = "${version}" en ${proyecto}.`);
}

await fijarVersionMinima();
