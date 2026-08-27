import type { Aporte } from "../models/aporte.js";
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

export type LineaAgrupablePorArea = Pick<LineaConteo, "area" | "cantidadTotal">;

/** Unidades contadas por área: suma cantidadTotal agrupando por LineaConteo.area. */
export function totalPorArea(
  lineas: readonly LineaAgrupablePorArea[],
): ReadonlyArray<{ area: string; cantidad: number }> {
  const totales = new Map<string, number>();
  for (const linea of lineas) {
    totales.set(linea.area, (totales.get(linea.area) ?? 0) + linea.cantidadTotal);
  }
  return [...totales.entries()]
    .map(([area, cantidad]) => ({ area, cantidad }))
    .sort((a, b) => a.area.localeCompare(b.area));
}
