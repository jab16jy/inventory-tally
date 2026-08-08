import type { Firestore } from "firebase-admin/firestore";
import { participanteSincronizado } from "@conteo/shared/services/sincronizacion.js";

export interface ParticipanteConNombre {
  readonly uid: string;
  readonly nombre: string;
}

export interface ResultadoSincronizacion {
  readonly sinConfirmar: readonly ParticipanteConNombre[];
  readonly excluidosPorInactivo: readonly ParticipanteConNombre[];
}

interface EntradaSincronizacion {
  readonly confirmadoEn?: FirebaseFirestore.Timestamp | null;
  readonly ultimoAporteServidor?: FirebaseFirestore.Timestamp | null;
}

/**
 * verificarSincronizacion — predicado RF-16 (D-3), corregido respecto al
 * chequeo de verdad (`!!confirmadoEn`) que doc 08 tenía originalmente: un
 * cajero que vuelve a aportar después de confirmar queda con una
 * confirmación obsoleta y debe tratarse como sin sincronizar aunque
 * `confirmadoEn` sea verdadero.
 *
 * El predicado en sí (sincronizado(uid) ⟺ confirmadoEn != null &&
 * confirmadoEn >= (ultimoAporteServidor ?? 0)) vive en
 * `@conteo/shared/services/sincronizacion.js` como `participanteSincronizado`
 * — mismo predicado que usa `observarSincronizacion` en
 * `packages/data/src/firebase/firestore-admin-repository.ts`, no reescrito.
 *
 * Un participante ausente en `sincronizacion/estado` se trata como sin
 * sincronizar (conservador): en la práctica no ocurre porque el trigger
 * escribe `sesiones.participantes` y `sincronizacion/estado.participantes[uid]`
 * en la misma transacción.
 *
 * La fuente de verdad de "desactivado" es `usuarios/{uid}.activo === false`,
 * no el custom claim (D-3): es una pregunta de estado de negocio sobre un
 * tercero, no una decisión de autorización sobre quien llama —`exigirAdmin`
 * ya cubre eso. Un único `db.getAll(...)` trae nombre + `activo` de todos
 * los participantes en una sola ida: el mismo dato que ya hacía falta para
 * nombrar a `sinConfirmar`, sin costo marginal.
 */
export async function verificarSincronizacion(
  db: Firestore,
  sesionId: string,
  participantes: readonly string[],
): Promise<ResultadoSincronizacion> {
  if (participantes.length === 0) {
    return { sinConfirmar: [], excluidosPorInactivo: [] };
  }

  const syncRef = db.doc(`sesiones/${sesionId}/sincronizacion/estado`);
  const usuarioRefs = participantes.map((uid) => db.doc(`usuarios/${uid}`));
  const [syncSnap, usuarioSnaps] = await Promise.all([syncRef.get(), db.getAll(...usuarioRefs)]);

  const entradas =
    (syncSnap.get("participantes") as Record<string, EntradaSincronizacion> | undefined) ?? {};

  const sinConfirmar: ParticipanteConNombre[] = [];
  const excluidosPorInactivo: ParticipanteConNombre[] = [];

  participantes.forEach((uid, indice) => {
    // `usuarioRefs` se construyó 1:1 desde `participantes`, así que `getAll`
    // devuelve exactamente un snapshot por posición (TS no puede probarlo).
    const usuarioSnap = usuarioSnaps[indice]!;
    const nombre = (usuarioSnap.get("nombre") as string | undefined) ?? uid;

    const entrada = entradas[uid];
    const confirmadoEn = entrada?.confirmadoEn ?? null;
    const ultimoAporteServidor = entrada?.ultimoAporteServidor ?? null;
    const sincronizado = participanteSincronizado(
      confirmadoEn?.toMillis() ?? null,
      ultimoAporteServidor?.toMillis() ?? null,
    );

    if (sincronizado) return;

    if (usuarioSnap.get("activo") === false) {
      excluidosPorInactivo.push({ uid, nombre });
    } else {
      sinConfirmar.push({ uid, nombre });
    }
  });

  return { sinConfirmar, excluidosPorInactivo };
}
