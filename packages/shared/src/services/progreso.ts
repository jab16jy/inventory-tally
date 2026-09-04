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
 *
 * Issue #83: `Aporte` cambió su clave de `{uid}` a `{uid}__{areaId}` (ADR-23)
 * — un cajero que aportó puede tener su versión bajo `uid` (dato viejo) o
 * bajo `{uid}__{areaId}` (dato nuevo). Mismo criterio de fallback que
 * `aporteConfirmado` en sincronizacion.ts: primero la clave exacta, luego el
 * dato legado bajo `uid` pelado.
 *
 * `areaActiva` es opcional: con ella, sólo cuenta el aporte de ESA área (más
 * el legado) — lo que necesitan la barra de progreso, el filtro "sólo
 * pendientes" y el avance automático en `ConteoScreen`, para no marcar
 * "ya contado" algo aportado desde otra área (RDD ronda 4, review-reliability).
 * Sin ella, cuenta cualquier área — lo que necesita `FinalizarScreen` para el
 * resumen de fin de sesión, que sí es cruce de todas las áreas del cajero.
 */
export function estaPendiente(linea: LineaConteo, uid: string, areaActiva?: string): boolean {
  if (linea.versiones[uid] !== undefined) return false;
  if (areaActiva !== undefined) return linea.versiones[`${uid}__${areaActiva}`] === undefined;
  return !Object.keys(linea.versiones).some((clave) => clave.startsWith(`${uid}__`));
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
  areaActiva?: string,
): string | null {
  const idx = lineas.findIndex((l) => l.categoriaId === actual);
  const enOrden = idx === -1 ? lineas : [...lineas.slice(idx + 1), ...lineas.slice(0, idx)];
  return (
    enOrden.find((l) => l.categoriaId !== actual && estaPendiente(l, uid, areaActiva))
      ?.categoriaId ?? null
  );
}
