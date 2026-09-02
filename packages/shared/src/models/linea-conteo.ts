/**
 * SIN_AREA — sentinel, no un área: el hueco que deja `abrirSesion` en el
 * campo `area` de una línea cuando su categoría no tenía `areaId` todavía.
 *
 * Deja de ser cosmético en cuanto existe `vincularArea` (capacidad de que un
 * contador vincule un área a una categoría durante su conteo): es la
 * condición de la invariante que permite re-etiquetar una línea viva sin
 * romper I-7 (ADR-21) — "la línea se actualiza sólo si su `area` vale
 * `SIN_AREA`". Los únicos escritores del campo `area` son `abrirSesion` (lo
 * siembra) y `vincularArea` (lo reemplaza una vez).
 */
export const SIN_AREA = "Sin área";

/**
 * LineaConteo — intersección (sesión × categoría), dato derivado (doc 03 §3).
 * Documento: `sesiones/{sesionId}/lineas/{categoriaId}` (doc 04 §3).
 *
 * `subtotal` NO vive aquí (doc 04 §3): es monetario y sólo puede leerlo el
 * administrador, por eso se movió al documento `resumen`.
 */
export interface LineaConteo {
  readonly categoriaId: string;
  readonly valorUnitario: number;
  readonly etiqueta: string;
  readonly area: string;
  /** true si `categoriasValor/{categoriaId}.areaId` ya estaba fijado por el
   *  admin al abrir la sesión — condición dura de ADR-22: esa línea queda
   *  congelada sin excepción y `reetiquetarLineaEnSesion` la rechaza. Con
   *  `false`, el cajero puede reetiquetar `area` tantas veces como quiera
   *  dentro de la misma sesión (ADR-21/ADR-22). */
  readonly areaFijaPorAdmin: boolean;
  readonly cantidadTotal: number;
  readonly numAportantes: number;
  readonly versiones: Readonly<Record<string, number>>;
  readonly actualizadaEn: Date;
  readonly actualizadaPor: string;
  /** Unidades ya agregadas por uid — la base contra la que `onAporteEscrito`
   *  calcula su delta (D2) y que `reconciliarLineas` reescribe entera. Es la
   *  única atribución por persona que llega por el listener de `lineas`, sin
   *  fan-out a `aportes`: por eso el desglose por cajero funciona offline.
   *  Opcional: `abrirSesion` siembra líneas en cero sin este mapa. */
  readonly aplicados?: Readonly<Record<string, number>>;
}
