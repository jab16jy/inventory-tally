import { onDocumentWritten } from "firebase-functions/v2/firestore";
import {
  FieldValue,
  getFirestore,
  type DocumentData,
  type Firestore,
} from "firebase-admin/firestore";
import { registrarAuditoria } from "../lib/auditoria.js";

export interface ParametrosAporte {
  readonly sesionId: string;
  readonly categoriaId: string;
  readonly claveAporte: string;
}

/**
 * procesarAporteEscrito — núcleo del trigger (doc 05 §3, ADR-23), separado de
 * `onDocumentWritten` para poder probarlo directamente contra el emulador de
 * Firestore sin levantar el emulador de Functions (decisión de la ola O3:
 * más simple y más estable en Windows que orquestar ambos emuladores).
 *
 * DESVIACIÓN DOCUMENTADA respecto al literal de doc 05 §3: el snippet del doc
 * escribe los campos anidados (`versiones.${claveAporte}`, `participantes.${uid}`)
 * como claves con punto dentro de un objeto pasado a `tx.set(ref, obj, {
 * merge: true })`. Comprobado contra el emulador real: `set(..., {merge:true})`
 * NO interpreta una clave de nivel superior con puntos como un FieldPath —crea
 * un campo literal llamado `"versiones.uid_ana"`, con el punto en el nombre—
 * a diferencia de `update()`, que sí lo hace. Como `sincronizacion/estado`
 * puede no existir aún en el primer aporte de la sesión, `update()` (que
 * exige que el documento exista) tampoco sirve. La forma que sí funciona y
 * preserva el mismo efecto es un objeto anidado de verdad con `set({merge:true})`,
 * que sí fusiona recursivamente y sí crea el documento si falta.
 */
export async function procesarAporteEscrito(
  db: Firestore,
  { sesionId, categoriaId, claveAporte }: ParametrosAporte,
  antes: DocumentData | undefined,
  despues: DocumentData | undefined,
): Promise<void> {
  const cantidadAnterior = (antes?.cantidad as number | undefined) ?? 0;
  const cantidadNueva = (despues?.cantidad as number | undefined) ?? 0;
  const uid = (despues?.uid ?? antes?.uid ?? claveAporte.split("__")[0]) as string;
  const areaId = (despues?.areaId ?? antes?.areaId) as string;

  const sesionRef = db.doc(`sesiones/${sesionId}`);
  const lineaRef = db.doc(`sesiones/${sesionId}/lineas/${categoriaId}`);
  const resumenRef = db.doc(`sesiones/${sesionId}/resumen/actual`);
  const syncRef = db.doc(`sesiones/${sesionId}/sincronizacion/estado`);

  await db.runTransaction(async (tx) => {
    const [linea, sesion] = await Promise.all([tx.get(lineaRef), tx.get(sesionRef)]);

    // I-4: nunca agregar sobre una sesión cerrada.
    if (sesion.data()?.estado !== "abierta") return;

    // Idempotencia ante reejecución del trigger (doc 05 §2/§3): Firestore
    // garantiza entrega *at-least-once* y NO garantiza orden. La guardia de
    // versión descarta eventos obsoletos.
    const versiones = (linea.get("versiones") as Record<string, number> | undefined) ?? {};
    const versionAplicada = versiones[claveAporte] ?? 0;
    const versionEntrante = (despues?.version as number | undefined) ?? 0;
    if (versionEntrante <= versionAplicada) return;

    // D2: el delta se calcula contra el último estado APLICADO (no contra el
    // `before` del propio evento) para que un evento entregado fuera de
    // orden no borre el delta de otro más reciente ya aplicado.
    const aplicados = (linea.get("aplicados") as Record<string, number> | undefined) ?? {};
    const cantidadAplicada = aplicados[claveAporte] ?? 0;
    const delta = cantidadNueva - cantidadAplicada;
    if (delta === 0) return;

    const eraAportanteNuevo = versionAplicada === 0;

    const cambiosLinea: Record<string, unknown> = {
      cantidadTotal: FieldValue.increment(delta),
      versiones: { [claveAporte]: versionEntrante },
      aplicados: { [claveAporte]: cantidadNueva },
      porArea: { [areaId]: FieldValue.increment(delta) },
      actualizadaEn: FieldValue.serverTimestamp(),
      actualizadaPor: uid,
    };
    if (eraAportanteNuevo) {
      cambiosLinea.numAportantes = FieldValue.increment(1);
    }
    tx.set(lineaRef, cambiosLinea, { merge: true });

    // Total de unidades visible al cajero.
    tx.update(sesionRef, {
      totalUnidades: FieldValue.increment(delta),
      participantes: FieldValue.arrayUnion(uid),
    });

    // El resumen monetario se recalcula agrupado (doc 05 §5): el trigger
    // sólo marca la bandera, nunca escribe `resumen` directamente.
    // I-M: `marcaAportes` sube en la MISMA transacción que muta `lineas`, para
    // que el cron (D-1) pueda demostrar con un compare-and-clear que ningún
    // aporte se coló entre su lectura de `lineas` y su escritura de `resumen`.
    tx.set(resumenRef, { dirty: true, marcaAportes: FieldValue.increment(1) }, { merge: true });

    // Rastro de sincronización para el cierre (RF-16).
    tx.set(
      syncRef,
      { participantes: { [uid]: { ultimoAporteServidor: FieldValue.serverTimestamp() } } },
      { merge: true },
    );

    // Auditoría inmutable, en la misma transacción (doc 09 §5).
    registrarAuditoria(tx, db, {
      tipo: antes ? "APORTE_MODIFICADO" : "APORTE_CREADO",
      sesionId,
      sucursalId: sesion.get("sucursalId") as string, // ticket #45: para el filtro del cajero
      categoriaId,
      usuarioId: uid,
      usuarioNombre: (despues?.nombre ?? antes?.nombre) as string | undefined,
      cantidadAnterior,
      cantidadNueva,
      origen: "trigger",
    });
  });
}

export const onAporteEscrito = onDocumentWritten(
  {
    document: "sesiones/{sesionId}/lineas/{categoriaId}/aportes/{claveAporte}",
    // D4: reintento de fondo opt-in en Functions v2. Sólo es seguro porque D2
    // hace el handler idempotente de verdad (delta contra el último estado
    // aplicado, guardia de versión) — sin eso, reintentar podría duplicar.
    retry: true,
  },
  async (event) => {
    const { sesionId, categoriaId, claveAporte } = event.params;
    await procesarAporteEscrito(
      getFirestore(),
      { sesionId, categoriaId, claveAporte },
      event.data?.before.data(),
      event.data?.after.data(),
    );
  },
);
