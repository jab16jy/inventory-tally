// Pruebas contra el emulador de Firestore (doc 02 §7: `auditoria` conserva 12
// meses en caliente). Se prueba `purgarAuditoriaImpl` directamente, misma
// decisión que el resto del paquete.
//
// El emulador es una base compartida que nunca se resetea y `vitest.config.ts`
// fija `fileParallelism: false`, así que cada caso etiqueta sus eventos con una
// `corrida` única y filtra por ella — contar la colección entera mezclaría
// eventos escritos por los otros archivos de test.
import { randomUUID } from "node:crypto";
import { getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { describe, expect, it } from "vitest";
import { purgarAuditoriaImpl } from "../../src/scheduled/purgar-auditoria.js";

if (getApps().length === 0) {
  initializeApp({ projectId: "demo-conteo-eficiente" });
}
const db = getFirestore();

function haceMeses(meses: number): Date {
  const fecha = new Date();
  fecha.setUTCMonth(fecha.getUTCMonth() - meses);
  return fecha;
}

async function sembrarEventos(
  corrida: string,
  cantidad: number,
  mesesAtras: number,
): Promise<void> {
  const ocurridoEn = haceMeses(mesesAtras);
  for (let i = 0; i < cantidad; i += 400) {
    const lote = db.batch();
    for (let j = i; j < Math.min(i + 400, cantidad); j++) {
      lote.set(db.collection("auditoria").doc(), {
        tipo: "SESION_ABIERTA",
        corrida,
        ocurridoEn,
      });
    }
    await lote.commit();
  }
}

async function eventosDe(corrida: string) {
  const snap = await db.collection("auditoria").where("corrida", "==", corrida).get();
  return snap.docs;
}

async function idsDePurgas(): Promise<Set<string>> {
  const snap = await db.collection("auditoria").where("tipo", "==", "AUDITORIA_PURGADA").get();
  return new Set(snap.docs.map((d) => d.id));
}

async function purgasNuevasDesde(idsAntes: Set<string>) {
  const snap = await db.collection("auditoria").where("tipo", "==", "AUDITORIA_PURGADA").get();
  return snap.docs.filter((d) => !idsAntes.has(d.id));
}

describe("purgarAuditoriaImpl", () => {
  it("evento de hace 13 meses se purga, uno de hace 11 meses en la misma corrida sobrevive", async () => {
    const viejo = randomUUID();
    const reciente = randomUUID();
    await sembrarEventos(viejo, 1, 13);
    await sembrarEventos(reciente, 1, 11);

    await purgarAuditoriaImpl(db);

    // El par discrimina el corte de 12 meses: con el corte roto en cualquier
    // dirección, uno de los dos lados falla.
    expect(await eventosDe(viejo)).toHaveLength(0);
    expect(await eventosDe(reciente)).toHaveLength(1);
  });

  it("401 eventos antiguos se purgan en varios lotes, no queda ninguno", async () => {
    // 401 > LOTE_MAXIMO a propósito: es el único caso que puede fallar si el
    // bucle de lotes no itera. Con una sola pasada quedaría exactamente 1.
    const corrida = randomUUID();
    await sembrarEventos(corrida, 401, 13);

    await purgarAuditoriaImpl(db);

    expect(await eventosDe(corrida)).toHaveLength(0);
  });

  it("la purga audita AUDITORIA_PURGADA con el número exacto de eliminados", async () => {
    // Drena los restos de los casos anteriores para que `eliminados` cuente
    // sólo lo que este caso siembra.
    await purgarAuditoriaImpl(db);
    const idsAntes = await idsDePurgas();

    await sembrarEventos(randomUUID(), 3, 13);
    await purgarAuditoriaImpl(db);

    const nuevas = await purgasNuevasDesde(idsAntes);
    expect(nuevas).toHaveLength(1);
    expect(nuevas[0]?.get("eliminados")).toBe(3);
  });

  it("sin eventos antiguos no borra ni audita (no-op)", async () => {
    await purgarAuditoriaImpl(db);
    const idsAntes = await idsDePurgas();

    await purgarAuditoriaImpl(db);

    expect(await purgasNuevasDesde(idsAntes)).toHaveLength(0);
  });
});
