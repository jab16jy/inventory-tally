/**
 * Historico — snapshot congelado de una sesión ya cerrada (doc 04 §3).
 * Documento: `sucursales/{sucursalId}/historicos/{sesionId}`. Lo escribe una
 * única vez `cerrarSesionImpl`
 * (`packages/functions/src/callables/cerrar-sesion.ts:92-98`) y nunca se
 * modifica después.
 */
export interface Historico {
  readonly sesionId: string;
  readonly cerradaEn: Date;
  readonly totalUnidades: number;
  readonly totalMonetario: number;
  // ponytail: sólo cantidad/subtotal por categoría — `actualizadaEn` por
  // línea vive en el doc pero el comparativo (doc plan §5, F4) no lo
  // necesita; añadir si un consumidor futuro lo pide.
  readonly porCategoria: Readonly<Record<string, { readonly cantidad: number; readonly subtotal: number }>>;
}
