// apps/web/src/lib/persistencia-monitor.ts
//
// Hallazgo verificado (no una suposición): en @firebase/firestore
// (firestore_client.ts → __PRIVATE_ensureOfflineComponents), si IndexedDB
// falla con un error recuperable (cuota excedida, FAILED_PRECONDITION /
// UNIMPLEMENTED, o INVALID_STATE de Firefox en modo privado), el SDK cae
// SILENCIOSAMENTE a caché en memoria y sólo hace `console.warn("Error using
// user provided cache. Falling back to memory cache: " + error)`. Sin esto,
// el cajero cuenta creyendo que hay persistencia offline, cierra la pestaña
// y sus aportes nunca existieron (doc 06 §3). Este módulo convierte ese
// warning en estado observable por la UI (banner), no en texto de consola.
// Exportado para el test canario (persistencia-monitor.test.ts) que verifica
// que este patrón sigue coincidiendo con el bundle REAL instalado del SDK.
export const PATRON_DEGRADACION = /falling back to memory cache/i;

export interface MonitorPersistencia {
  estaDegradada(): boolean;
  subscribe(onChange: (degradada: boolean) => void): () => void;
}

export function instalarMonitorPersistencia(
  consola: Pick<Console, "warn"> = console,
): MonitorPersistencia {
  let degradada = false;
  const listeners = new Set<(degradada: boolean) => void>();
  const warnOriginal = consola.warn.bind(consola);

  consola.warn = (...args: unknown[]) => {
    warnOriginal(...args);
    if (!degradada && args.some((a) => typeof a === "string" && PATRON_DEGRADACION.test(a))) {
      degradada = true;
      listeners.forEach((cb) => cb(true));
    }
  };

  return {
    estaDegradada: () => degradada,
    subscribe(onChange) {
      listeners.add(onChange);
      return () => listeners.delete(onChange);
    },
  };
}
