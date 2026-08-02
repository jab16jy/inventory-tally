/**
 * SesionConteo — ejercicio de inventario completo sobre una sucursal, con
 * apertura y cierre (doc 03 §3). Documento: `sesiones/{sesionId}` (doc 04 §3).
 *
 * `estado` sólo persiste "abierta" | "cerrada": "Verificando" (doc 03 §5) es
 * un paso transitorio de la Function `cerrarSesion`, no un valor almacenado.
 */
export type EstadoSesion = "abierta" | "cerrada";

export interface SesionConteo {
  readonly sesionId: string;
  readonly sucursalId: string;
  readonly sucursalNombre: string;
  readonly estado: EstadoSesion;
  readonly abiertaEn: Date;
  readonly abiertaPor: string;
  readonly cerradaEn: Date | null;
  readonly cerradaPor: string | null;
  readonly participantes: readonly string[];
  readonly totalUnidades: number;
  readonly sesionCorregidaId: string | null;
}
