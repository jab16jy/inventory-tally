/**
 * sembrar-datos-prueba.ts — siembra 1 sucursal, 60 categoriasValor y 2
 * cajeros en un proyecto REAL de Firebase, para ver la UI poblada. Mismo
 * esquema que seed.ts (que sólo siembra el emulador), retargeteado a un
 * proyecto real vía `applicationDefault()`.
 *
 * Uso:
 *   GOOGLE_APPLICATION_CREDENTIALS=<service-account.json> \
 *   node --experimental-strip-types tools/sembrar-datos-prueba.ts <proyecto>
 *
 * Para revertir, correr borrar-datos-prueba.ts con el mismo proyecto.
 *
 * ponytail: sin flag --prod ni confirmación interactiva — el argumento del
 * proyecto es explícito y quien corre el script ya decidió el destino
 * (mismo criterio que crear-admin.ts).
 */
import { randomBytes } from "node:crypto";
import { applicationDefault, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { CAJEROS, NUM_CATEGORIAS, SUCURSAL_ID } from "./datos-prueba.ts";

const [, , proyecto] = process.argv;

if (!proyecto) {
  console.error("Uso: node --experimental-strip-types tools/sembrar-datos-prueba.ts <proyecto>");
  process.exit(1);
}

initializeApp({ credential: applicationDefault(), projectId: proyecto });
const auth = getAuth();
const db = getFirestore();

async function sembrarSucursal(): Promise<void> {
  await db.doc(`sucursales/${SUCURSAL_ID}`).set({
    nombre: "Sucursal Norte",
    direccion: "Cra 43 #75-120",
    conectividad: "datos",
    activa: true,
    sesionAbiertaId: null,
    creadaEn: FieldValue.serverTimestamp(),
  });
}

async function sembrarCategorias(): Promise<void> {
  const lote = db.batch();
  for (let i = 1; i <= NUM_CATEGORIAS; i++) {
    const valor = i * 500;
    lote.set(db.doc(`categoriasValor/cat_${valor}`), {
      valor,
      etiqueta: `$${valor.toLocaleString("es-CO")}`,
      activa: true,
      orden: i,
      creadaEn: FieldValue.serverTimestamp(),
    });
  }
  await lote.commit();
}

async function sembrarCajero(nombre: string, correo: string): Promise<void> {
  const passwordTemporal = randomBytes(9).toString("base64url");
  let usuario;
  try {
    usuario = await auth.createUser({
      email: correo,
      password: passwordTemporal,
      displayName: nombre,
    });
  } catch (error) {
    if ((error as { code?: string }).code === "auth/email-already-exists") {
      console.log(`Ya existe ${correo}, se omite.`);
      return;
    }
    throw error;
  }
  await auth.setCustomUserClaims(usuario.uid, { rol: "cajero", sucursales: [SUCURSAL_ID] });
  await db.doc(`usuarios/${usuario.uid}`).set({
    nombre,
    correo,
    rol: "cajero",
    sucursalesAsignadas: [SUCURSAL_ID],
    activo: true,
    creadoEn: FieldValue.serverTimestamp(),
    creadoPor: "sembrar-datos-prueba-script",
  });
  console.log(`Cajero creado: ${correo} / ${passwordTemporal}`);
}

async function sembrar(): Promise<void> {
  await sembrarSucursal();
  await sembrarCategorias();
  for (const { nombre, correo } of CAJEROS) {
    await sembrarCajero(nombre, correo);
  }
  console.log(
    `Datos de prueba sembrados en ${proyecto}: 1 sucursal (${SUCURSAL_ID}), ${NUM_CATEGORIAS} categoriasValor, ${CAJEROS.length} cajeros.`,
  );
}

await sembrar();
