/**
 * crear-admin.ts — siembra el primer admin en un proyecto REAL de Firebase
 * (dev o prod), fuera del emulador. Necesario porque `crearCajero`
 * (packages/functions/src/callables/crear-cajero.ts) exige que quien la
 * invoque ya sea admin: el primer admin de cada proyecto no tiene otra vía
 * de alta.
 *
 * Uso (con una service account real descargada desde la consola de Firebase
 * o `gcloud auth application-default login`):
 *   GOOGLE_APPLICATION_CREDENTIALS=./service-account.json \
 *   node --experimental-strip-types tools/crear-admin.ts <proyecto> <correo> <nombre> [password]
 *
 * `password` es opcional — Firebase Auth exige mínimo 6 caracteres; sin él
 * se genera uno al azar. Se imprime UNA vez; Firebase Auth no lo vuelve a
 * exponer.
 *
 * ponytail: sin reintento/idempotencia, igual que seed.ts — script de un
 * solo uso por proyecto.
 */
import { randomBytes } from "node:crypto";
import { applicationDefault, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { FieldValue, getFirestore } from "firebase-admin/firestore";

const [, , proyecto, correo, nombre, passwordArg] = process.argv;

if (!proyecto || !correo || !nombre) {
  console.error(
    "Uso: node --experimental-strip-types tools/crear-admin.ts <proyecto> <correo> <nombre> [password]",
  );
  process.exit(1);
}

initializeApp({ credential: applicationDefault(), projectId: proyecto });
const auth = getAuth();
const db = getFirestore();

async function crearAdmin(): Promise<void> {
  const passwordTemporal = passwordArg ?? randomBytes(9).toString("base64url");

  let usuario;
  try {
    usuario = await auth.createUser({ email: correo, password: passwordTemporal, displayName: nombre });
  } catch (error) {
    if ((error as { code?: string }).code === "auth/email-already-exists") {
      console.error(`Ya existe un usuario con el correo ${correo} en ${proyecto}.`);
      process.exit(1);
    }
    throw error;
  }

  await auth.setCustomUserClaims(usuario.uid, { rol: "admin", sucursales: [] });
  await db.doc(`usuarios/${usuario.uid}`).set({
    nombre,
    correo,
    rol: "admin",
    sucursalesAsignadas: [],
    activo: true,
    creadoEn: FieldValue.serverTimestamp(),
    creadoPor: "crear-admin-script",
  });

  console.log(`Admin creado en ${proyecto}.`);
  console.log(`  Correo:     ${correo}`);
  console.log(`  Contraseña: ${passwordTemporal}`);
  console.log("Guárdala ahora — Firebase Auth no la vuelve a mostrar. Cámbiala en el primer login.");
}

await crearAdmin();
