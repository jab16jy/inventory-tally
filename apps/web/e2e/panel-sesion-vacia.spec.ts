// apps/web/e2e/panel-sesion-vacia.spec.ts — reproduce el bug de campo real:
// una sesión abierta cuyo catálogo tenía CERO categorías activas (por lo
// tanto, cero líneas para siempre) se quedaba en esqueleto eterno en
// PanelScreen.tsx, que colapsaba "sin snapshot todavía" (undefined) y
// "catálogo vacío" ([]) con `?? []`. El esqueleto no pinta "Cerrar →" — la
// única puerta al cierre (SesionesScreen sólo enlaza a /analisis) — así que
// la sucursal quedaba muerta: I-1 bloquea abrir otra sesión mientras esa
// siga abierta. Los tests unitarios (jsdom + fake repo) son un proxy
// sintético; esto corre contra el Emulator Suite real (auth + firestore, ver
// `test:e2e` en la raíz), sembrando esta sesión aparte con firebase-admin
// ANTES de la parte de navegador, sin tocar `suc_norte`/`sesion_e2e_norte`
// (otros specs corren en paralelo contra el mismo emulador).
//
// No se ejercita el cierre real (`cerrarSesion` callable): el suite de e2e
// sólo levanta auth+firestore (`--only auth,firestore`), sin Functions.
import { initializeApp } from "firebase-admin/app";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { expect, test } from "@playwright/test";

// Mismo fallback defensivo que tools/seed.ts: `firebase emulators:exec` ya
// exporta esto al proceso de Playwright (misma shell que corre `test:e2e`),
// pero por si se corre este spec suelto.
process.env.FIRESTORE_EMULATOR_HOST ??= "127.0.0.1:8080";

const app = initializeApp({ projectId: "demo-conteo-eficiente" }, "panel-sesion-vacia");
const db = getFirestore(app);

const SUCURSAL_ID = "suc_catalogo_vacio";
const SUCURSAL_NOMBRE = "Sucursal Catálogo Vacío";
const SESION_ID = "sesion_e2e_catalogo_vacio";

test.beforeAll(async () => {
  // Mismos campos que abrirSesionImpl/tools/seed.ts escriben — sin
  // subcolección `lineas`: el catálogo estaba vacío cuando se abrió.
  await db.doc(`sesiones/${SESION_ID}`).set({
    sucursalId: SUCURSAL_ID,
    sucursalNombre: SUCURSAL_NOMBRE,
    estado: "abierta",
    abiertaEn: FieldValue.serverTimestamp(),
    abiertaPor: "seed-e2e",
    cerradaEn: null,
    cerradaPor: null,
    participantes: [],
    totalUnidades: 0,
    sesionCorregidaId: null,
  });
  await db.doc(`sucursales/${SUCURSAL_ID}`).set({
    nombre: SUCURSAL_NOMBRE,
    direccion: "—",
    conectividad: "datos",
    activa: true,
    sesionAbiertaId: SESION_ID,
    creadaEn: FieldValue.serverTimestamp(),
  });
});

test.afterAll(async () => {
  await db.doc(`sesiones/${SESION_ID}`).delete();
  await db.doc(`sucursales/${SUCURSAL_ID}`).delete();
});

test.describe("panel del administrador — sesión con catálogo vacío", () => {
  test("la fila no se queda en esqueleto: expone 'Cerrar →' y navega al cierre", async ({
    page,
  }) => {
    await page.goto("/login");
    await page.getByLabel("Correo").fill("admin@negocio.com");
    await page.getByLabel("Contraseña").fill("Temp2026#");
    await page.getByRole("button", { name: "Entrar" }).click();

    await expect(page).toHaveURL(/\/admin$/);

    // Control negativo: la sesión sembrada con líneas (suc_norte) no se ve
    // afectada por este cambio.
    await expect(page.getByRole("button", { name: "Análisis — Sucursal Norte" })).toBeVisible();

    // Si la fila siguiera en esqueleto, este botón no existiría nunca — el
    // esqueleto no renderiza el nombre de la sucursal ni botones.
    const botonCerrar = page.getByRole("button", { name: `Cerrar sesión — ${SUCURSAL_NOMBRE}` });
    await expect(botonCerrar).toBeVisible();
    await botonCerrar.click();

    await expect(page).toHaveURL(new RegExp(`/admin/sesiones/${SESION_ID}/cerrar$`));
    await expect(
      page.getByRole("heading", { name: `Cerrar conteo · ${SUCURSAL_NOMBRE}` }),
    ).toBeVisible();
  });
});
