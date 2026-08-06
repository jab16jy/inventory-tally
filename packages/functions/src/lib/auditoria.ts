import type { Firestore, Transaction } from "firebase-admin/firestore";
import { FieldValue } from "firebase-admin/firestore";

/**
 * Catálogo de eventos de auditoría (doc 04 §3).
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
  | "RECONCILIACION";

export interface EventoAuditoria {
  readonly tipo: TipoEventoAuditoria;
  readonly [campo: string]: unknown;
}

/**
 * registrarAuditoria — escribe el evento dentro de la MISMA transacción que
 * el cambio que documenta (doc 09 §5: "Completa"). Si la transacción falla,
 * falla también el registro: no hay estado en que el dato cambió pero nadie
 * lo audita. `ocurridoEn` usa la hora del servidor (doc 09 §5: "Con hora
 * confiable"), nunca la del cliente.
 */
export function registrarAuditoria(tx: Transaction, db: Firestore, evento: EventoAuditoria): void {
  tx.create(db.collection("auditoria").doc(), {
    ...evento,
    ocurridoEn: FieldValue.serverTimestamp(),
  });
}
