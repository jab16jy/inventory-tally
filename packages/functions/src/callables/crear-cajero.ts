import { onCall, HttpsError } from "firebase-functions/v2/https";
import { type Auth, getAuth } from "firebase-admin/auth";
import { FieldValue, getFirestore, type Firestore } from "firebase-admin/firestore";
import { crearCajeroSchema, type CrearCajeroInput } from "@conteo/contracts";
import { exigirAdmin } from "../lib/exigir-admin.js";
import { validar } from "../lib/validar.js";
import { registrarAuditoria } from "../lib/auditoria.js";

/**
 * crearCajeroImpl — núcleo de la callable (doc 08 §3, D-6), separado de
 * `onCall` por el mismo motivo que `abrirSesionImpl`.
 *
 * Paso 1 (`auth.createUser`) NO es idempotente: asigna un uid y consume el
 * correo. Los pasos 2-3 (claims + perfil/auditoría) sí son un total-overwrite,
 * así que sólo ellos necesitan compensación: si cualquiera falla,
 * `auth.deleteUser` libera el correo para el reintento — mismo patrón que
 * `abrir-sesion.ts:99-109`. Sin esto, todo reintento moriría con
 * `already-exists` y el huérfano podría iniciar sesión sin claims.
 */
export async function crearCajeroImpl(
  db: Firestore,
  auth: Auth,
  ejecutadoPor: string,
  input: CrearCajeroInput,
): Promise<{ uid: string; creado: true }> {
  // El correo duplicado es la única falla esperable del paso 1 y el spec le
  // exige un código propio. Sin este mapeo, `onCall` convierte cualquier throw
  // que no sea `HttpsError` en un `internal` genérico y el admin nunca se
  // entera de que el correo ya estaba registrado.
  let usuario;
  try {
    usuario = await auth.createUser({
      email: input.correo,
      password: input.passwordTemporal,
      displayName: input.nombre,
    });
  } catch (error) {
    if ((error as { code?: string }).code === "auth/email-already-exists") {
      throw new HttpsError("already-exists", "El correo ya está registrado");
    }
    throw error;
  }

  try {
    await auth.setCustomUserClaims(usuario.uid, {
      rol: input.rol,
      sucursales: input.sucursalesAsignadas,
    });

    await db.runTransaction(async (tx) => {
      tx.create(db.doc(`usuarios/${usuario.uid}`), {
        nombre: input.nombre,
        correo: input.correo,
        rol: input.rol,
        sucursalesAsignadas: input.sucursalesAsignadas,
        activo: true,
        creadoEn: FieldValue.serverTimestamp(),
        creadoPor: ejecutadoPor,
      });
      registrarAuditoria(tx, db, {
        tipo: "USUARIO_CREADO",
        usuarioId: usuario.uid,
        usuarioNombre: input.nombre,
        ejecutadoPor,
      });
    });
  } catch (error) {
    await auth.deleteUser(usuario.uid);
    throw error;
  }

  return { uid: usuario.uid, creado: true };
}

export const crearCajero = onCall({ region: "us-central1" }, async (req) => {
  exigirAdmin(req);
  const datos = validar(req.data, crearCajeroSchema);
  return crearCajeroImpl(getFirestore(), getAuth(), req.auth!.uid, datos);
});
