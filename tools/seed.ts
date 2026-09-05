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
const AREA_ID = "area_general";
const NUM_CATEGORIAS = 60;
const PASSWORD_TEMPORAL = "Temp2026#";
// Id fijo (no randomUUID, a diferencia de abrirSesionImpl/abrir-conteo.ts):
// el E2E de Playwright navega directo a /conteo/{id}/preparar sin pasar por
// la UI de apertura, que hoy no existe (PanelScreen aún no tiene botón).
const SESION_ID = "sesion_e2e_norte";

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

/**
 * sembrarArea — desde D-1/PrepararScreen (docs/diseno/etapa-3-ui.md, ADR-23)
 * el área activa es obligatoria para entrar a contar: sin al menos un
 * documento en `areas`, `flujo-conteo.spec.ts` se queda bloqueado en "No hay
 * áreas configuradas todavía". Una sola área basta para este E2E — no
 * ejercita el filtro D-2 (eso lo cubren los tests de `apps/web`).
 */
async function sembrarArea(): Promise<void> {
  await db.doc(`areas/${AREA_ID}`).set({
    nombre: "General",
    activa: true,
    creadaEn: FieldValue.serverTimestamp(),
  });
}

async function sembrarSucursal(): Promise<void> {
  await db.doc(`sucursales/${SUCURSAL_ID}`).set({
    nombre: "Sucursal Norte",
    direccion: "Cra 43 #75-120",
    conectividad: "datos",
    activa: true,
    // I-1: la sucursal apunta a la sesión abierta que sembrarSesionAbierta()
    // crea más abajo — mismo campo que abrirSesionImpl escribe atómicamente.
    sesionAbiertaId: SESION_ID,
    creadaEn: FieldValue.serverTimestamp(),
  });
}

/**
 * sembrarSesionAbierta — réplica de lo que escribe `abrirSesionImpl`
 * (packages/functions/src/callables/abrir-sesion.ts: sesión + una línea por
 * categoría activa), pero con SESION_ID fijo en vez de generado, para que el
 * E2E de Playwright navegue directo a /conteo/{id}/preparar sin pasar por la
 * UI de apertura (que hoy no existe en PanelScreen).
 */
async function sembrarSesionAbierta(anaUid: string): Promise<void> {
  await db.doc(`sesiones/${SESION_ID}`).set({
    sucursalId: SUCURSAL_ID,
    sucursalNombre: "Sucursal Norte",
    estado: "abierta",
    abiertaEn: FieldValue.serverTimestamp(),
    abiertaPor: "seed",
    cerradaEn: null,
    cerradaPor: null,
    participantes: [],
    totalUnidades: 0,
    sesionCorregidaId: null,
  });

  // El trigger `onAporteEscrito` (packages/functions/src/triggers/on-aporte-escrito.ts)
  // normalmente crea la entrada de cada participante aquí en su primer aporte
  // — pero el E2E corre sólo contra auth+firestore (ConteoRepository escribe
  // directo a Firestore, doc 08 §3), sin el emulador de Functions que dispara
  // triggers. `confirmarSincronizacion` (FinalizarScreen) hace `updateDoc`
  // (exige que el doc ya exista), y la Security Rule (infra/firestore.rules,
  // "sincronización RF-16") diffea `participantes[miUid()]` contra la entrada
  // VIEJA del propio documento — con el mapa vacío, esa clave no existe y la
  // regla lanza un evaluation error. Se siembra ya con la entrada de Ana (la
  // única cajera que corre `flujo-conteo.spec.ts`) para que el `.diff()` de
  // la regla tenga algo contra qué comparar.
  await db.doc(`sesiones/${SESION_ID}/sincronizacion/estado`).set({
    participantes: { [anaUid]: {} },
    actualizadoEn: FieldValue.serverTimestamp(),
  });

  // ponytail: las 60 líneas se siembran sin `areaIds` (D-1,
  // docs/diseno/etapa-3-ui.md) — "sin área", visibles para cualquier área
  // activa (D-2). Con una sola área sembrada (sembrarArea) el interruptor
  // "Ver todo" nunca se pinta aquí (no oculta nada); ese camino lo cubren los
  // tests de `apps/web`, no este E2E. Ruta de escalamiento: asignar
  // `areaIds` a un subconjunto de líneas el día que un E2E necesite
  // ejercitar el filtro D-2/D-3.
  const lote = db.batch();
  for (let i = 1; i <= NUM_CATEGORIAS; i++) {
    const valor = i * 500;
    lote.set(db.doc(`sesiones/${SESION_ID}/lineas/cat_${valor}`), {
      categoriaId: `cat_${valor}`,
      valorUnitario: valor,
      etiqueta: `$${valor.toLocaleString("es-CO")}`,
      area: "General",
      cantidadTotal: 0,
      numAportantes: 0,
      versiones: {},
      actualizadaEn: FieldValue.serverTimestamp(),
      actualizadaPor: "seed",
    });
  }
  await lote.commit();
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
  await sembrarArea();
  await crearUsuario("Admin Principal", "admin@negocio.com", "admin", []);
  const anaUid = await crearUsuario("Ana Ramírez", "ana@negocio.com", "cajero", [SUCURSAL_ID]);
  await crearUsuario("Luis Pérez", "luis@negocio.com", "cajero", [SUCURSAL_ID]);
  await sembrarCategorias();
  await sembrarSesionAbierta(anaUid);

  console.log(
    `Seed completo: 1 sucursal (${SUCURSAL_ID}), 1 área (${AREA_ID}), 1 admin, 2 cajeros, ` +
      `${NUM_CATEGORIAS} categoriasValor, 1 sesión abierta (${SESION_ID}).`,
  );
}

await sembrar();
