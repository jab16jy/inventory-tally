/**
 * seed.ts — siembra el emulador local (doc 08 §3: sustituto de `crearCajero`,
 * que aún no existe en esta ola). Crea 1 admin y 2 cajeros con custom claims
 * `{ rol, sucursales }`, 1 sucursal y 60 `categoriasValor` con valores
 * realistas en pesos colombianos.
 *
 * Uso: con el Emulator Suite corriendo (`npm run emu`), en otra terminal:
 *   node --experimental-strip-types tools/seed.ts
 *
 * ponytail: script de un solo uso contra un emulador recién iniciado, no es
 * idempotente (recrear un usuario con el mismo correo falla con
 * already-exists). Reinicia el emulador antes de volver a sembrar.
 */
import { initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { FieldValue, getFirestore } from "firebase-admin/firestore";

process.env.FIRESTORE_EMULATOR_HOST ??= "127.0.0.1:8080";
process.env.FIREBASE_AUTH_EMULATOR_HOST ??= "127.0.0.1:9099";

initializeApp({ projectId: "demo-conteo-eficiente" });
const auth = getAuth();
const db = getFirestore();

const SUCURSAL_ID = "suc_norte";
const NUM_CATEGORIAS = 60;
const PASSWORD_TEMPORAL = "Temp2026#";

async function crearUsuario(
  nombre: string,
  correo: string,
  rol: "admin" | "cajero",
  sucursales: string[],
): Promise<string> {
  const usuario = await auth.createUser({
    email: correo,
    password: PASSWORD_TEMPORAL,
    displayName: nombre,
  });
  // Los claims son la fuente de verdad para las Security Rules (doc 09 §2).
  await auth.setCustomUserClaims(usuario.uid, { rol, sucursales });
  await db.doc(`usuarios/${usuario.uid}`).set({
    nombre,
    correo,
    rol,
    sucursalesAsignadas: sucursales,
    activo: true,
    creadoEn: FieldValue.serverTimestamp(),
    creadoPor: "seed",
  });
  return usuario.uid;
}

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
    const valor = i * 500; // 500, 1.000, 1.500 … 30.000 — valores realistas en COP
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

async function sembrar(): Promise<void> {
  await sembrarSucursal();
  await crearUsuario("Admin Principal", "admin@negocio.com", "admin", []);
  await crearUsuario("Ana Ramírez", "ana@negocio.com", "cajero", [SUCURSAL_ID]);
  await crearUsuario("Luis Pérez", "luis@negocio.com", "cajero", [SUCURSAL_ID]);
  await sembrarCategorias();

  console.log(
    `Seed completo: 1 sucursal (${SUCURSAL_ID}), 1 admin, 2 cajeros, ${NUM_CATEGORIAS} categoriasValor.`,
  );
}

await sembrar();
