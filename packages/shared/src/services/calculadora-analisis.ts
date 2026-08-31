import type { LineaConteo } from "../models/linea-conteo.js";
import { subtotal, type LineaSumable } from "./calculadora.js";

/**
 * Calculadora de análisis — porcentajes para los dashboards F4/F5
 * (docs/plan-panel-administrador.md §5, fase F4).
 *
 * Funciones puras, sin dependencias de dominio: reciben números ya
 * calculados (dinero, unidades) y devuelven porcentajes listos para pintar.
 */

/** Margen para compensar el error de representación binaria de un float
 * (p. ej. 25.0 almacenado como 24.999999999998) antes de truncar. */
const EPSILON = 1e-9;

/**
 * participacion(parte, total) — la cuota de `parte` sobre `total`, en
 * porcentaje. Devuelve 0 cuando `total` es 0 (nunca `NaN` ni `Infinity`):
 * una división por cero aquí se pintaría como "NaN%" en un dashboard de
 * dinero.
 */
export function participacion(parte: number, total: number): number {
  if (total === 0) return 0;
  return (parte / total) * 100;
}

/**
 * distribuirRedondeo(valores) — porcentaje de cada valor sobre la suma del
 * arreglo, redondeado a 1 decimal, de forma que **leídos como números de un
 * decimal (en décimas enteras) suman exactamente 100.0** (salvo que todos
 * los valores sean 0, ver abajo).
 *
 * Redondear cada porcentaje por separado no lo garantiza: 1/3, 1/3, 1/3
 * redondean a 33.3 cada uno y suman 99.9; 10/31 × 3 más 1/31 redondean a
 * 32.3 × 3 + 3.2 y suman 100.1 (ambos casos, verificados en
 * calculadora-analisis.test.ts). Se usa el método del mayor resto: se trunca
 * cada porcentaje a 1 decimal y el sobrante (la diferencia hasta 100.0, en
 * décimas) se reparte de a una décima entre los valores con mayor resto
 * fraccionario. Empate en el resto → gana el índice más bajo, siempre: un
 * criterio inestable haría parpadear la UI entre renders con los mismos datos.
 *
 * IMPORTANTE para quien consuma el resultado: el invariante exacto vive en
 * las décimas enteras (`Math.round(p * 10)` de cada valor suma 1000), NO en
 * la suma en coma flotante de los números que devuelve la función. Sumar los
 * floats devueltos con `reduce((t, p) => t + p, 0)` puede dar
 * `99.99999999999999` en vez de `100` (p. ej. `33.4 + 33.3 + 33.3`) por el
 * mismo motivo que `0.1 + 0.2 !== 0.3` en JS — no es un bug de este método,
 * es representación binaria. Si necesitas verificar la suma, compara
 * décimas, no floats.
 *
 * Si la suma de `valores` es 0 no hay cuota que repartir (misma razón que
 * `participacion`): devuelve un arreglo de ceros, sin lanzar.
 */
export function distribuirRedondeo(valores: readonly number[]): number[] {
  if (valores.length === 0) return [];

  const total = valores.reduce((suma, v) => suma + v, 0);
  if (total === 0) return valores.map(() => 0);

  // Se trabaja en décimas de porcentaje (enteras) para que "sumar 100.0"
  // sea "sumar 1000" en enteros, sin arrastrar error de coma flotante.
  const decimasExactas = valores.map((v) => (v / total) * 1000);
  const decimasBase = decimasExactas.map((d) => Math.floor(d + EPSILON));
  const restos = decimasExactas.map((d, i) => d - decimasBase[i]!);

  const sobrante = 1000 - decimasBase.reduce((suma, d) => suma + d, 0);
  const ordenPorResto = valores
    .map((_, indice) => indice)
    // Array.prototype.sort es estable (ES2019): en un empate de resto,
    // conserva el orden original → gana el índice más bajo.
    .sort((a, b) => restos[b]! - restos[a]!);

  for (let i = 0; i < sobrante; i++) {
    const indice = ordenPorResto[i]!;
    decimasBase[indice] = decimasBase[indice]! + 1;
  }

  return decimasBase.map((d) => d / 10);
}

/**
 * extremosPorSubtotal(líneas) — la línea de mayor y de menor subtotal
 * (doc 10 §3), para destacar "categoría más valiosa" / "menos valiosa" en el
 * dashboard.
 *
 * Sólo entran en la comparación las líneas realmente contadas
 * (`cantidadTotal > 0`): de lo contrario toda categoría sin contar empataría
 * en subtotal 0 y "menor" dejaría de señalar la existencia real más barata,
 * volviéndose ruido.
 *
 * Devuelve `null` cuando ninguna línea está contada: una sesión vacía no
 * tiene extremos, y fabricar una línea en cero convertiría en un hecho algo
 * que no lo es.
 *
 * Genérica en `T` para que quien llame reciba su propia línea de vuelta
 * (con `etiqueta` y cualquier otro campo intacto), sin inventar un DTO.
 *
 * Empate en subtotal → gana el índice más bajo, siempre (misma razón que
 * `distribuirRedondeo`: un criterio inestable haría parpadear la UI entre
 * renders con los mismos datos).
 */
export function extremosPorSubtotal<T extends LineaSumable>(
  lineas: readonly T[],
): { readonly mayor: T; readonly menor: T } | null {
  const contadas = lineas.filter((linea) => linea.cantidadTotal > 0);
  if (contadas.length === 0) return null;

  let mayor = contadas[0]!;
  let menor = contadas[0]!;
  for (let i = 1; i < contadas.length; i++) {
    const linea = contadas[i]!;
    // Comparación estricta: en empate se conserva el elegido primero (índice
    // más bajo), nunca se reemplaza.
    if (subtotal(linea) > subtotal(mayor)) mayor = linea;
    if (subtotal(linea) < subtotal(menor)) menor = linea;
  }
  return { mayor, menor };
}

/** Una porción de un gráfico de participación (dinero o unidades): una
 * etiqueta y su monto. */
export interface PorcionAnalisis {
  readonly etiqueta: string;
  readonly monto: number;
}

/**
 * agruparConOtros(porciones, máximo) — recorta una lista de porciones a lo
 * sumo `máximo` entradas, plegando la cola en una fila "Otros" al final
 * (doc 10 §5: pastel "top 6 + Otros", regla de legibilidad de ≤8 series).
 *
 * Descarta antes de agrupar las porciones en `monto === 0`: una porción en
 * cero no dibuja arco en el pastel y sólo agregaría una fila de leyenda
 * ilegible ("0,0 %"); producir un conjunto parte-a-todo legible es parte del
 * trabajo de esta función.
 *
 * Sólo pliega cuando eso efectivamente acorta la lista (`length > máximo`):
 * con `length <= máximo` devuelve todas ordenadas, sin fila "Otros" —
 * plegar 1 elemento dentro de "Otros" es estrictamente peor que nombrarlo.
 * Al plegar, el resultado tiene exactamente `máximo` entradas: `máximo - 1`
 * nombradas + "Otros".
 *
 * Empate en `monto` → gana el índice original más bajo (orden estable,
 * `Array.prototype.sort` es estable desde ES2019), misma razón anti-
 * parpadeo que `distribuirRedondeo`.
 */
export function agruparConOtros(
  porciones: readonly PorcionAnalisis[],
  maximo: number,
): PorcionAnalisis[] {
  // ponytail: sin una noción de "máximo" válida (< 1) no hay forma sensata
  // de recortar; devolver [] es más honesto que devolver basura.
  if (maximo < 1) return [];

  const conMonto = porciones.filter((p) => p.monto !== 0);
  const ordenadas = [...conMonto].sort((a, b) => b.monto - a.monto);

  if (ordenadas.length <= maximo) return ordenadas;

  const principales = ordenadas.slice(0, maximo - 1);
  const resto = ordenadas.slice(maximo - 1);
  const montoOtros = resto.reduce((total, p) => total + p.monto, 0);

  return [...principales, { etiqueta: "Otros", monto: montoOtros }];
}

// ── cadencia de conteo (ADR-20) ──
// El comparativo entre sucursales mide EJECUCIÓN, no tamaño: la señal es
// cuánto lleva una sucursal sin cerrar un conteo, juzgada contra su propia
// cadencia histórica y no contra una constante fija para toda la red.

const MS_POR_DIA = 24 * 60 * 60 * 1000;

/**
 * diasEntre(desde, hasta) — días *completos* transcurridos entre dos fechas.
 * Aritmética simple sobre milisegundos, sin librería de fechas: no hay zona
 * horaria que decidir, sólo la diferencia entre dos instantes.
 *
 * Trunca, no redondea: 1 día y 12 horas de diferencia da 1, no 2. Para
 * "días sin contar" (el uso previsto) redondear inflaría la mora de una
 * sucursal medio día antes de que el día realmente se complete — el mismo
 * criterio que separa "vencido hoy" de "vencido mañana" en cualquier plazo.
 */
export function diasEntre(desde: Date, hasta: Date): number {
  return Math.trunc((hasta.getTime() - desde.getTime()) / MS_POR_DIA);
}

function medianaDe(numeros: readonly number[]): number {
  const ordenados = [...numeros].sort((a, b) => a - b);
  const mitad = Math.floor(ordenados.length / 2);
  if (ordenados.length % 2 === 1) return ordenados[mitad]!;
  return (ordenados[mitad - 1]! + ordenados[mitad]!) / 2;
}

/**
 * medianaIntervaloDias(cierres) — la cadencia habitual de UNA sucursal: la
 * mediana de los días transcurridos entre cierres consecutivos.
 *
 * El repositorio entrega los cierres en orden `cerradaEn` DESC (más
 * reciente primero); esta función no asume ningún orden y ordena por su
 * cuenta antes de calcular intervalos, para no heredar un bug si quien
 * llama cambia el orden de la consulta.
 *
 * Con menos de 2 cierres devuelve `null`: un único cierre (o ninguno) no
 * define un intervalo, y no hay cadencia histórica que una sucursal nueva
 * pueda incumplir todavía.
 *
 * Con un número par de intervalos, la mediana es el promedio de los dos
 * centrales (definición estándar de mediana).
 */
export function medianaIntervaloDias(cierres: readonly Date[]): number | null {
  if (cierres.length < 2) return null;

  const ordenados = [...cierres].sort((a, b) => a.getTime() - b.getTime());
  const intervalos: number[] = [];
  for (let i = 1; i < ordenados.length; i++) {
    intervalos.push(diasEntre(ordenados[i - 1]!, ordenados[i]!));
  }
  return medianaDe(intervalos);
}

/**
 * estaAtrasada(diasSinContar, mediana) — ¿esta sucursal va atrasada según
 * SU propia cadencia histórica? Sin umbral fijo: se compara contra
 * `medianaIntervaloDias` de la misma sucursal, así una que cuenta quincenal
 * y otra mensual se juzgan cada una contra lo suyo.
 *
 * `mediana === null` (sin historial) siempre da `false`: no se puede
 * incumplir una cadencia que todavía no existe, y marcarla como atrasada
 * penalizaría a una sucursal nueva sin datos para juzgarla.
 *
 * Estrictamente mayor (`>`), no `>=`: estar exactamente en la mediana es
 * cumplir el ritmo habitual (la mitad de sus cierres históricos tardaron
 * eso o más), no incumplirlo. La mora empieza en el primer día que excede
 * lo habitual.
 */
export function estaAtrasada(diasSinContar: number, mediana: number | null): boolean {
  if (mediana === null) return false;
  return diasSinContar > mediana;
}

// ── agrupación por dimensión (F6, tablas del panel) ──

/** Las tres formas de partir el mismo conjunto de líneas en el panel: por
 * categoría (una fila por línea), por área física, o por cajero (repartiendo
 * cada línea entre quienes aportaron). */
export type DimensionAnalisis = "categoria" | "cajero" | "area";

/** Proyección mínima de una línea para agrupar — mismo criterio que
 *  `LineaSumable` de calculadora.ts: el helper no pide una `LineaConteo`
 *  entera para que los tests no tengan que fabricar campos irrelevantes. */
export type LineaAgrupable = Pick<
  LineaConteo,
  "categoriaId" | "etiqueta" | "area" | "cantidadTotal" | "valorUnitario" | "aplicados"
>;

/** Una fila de una tabla agrupada por dimensión: `clave` identifica la fila
 * (categoriaId, nombre de área o uid de cajero) y `etiqueta` es lo que se
 * pinta en pantalla. */
export interface FilaDimension {
  readonly clave: string;
  readonly etiqueta: string;
  readonly unidades: number;
  readonly valor: number;
}

/** Rótulo para línea sin área asignada — el mismo exacto que usa
 * `abrirSesion` en producción (`packages/functions/src/callables/abrir-sesion.ts`)
 * cuando la categoría no tiene `areaId`, para que una línea con área vacía
 * caiga en la misma fila que las que ya nacieron sin área. */
const SIN_AREA = "Sin área";

/** Clave de la fila que absorbe unidades sin atribuir a ningún cajero. */
const SIN_ATRIBUIR = "__sin_atribuir";

/**
 * agruparPorDimension(líneas, dimensión, nombres) — parte las líneas de una
 * sesión en filas de tabla según `dimensión` (doc 10, tablas del panel F6).
 *
 * - `"categoria"`: una fila por línea (clave = categoriaId).
 * - `"area"`: agrupa por `linea.area`; área vacía cae en `"Sin área"`, el
 *   mismo rótulo que ya usa `abrir-sesion.ts` en producción, para que una
 *   línea con área vacía no invente una segunda categoría "vacía" distinta
 *   de la que ya existe.
 * - `"cajero"`: reparte cada línea entre los uid de `linea.aplicados`,
 *   proporcional a las unidades que cada uno aportó (`unidades × valorUnitario`).
 *   **Nunca** se reparte `subtotal(linea) / numAportantes`: dividir el
 *   dinero en partes iguales entre personas que aportaron cantidades
 *   distintas inventa una atribución que el dato no dice. Un uid sin nombre
 *   en `nombres` muestra el propio uid (nunca `""`).
 *
 *   Si `cantidadTotal - Σ aplicados !== 0`, el resto se suma a una fila
 *   `"Sin atribuir"`. // ponytail: en producción este resto siempre es 0 —
 *   el trigger `onAporteEscrito` escribe `cantidadTotal` y `aplicados` en la
 *   misma transacción y `reconciliarLineas` los reescribe juntos — pero la
 *   fila existe como techo defensivo: si algún día divergen, el total de la
 *   tabla nunca debe mostrar menos dinero del que hay.
 *
 * Si dos líneas caen en la misma clave, gana la etiqueta de la primera vista
 * (mismo criterio que "no reinventar un dato que ya existe").
 *
 * Orden de salida: `valor` descendente; empate → `etiqueta` ascendente con
 * `localeCompare`. Mismo criterio anti-parpadeo que documenta
 * `distribuirRedondeo` en este archivo: un desempate inestable haría
 * parpadear la UI entre renders con los mismos datos.
 */
export function agruparPorDimension(
  lineas: readonly LineaAgrupable[],
  dimension: DimensionAnalisis,
  nombres: ReadonlyMap<string, string> = new Map(),
): FilaDimension[] {
  const filas = new Map<string, { etiqueta: string; unidades: number; valor: number }>();

  function acumular(clave: string, etiqueta: string, unidades: number, valor: number): void {
    const existente = filas.get(clave);
    if (existente) {
      existente.unidades += unidades;
      existente.valor += valor;
    } else {
      filas.set(clave, { etiqueta, unidades, valor });
    }
  }

  for (const linea of lineas) {
    if (dimension === "categoria") {
      acumular(linea.categoriaId, linea.etiqueta, linea.cantidadTotal, subtotal(linea));
    } else if (dimension === "area") {
      const nombreArea = linea.area || SIN_AREA;
      acumular(nombreArea, nombreArea, linea.cantidadTotal, subtotal(linea));
    } else {
      const aplicados = linea.aplicados ?? {};
      let unidadesAplicadas = 0;
      for (const [uid, unidades] of Object.entries(aplicados)) {
        unidadesAplicadas += unidades;
        acumular(uid, nombres.get(uid) ?? uid, unidades, unidades * linea.valorUnitario);
      }
      const resto = linea.cantidadTotal - unidadesAplicadas;
      if (resto !== 0) {
        acumular(SIN_ATRIBUIR, "Sin atribuir", resto, resto * linea.valorUnitario);
      }
    }
  }

  return [...filas.entries()]
    .map(([clave, fila]) => ({ clave, ...fila }))
    .sort((a, b) => b.valor - a.valor || a.etiqueta.localeCompare(b.etiqueta));
}

/**
 * variacion(actual, anterior) — variación de `actual` frente a `anterior`,
 * en escala 0–100 (la misma que espera `porcentaje()` y que devuelve
 * `participacion`). `anterior === 0` devuelve `null`: crecer desde cero no
 * tiene porcentaje, y "+∞ %" en un dashboard de dinero es ruido, no
 * información.
 */
export function variacion(actual: number, anterior: number): number | null {
  if (anterior === 0) return null;
  return ((actual - anterior) / anterior) * 100;
}
