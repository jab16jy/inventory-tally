/**
 * Partida — una tanda agrupada del cajero (ADR-24): teclea 50, agrupa, el
 * contador se reinicia, teclea 30, agrupa de nuevo. Sin `registradoEn`:
 * Firestore prohíbe sentinelas `FieldValue` (`serverTimestamp()`) dentro de
 * elementos de array, y la hora no hace falta para borrar la tanda.
 */
export interface Partida {
  readonly id: string;
  readonly cantidad: number;
}

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
  /**
   * Ledger de tandas agrupadas (ADR-24). Opcional a propósito: los aportes
   * viejos no lo tienen y siguen siendo válidos, igual que
   * `LineaConteo.aplicados`. Invariante deliberada: `suma(partidas) <=
   * cantidad`, NUNCA `==` — los toques sueltos del stepper −/+ escriben
   * `cantidad ± 1` sin tocar `partidas`, así que no son tandas y no
   * aparecen en la papelera.
   */
  readonly partidas?: readonly Partida[];
}
