/**
 * Aporte — lo que UN cajero declara haber contado para una categoría en un área.
 * Único dato que el cliente escribe (doc 03 §3, ADR-23). Documento:
 * `sesiones/{sesionId}/lineas/{categoriaId}/aportes/{uid}__{areaId}` (doc 04 §3).
 */
export interface Aporte {
  readonly uid: string;
  readonly areaId: string;
  readonly nombre: string;
  readonly cantidad: number;
  readonly registradoEn: Date;
  readonly dispositivoId: string;
  readonly version: number;
}
