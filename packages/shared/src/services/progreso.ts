import type { LineaConteo } from "../models/linea-conteo.js";

/**
 * Progreso del cajero (doc 10 §2 — dashboard "¿cuánto llevo y qué me
 * falta?"). Todo sale de `LineaConteo.versiones`, que la pantalla de conteo
 * ya tiene suscrita: cero lecturas nuevas.
 */

/**
 * ¿El cajero (uid) todavía no le ha puesto versión propia a esta línea?
 * Mismo criterio de confirmación que `aporteConfirmado` en sincronizacion.ts,
 * pero sin necesitar el `Aporte` — sólo la presencia de la entrada alcanza,
 * porque el trigger del backend es quien la escribe. Es la única fuente de
 * verdad para la barra de progreso, el filtro "sólo pendientes" y el avance
 * automático del teclado: los tres tienen que estar de acuerdo en qué
 * cuenta como "ya contado", o el cajero ve números que no cuadran entre sí.
 */
export function estaPendiente(linea: LineaConteo, uid: string): boolean {
  return linea.versiones[uid] === undefined;
}

/**
 * Primera categoría pendiente después de `actual`, en el orden real de
 * `lineas`, con vuelta al principio si hace falta. Excluye `actual` siempre
 * — incluida ella misma si su versión no alcanzó todavía al servidor
 * (retraso normal del trigger, doc 07 §8): sin la exclusión explícita, el
 * teclado numérico reabriría la categoría que el cajero acaba de guardar en
 * vez de avanzar a la siguiente.
 */
export function siguientePendiente(
  lineas: readonly LineaConteo[],
  uid: string,
  actual: string,
): string | null {
  const idx = lineas.findIndex((l) => l.categoriaId === actual);
  const enOrden = idx === -1 ? lineas : [...lineas.slice(idx + 1), ...lineas.slice(0, idx)];
  return (
    enOrden.find((l) => l.categoriaId !== actual && estaPendiente(l, uid))?.categoriaId ?? null
  );
}
