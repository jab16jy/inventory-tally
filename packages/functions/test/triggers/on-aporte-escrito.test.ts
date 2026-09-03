// Pruebas contra el emulador de Firestore (doc 05 §3 y §7: T-1, T-3, T-8, I-4).
//
// Decisión de la ola O3: se prueba el núcleo `procesarAporteEscrito` en vez del
// `CloudFunction` envuelto por `onDocumentWritten`. Levantar el emulador de
// Functions en Windows es frágil y no aporta nada aquí: la lógica que hay que
// probar es la transacción, no el enrutamiento de eventos de Cloud Functions,
// que es código de Google ya probado. `onAporteEscrito` sólo adapta el
// `event` real al mismo núcleo (ver src/triggers/on-aporte-escrito.ts).
import { randomUUID } from "node:crypto";
import { getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { afterEach, describe, expect, it } from "vitest";
import { procesarAporteEscrito } from "../../src/triggers/on-aporte-escrito.js";

if (getApps().length === 0) {
  initializeApp({ projectId: "demo-conteo-eficiente" });
}
const db = getFirestore();

// Este paquete comparte UN emulador de Firestore mutable entre archivos
// (packages/functions/vitest.config.ts). Una sesión "abierta" que sobrevive
// al test contamina la consulta global de recalcular-resumenes.test.ts
// (where("estado","==","abierta")) — issue de CI del 2026-08-27.
const sesionesCreadas: string[] = [];

async function crearSesionAbierta(sesionId: string): Promise<void> {
  sesionesCreadas.push(sesionId);
  await db.doc(`sesiones/${sesionId}`).set({
    sucursalId: "suc_norte",
    estado: "abierta",
    participantes: [],
    totalUnidades: 0,
  });
}

afterEach(async () => {
  await Promise.all(sesionesCreadas.map((id) => db.doc(`sesiones/${id}`).delete()));
  sesionesCreadas.length = 0;
});

describe("procesarAporteEscrito", () => {
  it("T-3 · reprocesar el mismo evento no duplica el total (idempotencia por versiones)", async () => {
    const sesionId = `ses_${randomUUID()}`;
    const categoriaId = "cat_5000";
    await crearSesionAbierta(sesionId);
    const params = { sesionId, categoriaId, claveAporte: "uid_ana__area_1" };
    const despues = { uid: "uid_ana", areaId: "area_1", nombre: "Ana", cantidad: 10, version: 1 };

    await procesarAporteEscrito(db, params, undefined, despues);
    await procesarAporteEscrito(db, params, undefined, despues); // el trigger reejecuta el mismo evento

    const linea = await db.doc(`sesiones/${sesionId}/lineas/${categoriaId}`).get();
    expect(linea.get("cantidadTotal")).toBe(10);
    expect(linea.get("numAportantes")).toBe(1);
    expect(linea.get("porArea")).toEqual({ area_1: 10 });
  });

  it("D2 · entrega fuera de orden (v2 antes que v1) no pierde el delta", async () => {
    const sesionId = `ses_${randomUUID()}`;
    const categoriaId = "cat_5000";
    await crearSesionAbierta(sesionId);
    const params = { sesionId, categoriaId, claveAporte: "uid_ana__area_1" };

    // v2 llega primero (Firestore es at-least-once y NO garantiza orden):
    // 5 → 12, delta real 7.
    await procesarAporteEscrito(
      db,
      params,
      { uid: "uid_ana", areaId: "area_1", nombre: "Ana", cantidad: 5, version: 1 },
      { uid: "uid_ana", areaId: "area_1", nombre: "Ana", cantidad: 12, version: 2 },
    );
    // v1 llega después: 0 → 5. La guardia de versión (1 <= 2) la descarta;
    // con el cálculo viejo (delta contra el `before` del propio evento) esto
    // perdía el delta y dejaba el total en 7 en vez de 12.
    await procesarAporteEscrito(db, params, undefined, {
      uid: "uid_ana",
      areaId: "area_1",
      nombre: "Ana",
      cantidad: 5,
      version: 1,
    });

    const linea = await db.doc(`sesiones/${sesionId}/lineas/${categoriaId}`).get();
    expect(linea.get("cantidadTotal")).toBe(12);
    expect(linea.get("porArea")).toEqual({ area_1: 12 });
  });

  it("T-1/T-8 · dos cajeros distintos suman sin pisarse", async () => {
    const sesionId = `ses_${randomUUID()}`;
    const categoriaId = "cat_5000";
    await crearSesionAbierta(sesionId);

    await Promise.all([
      procesarAporteEscrito(
        db,
        { sesionId, categoriaId, claveAporte: "uid_ana__area_1" },
        undefined,
        {
          uid: "uid_ana",
          areaId: "area_1",
          nombre: "Ana",
          cantidad: 30,
          version: 1,
        },
      ),
      procesarAporteEscrito(
        db,
        { sesionId, categoriaId, claveAporte: "uid_luis__area_1" },
        undefined,
        {
          uid: "uid_luis",
          areaId: "area_1",
          nombre: "Luis",
          cantidad: 25,
          version: 1,
        },
      ),
    ]);

    const linea = await db.doc(`sesiones/${sesionId}/lineas/${categoriaId}`).get();
    expect(linea.get("cantidadTotal")).toBe(55);
    expect(linea.get("numAportantes")).toBe(2);
    expect(linea.get("versiones")).toEqual({ uid_ana__area_1: 1, uid_luis__area_1: 1 });
    expect(linea.get("porArea")).toEqual({ area_1: 55 });
  });

  it("ADR-23 · dos aportes de la misma cajera en áreas distintas suman en porArea sin pisarse", async () => {
    const sesionId = `ses_${randomUUID()}`;
    const categoriaId = "cat_5000";
    await crearSesionAbierta(sesionId);

    await Promise.all([
      procesarAporteEscrito(
        db,
        { sesionId, categoriaId, claveAporte: "uid_ana__area_caja" },
        undefined,
        {
          uid: "uid_ana",
          areaId: "area_caja",
          nombre: "Ana",
          cantidad: 15,
          version: 1,
        },
      ),
      procesarAporteEscrito(
        db,
        { sesionId, categoriaId, claveAporte: "uid_ana__area_bodega" },
        undefined,
        {
          uid: "uid_ana",
          areaId: "area_bodega",
          nombre: "Ana",
          cantidad: 10,
          version: 1,
        },
      ),
    ]);

    const linea = await db.doc(`sesiones/${sesionId}/lineas/${categoriaId}`).get();
    expect(linea.get("cantidadTotal")).toBe(25);
    expect(linea.get("numAportantes")).toBe(2);
    expect(linea.get("versiones")).toEqual({
      uid_ana__area_caja: 1,
      uid_ana__area_bodega: 1,
    });
    expect(linea.get("porArea")).toEqual({
      area_caja: 15,
      area_bodega: 10,
    });
  });

  it("D2/RNF-03 · dos entregas concurrentes del MISMO evento (mismo uid+area+version) no duplican el delta", async () => {
    const sesionId = `ses_${randomUUID()}`;
    const categoriaId = "cat_5000";
    await crearSesionAbierta(sesionId);
    const params = { sesionId, categoriaId, claveAporte: "uid_ana__area_1" };

    // Estado previo: version 1 ya aplicada (cantidad 10).
    await procesarAporteEscrito(db, params, undefined, {
      uid: "uid_ana",
      areaId: "area_1",
      nombre: "Ana",
      cantidad: 10,
      version: 1,
    });

    const despues = { uid: "uid_ana", areaId: "area_1", nombre: "Ana", cantidad: 25, version: 2 };
    await Promise.all([
      procesarAporteEscrito(db, params, undefined, despues),
      procesarAporteEscrito(db, params, undefined, despues),
    ]);

    const linea = await db.doc(`sesiones/${sesionId}/lineas/${categoriaId}`).get();
    expect(linea.get("cantidadTotal")).toBe(25); // 10 + delta(15) aplicado UNA vez, no 40
    expect(linea.get("numAportantes")).toBe(1);
    expect(linea.get("versiones")).toEqual({ uid_ana__area_1: 2 });
    expect(linea.get("porArea")).toEqual({ area_1: 25 });
  });

  it("corrige un aporte propio por delta sin tocar el de otro cajero (doc 05 §2)", async () => {
    const sesionId = `ses_${randomUUID()}`;
    const categoriaId = "cat_5000";
    await crearSesionAbierta(sesionId);

    await procesarAporteEscrito(
      db,
      { sesionId, categoriaId, claveAporte: "uid_ana__area_1" },
      undefined,
      {
        uid: "uid_ana",
        areaId: "area_1",
        nombre: "Ana",
        cantidad: 30,
        version: 1,
      },
    );
    await procesarAporteEscrito(
      db,
      { sesionId, categoriaId, claveAporte: "uid_luis__area_1" },
      undefined,
      {
        uid: "uid_luis",
        areaId: "area_1",
        nombre: "Luis",
        cantidad: 25,
        version: 1,
      },
    );
    // Ana se equivocó: eran 28, no 30.
    await procesarAporteEscrito(
      db,
      { sesionId, categoriaId, claveAporte: "uid_ana__area_1" },
      { uid: "uid_ana", areaId: "area_1", nombre: "Ana", cantidad: 30, version: 1 },
      { uid: "uid_ana", areaId: "area_1", nombre: "Ana", cantidad: 28, version: 2 },
    );

    const linea = await db.doc(`sesiones/${sesionId}/lineas/${categoriaId}`).get();
    expect(linea.get("cantidadTotal")).toBe(53);
    expect(linea.get("numAportantes")).toBe(2);
    expect(linea.get("porArea")).toEqual({ area_1: 53 });
  });

  it("I-4 · no agrega sobre una sesión cerrada", async () => {
    const sesionId = `ses_${randomUUID()}`;
    const categoriaId = "cat_5000";
    await db.doc(`sesiones/${sesionId}`).set({
      sucursalId: "suc_norte",
      estado: "cerrada",
      participantes: [],
      totalUnidades: 0,
    });

    await procesarAporteEscrito(
      db,
      { sesionId, categoriaId, claveAporte: "uid_ana__area_1" },
      undefined,
      {
        uid: "uid_ana",
        areaId: "area_1",
        nombre: "Ana",
        cantidad: 30,
        version: 1,
      },
    );

    const linea = await db.doc(`sesiones/${sesionId}/lineas/${categoriaId}`).get();
    expect(linea.exists).toBe(false);
  });

  it("registra un evento de auditoría APORTE_CREADO en la misma transacción", async () => {
    const sesionId = `ses_${randomUUID()}`;
    const categoriaId = "cat_5000";
    await crearSesionAbierta(sesionId);

    await procesarAporteEscrito(
      db,
      { sesionId, categoriaId, claveAporte: "uid_ana__area_1" },
      undefined,
      {
        uid: "uid_ana",
        areaId: "area_1",
        nombre: "Ana",
        cantidad: 30,
        version: 1,
      },
    );

    const eventos = await db.collection("auditoria").where("sesionId", "==", sesionId).get();
    expect(eventos.size).toBe(1);
    expect(eventos.docs[0]?.get("tipo")).toBe("APORTE_CREADO");
  });

  it("ticket #45 · el evento de auditoría lleva sucursalId denormalizado, sin lectura extra", async () => {
    const sesionId = `ses_${randomUUID()}`;
    const categoriaId = "cat_5000";
    await crearSesionAbierta(sesionId); // sucursalId: "suc_norte"

    await procesarAporteEscrito(
      db,
      { sesionId, categoriaId, claveAporte: "uid_ana__area_1" },
      undefined,
      {
        uid: "uid_ana",
        areaId: "area_1",
        nombre: "Ana",
        cantidad: 30,
        version: 1,
      },
    );

    const eventos = await db.collection("auditoria").where("sesionId", "==", sesionId).get();
    expect(eventos.docs[0]?.get("sucursalId")).toBe("suc_norte");
  });

  it("I-M · marca resumen/actual dirty y sube marcaAportes de forma monotónica", async () => {
    const sesionId = `ses_${randomUUID()}`;
    const categoriaId = "cat_5000";
    await crearSesionAbierta(sesionId);

    await procesarAporteEscrito(
      db,
      { sesionId, categoriaId, claveAporte: "uid_ana__area_1" },
      undefined,
      {
        uid: "uid_ana",
        areaId: "area_1",
        nombre: "Ana",
        cantidad: 30,
        version: 1,
      },
    );
    const resumenTrasPrimero = await db.doc(`sesiones/${sesionId}/resumen/actual`).get();
    expect(resumenTrasPrimero.get("dirty")).toBe(true);
    expect(resumenTrasPrimero.get("marcaAportes")).toBe(1);

    await procesarAporteEscrito(
      db,
      { sesionId, categoriaId, claveAporte: "uid_ana__area_1" },
      { uid: "uid_ana", areaId: "area_1", nombre: "Ana", cantidad: 30, version: 1 },
      { uid: "uid_ana", areaId: "area_1", nombre: "Ana", cantidad: 28, version: 2 },
    );
    const resumenTrasSegundo = await db.doc(`sesiones/${sesionId}/resumen/actual`).get();
    expect(resumenTrasSegundo.get("marcaAportes")).toBe(2); // sube, nunca se reinicia
  });

  it("marca sesiones/{id}/sincronizacion/estado sin borrar la entrada de otro cajero", async () => {
    const sesionId = `ses_${randomUUID()}`;
    const categoriaId = "cat_5000";
    await crearSesionAbierta(sesionId);
    await db.doc(`sesiones/${sesionId}/sincronizacion/estado`).set({
      participantes: { uid_luis: { confirmadoEn: null } },
      actualizadoEn: null,
    });

    await procesarAporteEscrito(
      db,
      { sesionId, categoriaId, claveAporte: "uid_ana__area_1" },
      undefined,
      {
        uid: "uid_ana",
        areaId: "area_1",
        nombre: "Ana",
        cantidad: 30,
        version: 1,
      },
    );

    const sync = await db.doc(`sesiones/${sesionId}/sincronizacion/estado`).get();
    expect(sync.get("participantes.uid_luis.confirmadoEn")).toBeNull();
    expect(sync.get("participantes.uid_ana.ultimoAporteServidor")).toBeTruthy();
  });
});
