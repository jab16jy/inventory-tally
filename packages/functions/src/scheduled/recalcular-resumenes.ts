import { onSchedule } from "firebase-functions/v2/scheduler";
import { FieldValue, getFirestore, type Firestore } from "firebase-admin/firestore";
import { calcularResumen } from "../lib/resumen.js";

/**
 * recalcularResumenesImpl — núcleo del cron (doc 05 §5), separado de
 * `onSchedule` por el mismo motivo que `abrirSesionImpl`/`procesarAporteEscrito`:
 * se prueba contra el emulador de Firestore sin levantar el de Functions.
 *
 * D-1: compare-and-clear sobre `marcaAportes` en tres pasos. `dirty` NUNCA se
 * persiste en `false` a menos que el resumen escrito refleje todo aporte
 * registrado hasta ese instante — la alternativa (leer `lineas` dentro de la
 * transacción de escritura) bloquearía las ~60 líneas de la sesión durante
 * toda la ejecución, justo la contención que `dirty` existe para evitar
 * (`Transaction.get(query)` toma un lock pesimista sobre cada doc devuelto:
 * `node_modules/@google-cloud/firestore/types/firestore.d.ts:767`).
 *
 * ponytail: si el ritmo real de aportes alguna vez supera la ventana de
 * lectura de `lineas` de forma sostenida, el resultado es inanición (el
 * resumen queda `dirty` para siempre, nunca incorrecto) — techo aceptado hoy
 * (1–2 conteos/mes); camino de salida: opción (a) del design (tx que sólo
 * bloquea UNA sesión) o fragmentar `resumen` (doc 05 §5).
 */
export async function recalcularResumenesImpl(db: Firestore): Promise<void> {
  const sesionesAbiertas = await db.collection("sesiones").where("estado", "==", "abierta").get();

  for (const sesion of sesionesAbiertas.docs) {
    try {
      await recalcularUnaSesion(db, sesion.ref);
    } catch (error) {
      // ponytail: una sesión con datos corruptos (p.ej. una línea sin
      // `valorUnitario`, que I-7 nunca debería permitir pero que un cliente
      // desincronizado sí podría producir) no debe bloquear el recálculo de
      // TODAS las demás sesiones abiertas — "error handling que evita
      // pérdida de conteos" (AGENTS.md §1). No se escribió nada para esta
      // sesión, así que `dirty` sigue `true` y el próximo ciclo reintenta.
      console.error(`recalcularResumenes: fallo en sesión ${sesion.id}`, error);
    }
  }
}

async function recalcularUnaSesion(
  db: Firestore,
  sesionRef: FirebaseFirestore.DocumentReference,
): Promise<void> {
  const resumenRef = sesionRef.collection("resumen").doc("actual");

  // Paso 1: capturar M. Sin esto, no hay nada que comparar en el paso 3.
  const resumenAntes = await resumenRef.get();
  if (!resumenAntes.get("dirty")) return; // doc 05 §5: costo de sólo-lectura
  const marca = (resumenAntes.get("marcaAportes") as number | undefined) ?? 0;

  // Paso 2: leer `lineas` FUERA de cualquier transacción. Un solo `.get()`
  // ya es una instantánea consistente en un momento; una tx de sólo lectura
  // no añade nada aquí y sí tomaría el lock que este diseño evita.
  const lineasConConteo = await sesionRef.collection("lineas").where("cantidadTotal", ">", 0).get();
  const resumenCalculado = calcularResumen(lineasConConteo.docs);

  // Paso 3: comparar-y-limpiar. Si `marcaAportes` cambió entre el paso 1 y
  // aquí, algún aporte tocó `lineas` fuera de la ventana leída en el paso 2 —
  // no se escribe nada y `dirty` sigue `true` para el próximo ciclo.
  await db.runTransaction(async (tx) => {
    const resumenActual = await tx.get(resumenRef);
    const marcaActual = (resumenActual.get("marcaAportes") as number | undefined) ?? 0;
    if (marcaActual !== marca) return;

    // `set` sin `merge`: `resumen` es 100% derivado, y una categoría cuyo
    // `cantidadTotal` volvió a 0 no debe dejar una entrada de `porCategoria`
    // fantasma (D-1).
    tx.set(resumenRef, {
      ...resumenCalculado,
      recalculadoEn: FieldValue.serverTimestamp(),
      dirty: false,
      marcaAportes: marca,
    });
  });
}

export const recalcularResumenes = onSchedule(
  // OQ-1: Cloud Scheduler no acepta gránulo menor a un minuto (ni cron Unix
  // ni sintaxis App Engine bajan de minutos); "every 30 seconds" no es
  // declarable. D-1 es correcto sea cual sea la cadencia.
  { schedule: "every 1 minutes", region: "us-central1" },
  async () => {
    await recalcularResumenesImpl(getFirestore());
  },
);
