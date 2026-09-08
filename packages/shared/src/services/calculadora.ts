import type { Aporte, Partida } from "../models/aporte.js";
import type { LineaConteo } from "../models/linea-conteo.js";

/**
 * Calculadora — funciones puras del dominio (doc 03 §4 y §7).
 *
 * Regla que sostiene todo el sistema: el cliente escribe aportes, el backend
 * deriva totales. El dinero se maneja siempre como entero en la unidad
 * mínima (nunca `double`), por lo que estas sumas son exactas: no hay
 * acumulación de error de coma flotante.
 */

/**
 * Proyección mínima de `LineaConteo` que necesitan estas sumas. Permite que
 * `packages/functions` pase una `QueryDocumentSnapshot` proyectada sin un
 * cast/mentira a `LineaConteo` completa (D-2). `LineaConteo` sigue
 * satisfaciendo el tipo, así que los llamadores y tests existentes no cambian.
 */
export type LineaSumable = Pick<LineaConteo, "cantidadTotal" | "valorUnitario">;

/** subtotal(sesión, categoría) = cantidadTotal × valorUnitario (doc 03 §4). */
export function subtotal(linea: LineaSumable): number {
  return linea.cantidadTotal * linea.valorUnitario;
}

/** cantidadTotal(sesión, categoría) = Σ cantidad(aporte) ∀ cajero (doc 03 §4). */
export function cantidadTotalDesdeAportes(aportes: readonly Aporte[]): number {
  return aportes.reduce((total, aporte) => total + aporte.cantidad, 0);
}

/** Total de unidades de la sesión: suma de cantidadTotal de todas sus líneas. */
export function totalUnidadesSesion(lineas: readonly LineaSumable[]): number {
  return lineas.reduce((total, linea) => total + linea.cantidadTotal, 0);
}

/** Total monetario de la sesión: suma del subtotal de todas sus líneas. */
export function totalMonetarioSesion(lineas: readonly LineaSumable[]): number {
  return lineas.reduce((total, linea) => total + subtotal(linea), 0);
}

export type LineaAgrupablePorArea = Pick<LineaConteo, "porArea">;

/** Unidades contadas por área: suma cantidad agrupando por areaId leyendo linea.porArea (ADR-23). */
export function totalPorArea(
  lineas: readonly Pick<LineaConteo, "porArea">[],
): ReadonlyArray<{ areaId: string; cantidad: number }> {
  const totales = new Map<string, number>();
  for (const linea of lineas) {
    for (const [areaId, cantidad] of Object.entries(linea.porArea ?? {})) {
      totales.set(areaId, (totales.get(areaId) ?? 0) + cantidad);
    }
  }
  return [...totales.entries()]
    .map(([areaId, cantidad]) => ({ areaId, cantidad }))
    .sort((a, b) => a.areaId.localeCompare(b.areaId));
}

/** Suma de cantidad de las tandas agrupadas de un aporte (ADR-24); sin tandas da 0. */
export function totalPartidas(partidas: readonly Partida[] | undefined): number {
  return (partidas ?? []).reduce((total, partida) => total + partida.cantidad, 0);
}

/**
 * Quita del ledger la tanda con ese `id` (ADR-24 — "mandar a la papelera").
 * Idempotente: un id que no existe deja el array intacto y `restado: 0`, para
 * que un doble toque o un reintento offline no reste dos veces.
 */
export function quitarPartida(
  partidas: readonly Partida[],
  id: string,
): { readonly partidas: readonly Partida[]; readonly restado: number } {
  const partida = partidas.find((p) => p.id === id);
  if (partida === undefined) return { partidas, restado: 0 };
  return { partidas: partidas.filter((p) => p.id !== id), restado: partida.cantidad };
}
