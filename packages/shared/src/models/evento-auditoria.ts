/**
 * TipoEventoAuditoria — catálogo de eventos de auditoría (doc 04 §3).
 *
 * Fuente de verdad única: aquí, porque es el único paquete que pueden
 * importar a la vez quien escribe los eventos (`packages/functions`, que
 * arrastra `firebase-admin`) y quien los lee (`packages/data`, que no puede
 * depender de Functions). `lib/auditoria.ts` reexporta este mismo tipo.
 *
 * Son 16 miembros. `SUCURSAL_CREADA` y `SUCURSAL_ACTUALIZADA` se declaran
 * antes que sus emisores (llegan en F2), igual que `CATEGORIA_CREADA` y
 * `CATEGORIA_DESACTIVADA` llevan declaradas sin emisor desde el principio
 * (docs/plan-panel-administrador.md §2). La UI de auditoría deriva su lista
 * de filtros de ESTE tipo, nunca de un array literal.
 */
export type TipoEventoAuditoria =
  | "APORTE_CREADO"
  | "APORTE_MODIFICADO"
  | "SESION_ABIERTA"
  | "SESION_CERRADA"
  | "CIERRE_BLOQUEADO"
  | "USUARIO_CREADO"
  | "USUARIO_ACTUALIZADO"
  | "USUARIO_DESACTIVADO"
  | "CATEGORIA_CREADA"
  | "CATEGORIA_DESACTIVADA"
  | "AREA_CREADA"
  | "AREA_DESACTIVADA"
  | "SUCURSAL_CREADA"
  | "SUCURSAL_ACTUALIZADA"
  | "RECONCILIACION"
  | "AUDITORIA_PURGADA";

/**
 * EventoAuditoria — documento `auditoria/{eventoId}` (doc 04 §3), lado de
 * lectura. El resto de los campos varía según `tipo` (p.ej. `sesionId`,
 * `sucursalId`, `sinConfirmar`), de ahí el índice abierto — mismo patrón que
 * `packages/functions/src/lib/auditoria.ts`.
 */
export interface EventoAuditoria {
  readonly eventoId: string;
  readonly tipo: TipoEventoAuditoria;
  readonly ocurridoEn: Date;
  /**
   * Denormalizado (ticket #45) sólo en los eventos ligados a una sucursal:
   * `SESION_ABIERTA`, `SUCURSAL_CREADA`, `SUCURSAL_ACTUALIZADA`,
   * `APORTE_CREADO`, `APORTE_MODIFICADO`, `SESION_CERRADA`,
   * `CIERRE_BLOQUEADO`, `RECONCILIACION` (8 de 14 tipos) — habilita
   * `ConteoRepository.listarAuditoria` y la regla de lectura del cajero en
   * `infra/firestore.rules`. Ausente en el resto (`USUARIO_*`,
   * `CATEGORIA_*`, `AUDITORIA_PURGADA`): esos NO son legibles por un cajero.
   */
  readonly sucursalId?: string;
  readonly [campo: string]: unknown;
}
