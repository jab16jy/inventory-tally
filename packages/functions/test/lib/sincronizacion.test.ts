// Pruebas contra el emulador de Firestore (spec cierre-sesion, D-3: predicado
// RF-16 corregido). `verificarSincronizacion` se prueba directamente, sin el
// emulador de Functions (misma convención que el resto del paquete).
import { randomUUID } from "node:crypto";
import { getApps, initializeApp } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { describe, expect, it } from "vitest";
import { verificarSincronizacion } from "../../src/lib/sincronizacion.js";

if (getApps().length === 0) {
  initializeApp({ projectId: "demo-conteo-eficiente" });
}
const db = getFirestore();

async function sembrarUsuario(uid: string, nombre: string, activo: boolean): Promise<void> {
  await db
    .doc(`usuarios/${uid}`)
    .set({ nombre, correo: `${uid}@negocio.com`, rol: "cajero", activo });
}

async function sembrarSincronizacion(
  sesionId: string,
  participantes: Record<
    string,
    { confirmadoEn: Timestamp | null; ultimoAporteServidor: Timestamp | null }
  >,
): Promise<void> {
  await db.doc(`sesiones/${sesionId}/sincronizacion/estado`).set({ participantes });
}

describe("verificarSincronizacion", () => {
  it("afirmativo · confirmado y nunca vuelto a aportar → sincronizado", async () => {
    const sesionId = `ses_${randomUUID()}`;
    await sembrarUsuario("uid_ana", "Ana Ramírez", true);
    await sembrarSincronizacion(sesionId, {
      uid_ana: {
        confirmadoEn: Timestamp.fromMillis(2000),
        ultimoAporteServidor: Timestamp.fromMillis(1000),
      },
    });

    const resultado = await verificarSincronizacion(db, sesionId, ["uid_ana"]);

    expect(resultado.sinConfirmar).toEqual([]);
    expect(resultado.excluidosPorInactivo).toEqual([]);
  });

  it("negativo · confirmado y luego vuelto a aportar → obsoleto (discrimina el chequeo de verdad de doc 08)", async () => {
    const sesionId = `ses_${randomUUID()}`;
    await sembrarUsuario("uid_ana", "Ana Ramírez", true);
    await sembrarSincronizacion(sesionId, {
      // confirmadoEn es verdadero (11:00) pero un aporte posterior (11:05) lo
      // vuelve obsoleto. Un chequeo `!!confirmadoEn` lo daría por
      // sincronizado; el predicado correcto exige confirmadoEn >= ultimoAporteServidor.
      uid_ana: {
        confirmadoEn: Timestamp.fromMillis(1000),
        ultimoAporteServidor: Timestamp.fromMillis(2000),
      },
    });

    const resultado = await verificarSincronizacion(db, sesionId, ["uid_ana"]);

    expect(resultado.sinConfirmar).toEqual([{ uid: "uid_ana", nombre: "Ana Ramírez" }]);
  });

  it("afirmativo · nunca confirmado → sin sincronizar", async () => {
    const sesionId = `ses_${randomUUID()}`;
    await sembrarUsuario("uid_luis", "Luis Pérez", true);
    await sembrarSincronizacion(sesionId, {
      uid_luis: { confirmadoEn: null, ultimoAporteServidor: Timestamp.fromMillis(1000) },
    });

    const resultado = await verificarSincronizacion(db, sesionId, ["uid_luis"]);

    expect(resultado.sinConfirmar).toEqual([{ uid: "uid_luis", nombre: "Luis Pérez" }]);
  });

  it("afirmativo · participante desactivado se excluye, no bloquea", async () => {
    const sesionId = `ses_${randomUUID()}`;
    await sembrarUsuario("uid_luis", "Luis Pérez", false);
    await sembrarSincronizacion(sesionId, {
      uid_luis: { confirmadoEn: null, ultimoAporteServidor: Timestamp.fromMillis(1000) },
    });

    const resultado = await verificarSincronizacion(db, sesionId, ["uid_luis"]);

    expect(resultado.sinConfirmar).toEqual([]);
    expect(resultado.excluidosPorInactivo).toEqual([{ uid: "uid_luis", nombre: "Luis Pérez" }]);
  });

  it("negativo · activo y sin sincronizar sigue bloqueando (contraparte de la exclusión por inactivo)", async () => {
    const sesionId = `ses_${randomUUID()}`;
    await sembrarUsuario("uid_luis", "Luis Pérez", true);
    await sembrarSincronizacion(sesionId, {
      uid_luis: { confirmadoEn: null, ultimoAporteServidor: Timestamp.fromMillis(1000) },
    });

    const resultado = await verificarSincronizacion(db, sesionId, ["uid_luis"]);

    expect(resultado.sinConfirmar).toEqual([{ uid: "uid_luis", nombre: "Luis Pérez" }]);
    expect(resultado.excluidosPorInactivo).toEqual([]);
  });

  it("negativo · con varios participantes cada uno lee SU propio usuario (correspondencia de índices de getAll)", async () => {
    // Único test con más de un participante, y por eso el único que puede
    // fallar si `db.getAll(...)` no devolviera los snapshots en el orden
    // pedido: `sincronizacion.ts` empareja `participantes[i]` con
    // `usuarioSnaps[i]` por posición. Los dos están sin sincronizar y sólo se
    // diferencian por `activo`, así que una correspondencia cruzada mandaría a
    // cada uno a la lista del otro y ambas expectativas fallarían.
    const sesionId = `ses_${randomUUID()}`;
    await sembrarUsuario("uid_luis", "Luis Pérez", false);
    await sembrarUsuario("uid_ana", "Ana Ramírez", true);
    await sembrarSincronizacion(sesionId, {
      uid_luis: { confirmadoEn: null, ultimoAporteServidor: Timestamp.fromMillis(1000) },
      uid_ana: { confirmadoEn: null, ultimoAporteServidor: Timestamp.fromMillis(1000) },
    });

    const resultado = await verificarSincronizacion(db, sesionId, ["uid_luis", "uid_ana"]);

    expect(resultado.sinConfirmar).toEqual([{ uid: "uid_ana", nombre: "Ana Ramírez" }]);
    expect(resultado.excluidosPorInactivo).toEqual([{ uid: "uid_luis", nombre: "Luis Pérez" }]);
  });
});
