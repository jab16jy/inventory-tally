/**
 * LineaConteo — intersección (sesión × categoría), dato derivado (doc 03 §3, ADR-23).
 * Documento: `sesiones/{sesionId}/lineas/{categoriaId}` (doc 04 §3).
 *
 * `subtotal` NO vive aquí (doc 04 §3): es monetario y sólo puede leerlo el
 * administrador, por eso se movió al documento `resumen`.
 *
 * `porArea` es el desglose de `cantidadTotal` por `areaId` (ADR-23),
 * mantenido por `onAporteEscrito` y `reconciliarLineas`.
 */
export interface LineaConteo {
  readonly categoriaId: string;
  readonly valorUnitario: number;
  readonly etiqueta: string;
  readonly porArea: Readonly<Record<string /* areaId */, number>>;
  readonly cantidadTotal: number;
  readonly numAportantes: number;
  readonly versiones: Readonly<Record<string, number>>;
  readonly actualizadaEn: Date;
  readonly actualizadaPor: string;
  /** Unidades ya agregadas por claveAporte ({uid}__{areaId}) — la base contra la que `onAporteEscrito`
   *  calcula su delta (D2) y que `reconciliarLineas` reescribe entera. Es la
   *  única atribución por persona/área que llega por el listener de `lineas`, sin
   *  fan-out a `aportes`: por eso el desglose por cajero funciona offline.
   *  Opcional: `abrirSesion` siembra líneas en cero sin este mapa. */
  readonly aplicados?: Readonly<Record<string, number>>;
  /** Copia de `CategoriaValor.areaIds` congelada al sembrar la línea (D-1,
   *  docs/diseno/etapa-3-ui.md), NUNCA releída después: si el admin reasigna
   *  áreas con la sesión abierta, la línea conserva las viejas hasta el
   *  siguiente `reconciliarLineas` (misma congelación que ya aplica I-7 a
   *  `valorUnitario`). Ausente o vacío significa "sin área" — visible para
   *  todos los contadores (D-2). No confundir con `porArea`: éste es lo
   *  ASIGNADO por el catálogo, `porArea` es lo YA CONTADO. */
  readonly areaIds?: readonly string[];
}
