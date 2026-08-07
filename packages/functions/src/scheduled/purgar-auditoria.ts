import { onSchedule } from "firebase-functions/v2/scheduler";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import { registrarAuditoria } from "../lib/auditoria.js";

const LOTE_MAXIMO = 400; // límite de 500 operaciones por batch (doc 02 §6)
const MESES_EN_CALIENTE = 12; // doc 02 §7

/**
 * purgarAuditoriaImpl — núcleo del cron mensual (doc 08 §4). Aplica la
 * política de retención de doc 02 §7: `auditoria` conserva 12 meses en
 * caliente. Sin esto la colección crece indefinidamente (≈64.800 eventos al
 * año) y el sistema nunca se estabiliza en el ~4 % de cuota que doc 02 §5
 * promete.
 *
 * NO exporta. El archivo histórico ya existe y es la exportación diaria a
 * Cloud Storage de doc 12 §5 (RPO 24 h); un volcado propio dentro del cron
 * duplicaría un export gestionado que ya corre.
 *
 * ponytail: sin try/catch por lote, a diferencia de sus dos hermanos. Ahí el
 * aislamiento protege elementos heterogéneos entre sí (una sesión corrupta no
 * debe bloquear las demás); aquí la consulta es homogénea y la operación es
 * idempotente por construcción — si una corrida falla a medias, la del mes
 * siguiente vuelve a consultar por `ocurridoEn` y recoge lo que quedó.
 */
export async function purgarAuditoriaImpl(db: Firestore): Promise<void> {
  const corte = new Date();
  corte.setUTCMonth(corte.getUTCMonth() - MESES_EN_CALIENTE);

  // `ocurridoEn` con un rango de campo único se resuelve con el índice
  // automático de Firestore; `firestore.indexes.json` no lo deshabilita
  // (`fieldOverrides: []`), así que no hace falta índice compuesto.
  const consulta = db.collection("auditoria").where("ocurridoEn", "<", corte).limit(LOTE_MAXIMO);

  let eliminados = 0;
  let antiguos = await consulta.get();
  while (!antiguos.empty) {
    const lote = db.batch();
    for (const evento of antiguos.docs) {
      lote.delete(evento.ref);
    }
    await lote.commit();
    eliminados += antiguos.size;
    antiguos = await consulta.get();
  }

  if (eliminados === 0) return;

  // ponytail: un solo evento resumen por corrida, no uno por documento
  // borrado — auditar la purga evento a evento reescribiría la colección que
  // se acaba de vaciar. Este evento será purgado a su vez dentro de 12 meses;
  // la traza de largo plazo vive en Cloud Logging y en el export diario.
  await db.runTransaction(async (tx) => {
    registrarAuditoria(tx, db, {
      tipo: "AUDITORIA_PURGADA",
      eliminados,
      corte,
      origen: "cron",
    });
  });
}

export const purgarAuditoria = onSchedule(
  // Sintaxis App Engine cron. Las 03:00 del lunes ya son de
  // `reconciliarLineas`; 04:00 evita el solape.
  { schedule: "1 of month 04:00", region: "us-central1" },
  async () => {
    await purgarAuditoriaImpl(getFirestore());
  },
);
