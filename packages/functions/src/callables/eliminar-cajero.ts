import { onCall, HttpsError } from "firebase-functions/v2/https";
import { type Auth, getAuth } from "firebase-admin/auth";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import { eliminarCajeroSchema, type EliminarCajeroInput } from "@conteo/contracts";
import { exigirAdmin } from "../lib/exigir-admin.js";
import { exigirReautenticacion } from "../lib/exigir-reautenticacion.js";
import { validar } from "../lib/validar.js";
import { registrarAuditoria } from "../lib/auditoria.js";

/**
 * eliminarCajeroImpl — núcleo de la callable (docs/plan-panel-administrador.md
 * §3). Borrado FÍSICO e irreversible, bloqueado por referencias vivas: si el
 * cajero participó alguna vez en un conteo, se rechaza entero y no se borra
 * nada.
 *
 * ORDEN Auth → Firestore, deliberado (mismo espíritu D-3 que
 * `desactivarCajeroImpl`, pero llevado al extremo porque aquí no hay vuelta
 * atrás): si el proceso muere entre `auth.deleteUser` y la transacción, el
 * corte deja un perfil `usuarios/{uid}` huérfano cuya cuenta de Auth ya no
 * existe — el cajero no puede iniciar sesión, y un admin puede reintentar la
 * operación sin riesgo (el segundo intento sólo re-borra el perfil). El orden
 * inverso dejaría el peor corte posible: una cuenta de Auth viva, capaz de
 * iniciar sesión, sin perfil — invisible para el panel de administración.
 * Fallar hacia "no puede actuar" nunca hacia "puede actuar sin ser visto".
 *
 * ponytail: la auditoría (`USUARIO_CREADO`) NO bloquea este borrado. Todo
 * cajero tiene su propio evento `USUARIO_CREADO` desde que existe — una
 * guarda que contara filas de auditoría equivaldría a `if (true) rechazar`,
 * y ningún cajero sería jamás eliminable. El rastro de auditoría es historial
 * y nunca se purga (salvo por retención, ver `purgar-auditoria.ts`);
 * `USUARIO_ELIMINADO` se suma a ese historial, no lo reemplaza.
 */
export async function eliminarCajeroImpl(
  db: Firestore,
  auth: Auth,
  ejecutadoPor: string,
  input: EliminarCajeroInput,
): Promise<{ uid: string; eliminado: true }> {
  const { uid } = input;

  // Un admin no puede borrarse a sí mismo: `deleteUser` tendría éxito, el
  // perfil se iría con él y quedaría fuera para siempre — y si era el único
  // admin, el sistema se queda sin ninguno. `desactivarCajero` no lleva esta
  // guarda porque allí `reactivarCajero` deshace el error; aquí no hay vuelta.
  if (uid === ejecutadoPor) {
    throw new HttpsError("failed-precondition", "No puedes eliminar tu propia cuenta.");
  }

  // El rol del objetivo se lee de los custom claims, NUNCA de `usuarios/{uid}`
  // (doc 09 §2, misma razón que `exigirAdmin`): el documento es un espejo, el
  // claim es la fuente de verdad. Esta callable borra CAJEROS — dejar pasar a
  // un admin convertiría un panel de gestión de cajeros en la vía para
  // eliminar administradores de forma irreversible.
  let objetivo;
  try {
    objetivo = await auth.getUser(uid);
  } catch (error) {
    if ((error as { code?: string }).code === "auth/user-not-found") {
      throw new HttpsError("not-found", "Cajero inexistente");
    }
    throw error;
  }
  if (objetivo.customClaims?.rol !== "cajero") {
    throw new HttpsError("failed-precondition", "Sólo se pueden eliminar cajeros.");
  }

  const participaciones = await db
    .collection("sesiones")
    .where("participantes", "array-contains", uid)
    .count()
    .get();
  const n = participaciones.data().count;
  if (n > 0) {
    throw new HttpsError(
      "failed-precondition",
      `No se puede eliminar: participó en ${n} ${n === 1 ? "conteo" : "conteos"}.`,
    );
  }

  try {
    await auth.deleteUser(uid);
  } catch (error) {
    if ((error as { code?: string }).code === "auth/user-not-found") {
      throw new HttpsError("not-found", "Cajero inexistente");
    }
    throw error;
  }

  await db.runTransaction(async (tx) => {
    tx.delete(db.doc(`usuarios/${uid}`));
    registrarAuditoria(tx, db, {
      tipo: "USUARIO_ELIMINADO",
      usuarioId: uid,
      ejecutadoPor,
    });
  });

  return { uid, eliminado: true };
}

export const eliminarCajero = onCall({ region: "us-central1" }, async (req) => {
  exigirAdmin(req);
  exigirReautenticacion(req);
  const datos = validar(req.data, eliminarCajeroSchema);
  return eliminarCajeroImpl(getFirestore(), getAuth(), req.auth!.uid, datos);
});
