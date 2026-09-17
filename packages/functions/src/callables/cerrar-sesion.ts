import { onCall, HttpsError } from "firebase-functions/v2/https";
import { FieldValue, getFirestore, type Firestore } from "firebase-admin/firestore";
import { cerrarSesionSchema, type CerrarSesionInput } from "@conteo/contracts";
import {
  exigirAdminDeSucursal,
  exigirExclusivaDeSucursal,
  type AlcanceAdmin,
} from "../lib/exigir-admin.js";
import { validar } from "../lib/validar.js";
import { registrarAuditoria } from "../lib/auditoria.js";
import { verificarSincronizacion } from "../lib/sincronizacion.js";
import { calcularResumen } from "../lib/resumen.js";

/**
 * cerrarSesionImpl — núcleo de la callable (doc 08 §3, D-4), separado de
 * `onCall` por el mismo motivo que `abrirSesionImpl`.
 *
 * Fase A (fuera de tx): estado + RF-16 (`verificarSincronizacion`) — un
 * aporte que llegue entre A y B ya queda dentro de la instantánea que B lee.
 *
 * Fase B (UNA tx): releer `estado`, leer `lineas` (`tx.get(query)` toma un
 * lock pesimista por línea, serializando contra la propia tx del trigger) y
 * congelar sesión + sucursal + `historicos` + `resumen` + auditoría en un
 * commit — ningún aporte concurrente deja `historicos` en desacuerdo con la
 * sesión. Idempotencia (dos guardias): la relectura de `estado` rechaza un
 * reintento tras un cierre YA exitoso; `tx.create(historicoRef)` es la
 * segunda defensa. Un reintento tras un cierre FALLIDO ve la sesión intacta.
 *
 * `marcaAportes` se descarta del `resumen` congelado a propósito: la
 * consulta del cron (`estado=="abierta"`) deja de ver esta sesión apenas se
 * congela; para la ventana en que un ciclo del cron ya está en vuelo sobre
 * ESTA sesión, su propio `tx.get(resumenRef)` (paso 3) toma un lock
 * pesimista que serializa contra este `tx.set`, y al faltar `marcaAportes`
 * cualquier lectura posterior del cron compara contra `undefined ?? 0` —
 * nunca coincide con la `M` que capturó, y no escribe nada. Ningún orden de
 * commit deja al cron pisando este snapshot.
 */
export async function cerrarSesionImpl(
  db: Firestore,
  ejecutadoPor: string,
  input: CerrarSesionInput,
  alcance: AlcanceAdmin,
): Promise<{ sesionId: string }> {
  const { sesionId, forzar } = input;
  const sesionRef = db.doc(`sesiones/${sesionId}`);

  const sesionAntes = await sesionRef.get();
  if (!sesionAntes.exists) {
    throw new HttpsError("not-found", "Sesión inexistente");
  }
  // D4/S2b: gate de sucursal ANTES del estado, RF-16, CIERRE_BLOQUEADO y la
  // tx de congelamiento — un admin_sucursal ajeno no debe producir ningún
  // efecto, ni siquiera el diagnóstico de "sesión no abierta".
  exigirExclusivaDeSucursal(alcance, [sesionAntes.get("sucursalId") as string]);
  if (sesionAntes.get("estado") !== "abierta") {
    throw new HttpsError("failed-precondition", "La sesión no está abierta");
  }
  const sucursalId = sesionAntes.get("sucursalId") as string;
  const participantes = (sesionAntes.get("participantes") as string[] | undefined) ?? [];

  const { sinConfirmar, excluidosPorInactivo } = await verificarSincronizacion(
    db,
    sesionId,
    participantes,
  );

  if (sinConfirmar.length > 0 && !forzar) {
    await db.runTransaction(async (tx) => {
      registrarAuditoria(tx, db, {
        tipo: "CIERRE_BLOQUEADO",
        sesionId,
        sucursalId, // ticket #45: para el filtro del cajero
        sinConfirmar,
        excluidosPorInactivo,
        ejecutadoPor,
      });
    });
    throw new HttpsError("failed-precondition", "Hay cajeros con conteos sin sincronizar", {
      sinConfirmar,
    });
  }

  await db.runTransaction(async (tx) => {
    const sesion = await tx.get(sesionRef);
    if (sesion.get("estado") !== "abierta") {
      throw new HttpsError("failed-precondition", "La sesión no está abierta");
    }

    const sucursalRef = db.doc(`sucursales/${sucursalId}`);
    const lineas = await tx.get(sesionRef.collection("lineas").where("cantidadTotal", ">", 0));
    const resumenCalculado = calcularResumen(lineas.docs);
    const resumenRef = sesionRef.collection("resumen").doc("actual");

    tx.update(sesionRef, {
      estado: "cerrada",
      cerradaEn: FieldValue.serverTimestamp(),
      cerradaPor: ejecutadoPor,
      forzado: forzar,
      sinConfirmarAlCerrar: sinConfirmar,
      totalUnidades: resumenCalculado.totalUnidades,
    });
    tx.update(sucursalRef, { sesionAbiertaId: null });
    tx.create(sucursalRef.collection("historicos").doc(sesionId), {
      sesionId,
      cerradaEn: FieldValue.serverTimestamp(),
      totalUnidades: resumenCalculado.totalUnidades,
      totalMonetario: resumenCalculado.totalMonetario,
      porCategoria: resumenCalculado.porCategoria,
      porArea: resumenCalculado.porArea,
    });
    // `set` sin `merge` (mismo motivo que D-1): `resumen` es 100% derivado.
    tx.set(resumenRef, {
      ...resumenCalculado,
      recalculadoEn: FieldValue.serverTimestamp(),
      dirty: false,
    });

    registrarAuditoria(tx, db, {
      tipo: "SESION_CERRADA",
      sesionId,
      sucursalId, // ticket #45: para el filtro del cajero
      forzado: forzar,
      sinConfirmar,
      excluidosPorInactivo,
      ejecutadoPor,
    });
  });

  return { sesionId };
}

export const cerrarSesion = onCall({ region: "us-central1" }, async (req) => {
  const alcance = exigirAdminDeSucursal(req);
  const datos = validar(req.data, cerrarSesionSchema);
  return cerrarSesionImpl(getFirestore(), req.auth!.uid, datos, alcance);
});
