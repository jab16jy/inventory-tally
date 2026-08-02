/**
 * Aporte — lo que UN cajero declara haber contado para una categoría.
 * Único dato que el cliente escribe (doc 03 §3). Documento:
 * `sesiones/{sesionId}/lineas/{categoriaId}/aportes/{uid}` (doc 04 §3).
 */
export interface Aporte {
  readonly uid: string;
  readonly nombre: string;
  readonly cantidad: number;
  readonly registradoEn: Date;
  readonly dispositivoId: string;
  readonly version: number;
}
