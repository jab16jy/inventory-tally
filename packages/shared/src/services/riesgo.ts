import type { LineaConteo } from "../models/linea-conteo.js";

/**
 * doc 10 §10, "Cantidad absurda por dedo torpe": confirmación SUAVE (nunca
 * bloqueo) cuando lo tecleado supera 10× el promedio de la categoría — el
 * cajero pudo contar bien, un anaquel real puede superar el promedio.
 */
const MULTIPLICADOR_RIESGO = 10;

/**
 * Promedio de unidades por aportante, con lo que YA trae `LineaConteo`
 * (`cantidadTotal`, `numAportantes`) — el backend no expone un campo
 * `promedio` propio (doc 04 §3), así que se deriva aquí. `0` sin aportantes
 * todavía: una categoría virgen no tiene línea base con la que comparar, y
 * `cantidadEsAbsurda` trata ese `0` como "nunca absurdo", no como "todo lo
 * supera".
 */
export function promedioCategoria(linea: LineaConteo): number {
  return linea.numAportantes > 0 ? linea.cantidadTotal / linea.numAportantes : 0;
}

/**
 * ¿La cantidad tecleada supera 10× el promedio? Recibe el promedio ya
 * calculado (no `LineaConteo`) para que la Hoja del teclado numérico —un
 * primitivo de UI— pueda aplicarlo sin acoplarse al modelo de dominio.
 */
export function cantidadEsAbsurda(cantidad: number, promedio: number): boolean {
  return promedio > 0 && cantidad > promedio * MULTIPLICADOR_RIESGO;
}
