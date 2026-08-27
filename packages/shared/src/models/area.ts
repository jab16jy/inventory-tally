/**
 * Area — agrupación de categorías gestionada por el administrador (doc 03 §3).
 * Documento: `areas/{areaId}` (doc 04 §3). Nunca se borra, sólo se desactiva.
 */
export interface Area {
  readonly areaId: string;
  readonly nombre: string;
  readonly activa: boolean;
  readonly creadaEn: Date;
}
