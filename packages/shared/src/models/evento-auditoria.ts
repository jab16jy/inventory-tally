/**
 * TipoEventoAuditoria — catálogo de eventos de auditoría (doc 04 §3).
 *
 * Fuente de verdad única: aquí, porque es el único paquete que pueden
 * importar a la vez quien escribe los eventos (`packages/functions`, que
 * arrastra `firebase-admin`) y quien los lee (`packages/data`, que no puede
 * depender de Functions). `lib/auditoria.ts` reexporta este mismo tipo.
 *
 * Son 24 miembros. `SUCURSAL_CREADA` y `SUCURSAL_ACTUALIZADA` se declaran
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
  | "USUARIO_ELIMINADO"
  | "CATEGORIA_CREADA"
  | "CATEGORIA_ACTUALIZADA"
  | "CATEGORIA_DESACTIVADA"
  | "CATEGORIA_ELIMINADA"
  | "CATEGORIA_REACTIVADA"
  | "AREA_CREADA"
  | "AREA_ACTUALIZADA"
  | "AREA_DESACTIVADA"
  | "AREA_ELIMINADA"
  | "AREA_REACTIVADA"
  | "AREA_VINCULADA"
  | "SUCURSAL_CREADA"
  | "SUCURSAL_ACTUALIZADA"
  | "SUCURSAL_ELIMINADA"
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
   * Denormalizado (ticket #45) en los eventos ligados a una sucursal:
   * `SESION_ABIERTA`, `SUCURSAL_CREADA`, `SUCURSAL_ACTUALIZADA`,
   * `APORTE_CREADO`, `APORTE_MODIFICADO`, `SESION_CERRADA`,
   * `CIERRE_BLOQUEADO`, `RECONCILIACION`, `AREA_VINCULADA` (9 de 14 tipos) —
   * habilita `ConteoRepository.listarAuditoria` y la regla de lectura del
   * cajero en `infra/firestore.rules` (`allow read: if esAdmin() ||
   * (esCajero() && tieneSucursal(resource.data.sucursalId));`, líneas
   * 133-143), sin cambiar esa regla.
   *
   * `CATEGORIA_CREADA` también la lleva cuando nace de un conteo (un cajero
   * vincula un área a una categoría vía `vincularArea`): hereda la
   * `sucursalId` de la sesión, así que ESE evento sí es legible por su
   * propio cajero. `CATEGORIA_CREADA` originado en el panel de administrador
   * no la lleva. Ausente siempre en el resto (`USUARIO_*`,
   * `CATEGORIA_ACTUALIZADA`, `CATEGORIA_DESACTIVADA`, `CATEGORIA_ELIMINADA`,
   * `CATEGORIA_REACTIVADA`, `AUDITORIA_PURGADA`): esos NO son legibles por
   * un cajero.
   */
  readonly sucursalId?: string;
  readonly [campo: string]: unknown;
}
