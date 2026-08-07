import type { Firestore, Transaction } from "firebase-admin/firestore";
import { FieldValue } from "firebase-admin/firestore";

// El catálogo vive en packages/shared: es el mismo vocabulario para quien
// escribe (estas Functions) y para quien lee (el panel admin, vía
// AdminRepository). Tenerlo dos veces obligaba a ampliarlo dos veces.
export type { TipoEventoAuditoria } from "@conteo/shared/models/evento-auditoria.js";
import type { TipoEventoAuditoria } from "@conteo/shared/models/evento-auditoria.js";

/**
 * Lado de ESCRITURA del evento. Distinto a propósito del `EventoAuditoria` de
 * packages/shared, que es el de lectura: `eventoId` lo asigna Firestore y
 * `ocurridoEn` lo pone `registrarAuditoria` con la hora del servidor, así que
 * ninguno de los dos se recibe aquí.
 */
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
