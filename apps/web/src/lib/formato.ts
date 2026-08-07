// apps/web/src/lib/formato.ts (docs/plan-panel-administrador.md §5, fase F1)
//
// Único punto del repo con Intl.NumberFormat. Antes vivía sólo en
// `ui/primitivos/Deck.tsx:14` (unidades); el panel admin necesita además
// dinero, así que se centraliza aquí y Deck importa `numero` de vuelta —
// un formateador, no dos divergiendo con el tiempo.
const FORMATO_MONEDA = new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "COP",
  maximumFractionDigits: 0,
});

const FORMATO_NUMERO = new Intl.NumberFormat("es-CO");

/** Dinero en pesos colombianos. `valorEnteroCOP` ya es entero en la unidad
 *  mínima (doc 03 §4: el dinero nunca es `double`), así que no hay
 *  decimales que perder. */
export function moneda(valorEnteroCOP: number): string {
  return FORMATO_MONEDA.format(valorEnteroCOP);
}

/** Agrupación de miles es-CO sin símbolo — unidades, conteos. */
export function numero(n: number): string {
  return FORMATO_NUMERO.format(n);
}
