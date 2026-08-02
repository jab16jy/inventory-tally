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

/** subtotal(sesión, categoría) = cantidadTotal × valorUnitario (doc 03 §4). */
export function subtotal(linea: LineaConteo): number {
  return linea.cantidadTotal * linea.valorUnitario;
}

/** cantidadTotal(sesión, categoría) = Σ cantidad(aporte) ∀ cajero (doc 03 §4). */
export function cantidadTotalDesdeAportes(aportes: readonly Aporte[]): number {
  return aportes.reduce((total, aporte) => total + aporte.cantidad, 0);
}

/** Total de unidades de la sesión: suma de cantidadTotal de todas sus líneas. */
export function totalUnidadesSesion(lineas: readonly LineaConteo[]): number {
  return lineas.reduce((total, linea) => total + linea.cantidadTotal, 0);
}

/** Total monetario de la sesión: suma del subtotal de todas sus líneas. */
export function totalMonetarioSesion(lineas: readonly LineaConteo[]): number {
  return lineas.reduce((total, linea) => total + subtotal(linea), 0);
}
