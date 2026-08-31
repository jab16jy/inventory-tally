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
