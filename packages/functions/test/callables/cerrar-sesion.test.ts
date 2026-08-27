// Pruebas contra el emulador de Firestore (spec cierre-sesion, D-4: Fase A /
// Fase B sin estado a medias). Se prueba `cerrarSesionImpl` directamente, sin
// el emulador de Functions (misma convención que el resto del paquete).
//
// `unauthenticated`/`permission-denied`/entrada-inválida NO se reprueban aquí:
// `exigirAdmin` ya tiene su propio test genérico (`exigir-admin.test.ts`) y
// `cerrarSesionSchema` el suyo (`cerrar-sesion.schema.test.ts`); `cerrarSesion`
// sólo los invoca en ese orden, igual que `abrirSesion` (que tampoco los
// reprueba en `abrir-sesion.test.ts`).
import { randomUUID } from "node:crypto";
import { getApps, initializeApp } from "firebase-admin/app";
import { getFirestore, Timestamp, type Transaction } from "firebase-admin/firestore";
import { HttpsError } from "firebase-functions/v2/https";
import { describe, expect, it, vi } from "vitest";
import { cerrarSesionImpl } from "../../src/callables/cerrar-sesion.js";

if (getApps().length === 0) {
  initializeApp({ projectId: "demo-conteo-eficiente" });
}
const db = getFirestore();

async function crearSucursal(sucursalId: string, sesionAbiertaId: string | null): Promise<void> {
  await db.doc(`sucursales/${sucursalId}`).set({ nombre: "Sucursal de prueba", sesionAbiertaId });
}

async function crearSesion(
  sesionId: string,
  sucursalId: string,
  estado: "abierta" | "cerrada",
  participantes: readonly string[] = [],
): Promise<void> {
  await db.doc(`sesiones/${sesionId}`).set({
    sucursalId,
    estado,
    participantes,
    totalUnidades: 0,
  });
}

async function sembrarLinea(
  sesionId: string,
  categoriaId: string,
  overrides: Record<string, unknown>,
): Promise<void> {
  await db.doc(`sesiones/${sesionId}/lineas/${categoriaId}`).set({
    categoriaId,
    valorUnitario: 5000,
    etiqueta: "$5.000",
    cantidadTotal: 0,
    numAportantes: 0,
    versiones: {},
    actualizadaEn: new Date(),
    actualizadaPor: "uid_admin",
    ...overrides,
  });
}

async function sembrarUsuario(uid: string, nombre: string, activo: boolean): Promise<void> {
  await db
    .doc(`usuarios/${uid}`)
    .set({ nombre, correo: `${uid}@negocio.com`, rol: "cajero", activo });
}

async function sembrarSinConfirmar(sesionId: string, uids: readonly string[]): Promise<void> {
  const participantes = Object.fromEntries(
    uids.map((uid) => [uid, { confirmadoEn: null, ultimoAporteServidor: Timestamp.fromMillis(1) }]),
  );
  await db.doc(`sesiones/${sesionId}/sincronizacion/estado`).set({ participantes });
}

describe("cerrarSesionImpl", () => {
  it("ya cerrada · rechaza y no escribe (idempotente)", async () => {
    const sucursalId = `suc_${randomUUID()}`;
    const sesionId = `ses_${randomUUID()}`;
    await crearSucursal(sucursalId, null);
    await crearSesion(sesionId, sucursalId, "cerrada");

    await expect(cerrarSesionImpl(db, "uid_admin", { sesionId, forzar: false })).rejects.toThrow(
      HttpsError,
    );

    const historicos = await db.collection(`sucursales/${sucursalId}/historicos`).get();
    expect(historicos.size).toBe(0);
  });

  it("abierta sin pendientes · cierra sin forzar (afirmativo)", async () => {
    const sucursalId = `suc_${randomUUID()}`;
    const sesionId = `ses_${randomUUID()}`;
    await crearSucursal(sucursalId, sesionId);
    await crearSesion(sesionId, sucursalId, "abierta");
    await sembrarLinea(sesionId, "cat_5000", { cantidadTotal: 10 });

    await cerrarSesionImpl(db, "uid_admin", { sesionId, forzar: false });

    const sesion = await db.doc(`sesiones/${sesionId}`).get();
    expect(sesion.get("estado")).toBe("cerrada");
    expect(sesion.get("forzado")).toBe(false);
    const sucursal = await db.doc(`sucursales/${sucursalId}`).get();
    expect(sucursal.get("sesionAbiertaId")).toBeNull();

    const eventos = await db
      .collection("auditoria")
      .where("sesionId", "==", sesionId)
      .where("tipo", "==", "SESION_CERRADA")
      .get();
    expect(eventos.size).toBe(1);
    expect(eventos.docs[0]?.get("sinConfirmar")).toEqual([]);
  });

  it("ticket #45 · SESION_CERRADA lleva sucursalId denormalizado", async () => {
    const sucursalId = `suc_${randomUUID()}`;
    const sesionId = `ses_${randomUUID()}`;
    await crearSucursal(sucursalId, sesionId);
    await crearSesion(sesionId, sucursalId, "abierta");
    await sembrarLinea(sesionId, "cat_5000", { cantidadTotal: 10 });

    await cerrarSesionImpl(db, "uid_admin", { sesionId, forzar: false });

    const eventos = await db
      .collection("auditoria")
      .where("sesionId", "==", sesionId)
      .where("tipo", "==", "SESION_CERRADA")
      .get();
    expect(eventos.docs[0]?.get("sucursalId")).toBe(sucursalId);
  });

  it("bloqueada sin forzar · CIERRE_BLOQUEADO auditado, el inactivo no bloquea (negativo, multi-participante)", async () => {
    const sucursalId = `suc_${randomUUID()}`;
    const sesionId = `ses_${randomUUID()}`;
    // Tres participantes, no uno: si la implementación truncara la lista de
    // `verificarSincronizacion` a su primer elemento, o cruzara la exclusión
    // por inactivo con el bloqueo, un único participante no lo revelaría.
    await crearSucursal(sucursalId, sesionId);
    await crearSesion(sesionId, sucursalId, "abierta", ["uid_luis", "uid_maria", "uid_carla"]);
    await sembrarUsuario("uid_luis", "Luis Pérez", true);
    await sembrarUsuario("uid_maria", "María Gómez", true);
    await sembrarUsuario("uid_carla", "Carla Ruiz", false); // desactivada
    await sembrarSinConfirmar(sesionId, ["uid_luis", "uid_maria", "uid_carla"]);

    await expect(cerrarSesionImpl(db, "uid_admin", { sesionId, forzar: false })).rejects.toThrow(
      HttpsError,
    );

    const sesion = await db.doc(`sesiones/${sesionId}`).get();
    expect(sesion.get("estado")).toBe("abierta"); // sin escribir

    const eventos = await db
      .collection("auditoria")
      .where("sesionId", "==", sesionId)
      .where("tipo", "==", "CIERRE_BLOQUEADO")
      .get();
    expect(eventos.size).toBe(1);
    const detalle = eventos.docs[0]?.data();
    expect(detalle?.sinConfirmar).toEqual(
      expect.arrayContaining([
        { uid: "uid_luis", nombre: "Luis Pérez" },
        { uid: "uid_maria", nombre: "María Gómez" },
      ]),
    );
    expect(detalle?.sinConfirmar).toHaveLength(2);
    expect(detalle?.excluidosPorInactivo).toEqual([{ uid: "uid_carla", nombre: "Carla Ruiz" }]);
  });

  it("ticket #45 · CIERRE_BLOQUEADO lleva sucursalId denormalizado", async () => {
    const sucursalId = `suc_${randomUUID()}`;
    const sesionId = `ses_${randomUUID()}`;
    await crearSucursal(sucursalId, sesionId);
    await crearSesion(sesionId, sucursalId, "abierta", ["uid_luis"]);
    await sembrarUsuario("uid_luis", "Luis Pérez", true);
    await sembrarSinConfirmar(sesionId, ["uid_luis"]);

    await expect(cerrarSesionImpl(db, "uid_admin", { sesionId, forzar: false })).rejects.toThrow(
      HttpsError,
    );

    const eventos = await db
      .collection("auditoria")
      .where("sesionId", "==", sesionId)
      .where("tipo", "==", "CIERRE_BLOQUEADO")
      .get();
    expect(eventos.docs[0]?.get("sucursalId")).toBe(sucursalId);
  });

  it("forzado · cierra pese a pendientes y audita forzado:true con la lista completa (afirmativo)", async () => {
    const sucursalId = `suc_${randomUUID()}`;
    const sesionId = `ses_${randomUUID()}`;
    await crearSucursal(sucursalId, sesionId);
    await crearSesion(sesionId, sucursalId, "abierta", ["uid_luis", "uid_maria", "uid_carla"]);
    await sembrarUsuario("uid_luis", "Luis Pérez", true);
    await sembrarUsuario("uid_maria", "María Gómez", true);
    await sembrarUsuario("uid_carla", "Carla Ruiz", false);
    await sembrarSinConfirmar(sesionId, ["uid_luis", "uid_maria", "uid_carla"]);
    await sembrarLinea(sesionId, "cat_5000", { cantidadTotal: 3 });

    await cerrarSesionImpl(db, "uid_admin", { sesionId, forzar: true });

    const sesion = await db.doc(`sesiones/${sesionId}`).get();
    expect(sesion.get("estado")).toBe("cerrada");
    expect(sesion.get("forzado")).toBe(true);
    expect(sesion.get("sinConfirmarAlCerrar")).toHaveLength(2);

    const eventos = await db
      .collection("auditoria")
      .where("sesionId", "==", sesionId)
      .where("tipo", "==", "SESION_CERRADA")
      .get();
    expect(eventos.size).toBe(1);
    expect(eventos.docs[0]?.get("forzado")).toBe(true);
    expect(eventos.docs[0]?.get("sinConfirmar")).toHaveLength(2);
  });

  it("snapshot coincide con el recálculo final (afirmativo, varias líneas)", async () => {
    const sucursalId = `suc_${randomUUID()}`;
    const sesionId = `ses_${randomUUID()}`;
    await crearSucursal(sucursalId, sesionId);
    await crearSesion(sesionId, sucursalId, "abierta");
    // Tres líneas distintas: una sola no distinguiría un `categoriaMayor`
    // calculado sobre la línea equivocada de uno calculado sobre la correcta.
    await sembrarLinea(sesionId, "cat_5000", { cantidadTotal: 40, valorUnitario: 5000 });
    await sembrarLinea(sesionId, "cat_2000", { cantidadTotal: 300, valorUnitario: 2000 });
    await sembrarLinea(sesionId, "cat_10000", { cantidadTotal: 5, valorUnitario: 10000 });

    await cerrarSesionImpl(db, "uid_admin", { sesionId, forzar: false });

    const resumen = await db.doc(`sesiones/${sesionId}/resumen/actual`).get();
    const historico = await db.doc(`sucursales/${sucursalId}/historicos/${sesionId}`).get();

    expect(resumen.get("dirty")).toBe(false);
    expect(historico.get("totalUnidades")).toBe(resumen.get("totalUnidades"));
    expect(historico.get("totalMonetario")).toBe(resumen.get("totalMonetario"));
    expect(historico.get("porCategoria")).toEqual(resumen.get("porCategoria"));
    expect(historico.get("totalUnidades")).toBe(40 + 300 + 5);
    expect(historico.get("totalMonetario")).toBe(40 * 5000 + 300 * 2000 + 5 * 10000);
  });

  it("D-4 · un cierre reintentado tras uno ya exitoso se rechaza (interleaving real)", async () => {
    const sucursalId = `suc_${randomUUID()}`;
    const sesionId = `ses_${randomUUID()}`;
    await crearSucursal(sucursalId, sesionId);
    await crearSesion(sesionId, sucursalId, "abierta");
    await sembrarLinea(sesionId, "cat_5000", { cantidadTotal: 8 });

    const runTransactionOriginal = db.runTransaction.bind(db);
    // Misma técnica que recalcular-resumenes.test.ts: intercepta la ÚNICA
    // transacción de la Fase B del primer intento, y antes de dejarla correr,
    // un segundo cierre completo (el "ganador") corre primero de punta a
    // punta — exactamente la ventana entre la Fase A (ya pasada) y la Fase B
    // del primer intento que la idempotencia de D-4 debe cubrir.
    const espia = vi
      .spyOn(db, "runTransaction")
      .mockImplementationOnce(async (updateFunction: (tx: Transaction) => Promise<unknown>) => {
        await cerrarSesionImpl(db, "uid_admin", { sesionId, forzar: false });
        return runTransactionOriginal(updateFunction);
      });

    await expect(cerrarSesionImpl(db, "uid_admin", { sesionId, forzar: false })).rejects.toThrow(
      HttpsError,
    );
    espia.mockRestore();

    const historicos = await db.collection(`sucursales/${sucursalId}/historicos`).get();
    expect(historicos.size).toBe(1); // sólo el del cierre ganador

    const eventos = await db
      .collection("auditoria")
      .where("sesionId", "==", sesionId)
      .where("tipo", "==", "SESION_CERRADA")
      .get();
    expect(eventos.size).toBe(1);
  });

  it("D-4 · un cierre reintentado tras uno fallido corre limpio (afirmativo)", async () => {
    const sucursalId = `suc_${randomUUID()}`;
    const sesionId = `ses_${randomUUID()}`;
    await crearSucursal(sucursalId, sesionId);
    await crearSesion(sesionId, sucursalId, "abierta");
    await sembrarLinea(sesionId, "cat_5000", { cantidadTotal: 6 });

    const espia = vi.spyOn(db, "runTransaction").mockImplementationOnce(async () => {
      throw new Error("fallo simulado de infraestructura durante la Fase B");
    });

    await expect(cerrarSesionImpl(db, "uid_admin", { sesionId, forzar: false })).rejects.toThrow(
      "fallo simulado",
    );
    espia.mockRestore();

    const sesionTrasFallo = await db.doc(`sesiones/${sesionId}`).get();
    expect(sesionTrasFallo.get("estado")).toBe("abierta"); // intacta, nada se escribió

    await cerrarSesionImpl(db, "uid_admin", { sesionId, forzar: false });

    const sesionFinal = await db.doc(`sesiones/${sesionId}`).get();
    expect(sesionFinal.get("estado")).toBe("cerrada");
    const eventos = await db
      .collection("auditoria")
      .where("sesionId", "==", sesionId)
      .where("tipo", "==", "SESION_CERRADA")
      .get();
    expect(eventos.size).toBe(1); // el intento fallido no dejó rastro
  });
});
