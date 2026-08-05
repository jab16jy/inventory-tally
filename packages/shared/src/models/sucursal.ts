/**
 * Sucursal — punto físico donde se cuenta inventario (doc 03 §3). Documento:
 * `sucursales/{sucursalId}` (doc 04 §3).
 *
 * `conectividad` sólo admite "wifi" | "datos" (doc 03 §48, diagrama de
 * dominio): alimenta el aviso de precarga de la pantalla de preparación
 * (doc 11 §3), no una lista abierta de proveedores.
 *
 * `sesionAbiertaId` implementa la invariante I-1: al vivir en el documento
 * de la sucursal, una transacción garantiza atómicamente que no se abran
 * dos sesiones a la vez (doc 04 §3).
 */
export type Conectividad = "wifi" | "datos";

export interface Sucursal {
  readonly sucursalId: string;
  readonly nombre: string;
  readonly direccion: string;
  readonly conectividad: Conectividad;
  readonly activa: boolean;
  readonly sesionAbiertaId: string | null;
  readonly creadaEn: Date;
}
