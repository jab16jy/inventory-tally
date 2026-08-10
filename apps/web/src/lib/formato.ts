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

// `timeZone` fijo, no el del navegador: Colombia no tiene horario de verano
// (UTC-5 constante), así que fijarlo es tan correcto como dejarlo implícito
// y además hace el formato determinista sin importar dónde corra el cliente
// o el test (docs/plan-panel-administrador.md §5, fase F2).
const FORMATO_FECHA = new Intl.DateTimeFormat("es-CO", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "America/Bogota",
});

// Un decimal fijo: es la misma escala de décimas que garantiza el invariante
// de `distribuirRedondeo` (packages/shared/services/calculadora-analisis.ts),
// así que el texto pintado nunca lleva más precisión de la que ese reparto
// promete.
const FORMATO_PORCENTAJE = new Intl.NumberFormat("es-CO", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

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

/** Fecha y hora corta es-CO, hora de Bogotá — `ultimoAccesoEn` de un cajero,
 *  eventos de auditoría, cierres de sesión. */
export function fecha(valor: Date): string {
  return FORMATO_FECHA.format(valor);
}

/** Porcentaje con un decimal fijo es-CO — participación de sucursal en el
 *  comparativo (docs/plan-panel-administrador.md §5, fase F4). Espera un
 *  valor ya en escala 0–100 (la salida de `distribuirRedondeo`), no una
 *  fracción 0–1. */
export function porcentaje(valor: number): string {
  return `${FORMATO_PORCENTAJE.format(valor)}%`;
}

const FORMATO_DATOS = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 1 });

/** Consumo de datos aproximado — issue #20 item 2 (doc 11 §24, fila "Datos
 *  móviles": "consumo visible"). KB o MB, el que quede más legible. El valor
 *  de entrada YA es una estimación (ver `useConsumoDatos.ts`), no una medida
 *  exacta: no hay forma de leer bytes reales del canal WebSocket de
 *  Firestore desde el cliente. */
export function datos(bytes: number): string {
  const kb = bytes / 1024;
  if (kb < 1024) return `${FORMATO_DATOS.format(kb)} KB`;
  return `${FORMATO_DATOS.format(kb / 1024)} MB`;
}
