import { onSchedule } from "firebase-functions/v2/scheduler";
import { FieldValue, getFirestore, type Firestore } from "firebase-admin/firestore";
import { cantidadTotalDesdeAportes } from "@conteo/shared/services/calculadora.js";
import type { Aporte } from "@conteo/shared/models/aporte.js";
import { registrarAuditoria } from "../lib/auditoria.js";

/**
 * reconciliarLineasImpl — núcleo del cron semanal (doc 08 §4, D-5). Los
 * `aportes` son la fuente de verdad; una `linea.cantidadTotal` que no
 * coincide con su suma indica un trigger fallido. Aislamiento por línea
 * (mismo motivo que `recalcularResumenesImpl`): una línea corrupta no debe
 * bloquear la reconciliación de las demás.
 */
export async function reconciliarLineasImpl(db: Firestore): Promise<void> {
  const sesionesAbiertas = await db.collection("sesiones").where("estado", "==", "abierta").get();

  for (const sesion of sesionesAbiertas.docs) {
    const lineas = await sesion.ref.collection("lineas").get();
    for (const linea of lineas.docs) {
      try {
        await reconciliarUnaLinea(db, sesion.ref, linea.ref);
      } catch (error) {
        console.error(`reconciliarLineas: fallo en sesión ${sesion.id} línea ${linea.id}`, error);
      }
    }
  }
}

async function reconciliarUnaLinea(
  db: Firestore,
  sesionRef: FirebaseFirestore.DocumentReference,
  lineaRef: FirebaseFirestore.DocumentReference,
): Promise<void> {
  const resumenRef = sesionRef.collection("resumen").doc("actual");
  const aportesRef = lineaRef.collection("aportes");

  await db.runTransaction(async (tx) => {
    // TOCTOU: la consulta externa es sólo una instantánea; la sesión pudo
    // cerrarse entre ese `.get()` y esta transacción (D-5, mismo guardia I-4
    // que el trigger).
    const [sesion, linea, aportesSnap] = await Promise.all([
      tx.get(sesionRef),
      tx.get(lineaRef),
      tx.get(aportesRef),
    ]);
    if (sesion.get("estado") !== "abierta") return;

    const aplicados: Record<string, number> = {};
    const versiones: Record<string, number> = {};
    const porArea: Record<string, number> = {};
    for (const aporte of aportesSnap.docs) {
      const cant = (aporte.get("cantidad") as number | undefined) ?? 0;
      aplicados[aporte.id] = cant;
      versiones[aporte.id] = (aporte.get("version") as number | undefined) ?? 0;
      const areaId = aporte.get("areaId") as string | undefined;
      if (areaId) {
        porArea[areaId] = (porArea[areaId] ?? 0) + cant;
      }
    }
    const esperado = cantidadTotalDesdeAportes(aportesSnap.docs.map((d) => d.data() as Aporte));
    const cantidadAnterior = (linea.get("cantidadTotal") as number | undefined) ?? 0;
    if (esperado === cantidadAnterior) return; // idempotencia: nada que corregir

    // `tx.update` (reemplazo TOTAL), no `set({merge:true})`: el trigger
    // calcula su delta contra `aplicados[claveAporte]` (on-aporte-escrito.ts), así
    // que corregir sólo `cantidadTotal` deja un baseline fantasma — el
    // siguiente aporte de esa clave volvería a corromper el total. `merge`
    // además dejaría vivas claves sin aporte real.
    tx.update(lineaRef, {
      cantidadTotal: esperado,
      aplicados,
      versiones,
      porArea,
      numAportantes: aportesSnap.size,
      actualizadaEn: FieldValue.serverTimestamp(),
      actualizadaPor: "reconciliacion",
    });
    tx.update(sesionRef, { totalUnidades: FieldValue.increment(esperado - cantidadAnterior) });
    // I-M: re-marcar el resumen en la misma transacción que muta `lineas`,
    // para que el compare-and-clear de recalcularResumenes (D-1) recoja esto.
    tx.set(resumenRef, { dirty: true, marcaAportes: FieldValue.increment(1) }, { merge: true });

    registrarAuditoria(tx, db, {
      tipo: "RECONCILIACION",
      sesionId: sesionRef.id,
      sucursalId: sesion.get("sucursalId") as string, // ticket #45: para el filtro del cajero
      categoriaId: lineaRef.id,
      cantidadAnterior,
      cantidadNueva: esperado,
      origen: "cron",
    });
  });
}

export const reconciliarLineas = onSchedule(
  { schedule: "every monday 03:00", region: "us-central1" },
  async () => {
    await reconciliarLineasImpl(getFirestore());
  },
);
