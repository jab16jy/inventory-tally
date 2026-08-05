// packages/data/src/firebase/firestore-conteo-repository.ts (doc 07 §6)
import {
  collection,
  doc,
  increment,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  type DocumentData,
  type Firestore,
} from "firebase/firestore";
import { CantidadInvalidaError } from "@conteo/shared/errors.js";
import type { Aporte } from "@conteo/shared/models/aporte.js";
import type { LineaConteo } from "@conteo/shared/models/linea-conteo.js";
import type { SesionConteo } from "@conteo/shared/models/sesion-conteo.js";
import type {
  ConteoRepository,
  RegistrarAporteInput,
  Unsubscribe,
} from "../repositories/conteo-repository.js";
import { aporteDesdeDoc, lineaConteoDesdeDoc, sesionConteoDesdeDoc } from "./mappers.js";
import { obtenerIdDispositivo } from "./dispositivo.js";

/** Desacopla el repositorio de `firebase/auth`: quien lo construye resuelve
 *  el usuario activo (apps/web lo hace con `getAuth().currentUser`). */
export interface ProveedorUsuarioActual {
  obtenerUid(): string;
  obtenerNombre(): string | null;
}

export class FirestoreConteoRepository implements ConteoRepository {
  private readonly pendientesPorSesion = new Map<string, number>();
  private readonly listenersPendientes = new Map<string, Set<(n: number) => void>>();

  constructor(
    private readonly db: Firestore,
    private readonly usuario: ProveedorUsuarioActual,
  ) {}

  observarLineas(sesionId: string, onChange: (lineas: LineaConteo[]) => void): Unsubscribe {
    const ref = collection(this.db, "sesiones", sesionId, "lineas");
    return onSnapshot(ref, (snap) => {
      onChange(snap.docs.map((d) => lineaConteoDesdeDoc(d.id, d.data() as never)));
    });
  }

  observarMiAporte(
    sesionId: string,
    categoriaId: string,
    onChange: (aporte: Aporte | null) => void,
  ): Unsubscribe {
    const ref = doc(
      this.db,
      "sesiones",
      sesionId,
      "lineas",
      categoriaId,
      "aportes",
      this.usuario.obtenerUid(),
    );
    return onSnapshot(ref, (snap) => {
      onChange(snap.exists() ? aporteDesdeDoc(snap.data() as never) : null);
    });
  }

  observarSesionAbierta(
    sucursalId: string,
    onChange: (sesion: SesionConteo | null) => void,
  ): Unsubscribe {
    // Índice compuesto sucursalId ASC, estado ASC, abiertaEn DESC (doc 04 §4).
    const q = query(
      collection(this.db, "sesiones"),
      where("sucursalId", "==", sucursalId),
      where("estado", "==", "abierta"),
      orderBy("abiertaEn", "desc"),
      limit(1),
    );
    return onSnapshot(q, (snap) => {
      const primero = snap.docs[0];
      onChange(primero ? sesionConteoDesdeDoc(primero.id, primero.data() as never) : null);
    });
  }

  async registrarAporte({ sesionId, categoriaId, cantidad }: RegistrarAporteInput): Promise<void> {
    if (cantidad < 0) throw new CantidadInvalidaError("La cantidad no puede ser negativa");

    const uid = this.usuario.obtenerUid();
    const ref = doc(this.db, "sesiones", sesionId, "lineas", categoriaId, "aportes", uid);

    this.incrementarPendientes(sesionId);

    // Sin await intencional (doc 07 §6): con red ausente la promesa de
    // setDoc no resuelve hasta confirmar en servidor y la UI quedaría
    // colgada. El listener local (observarMiAporte/observarLineas) ya
    // actualizó la pantalla desde la caché de Firestore. NO reemplazar por
    // `await` — rompe el conteo offline (RF-16 / doc 06 §3).
    //
    // Éxito vs RECHAZO del servidor (p.ej. permission-denied por conflicto
    // de `version` o por violar `hasOnly`): un rechazo no se reintenta
    // solo, así que NO debe decrementar el pendiente ni apagar el banner
    // "no cierres la aplicación" — el aporte quedaría perdido en silencio.
    // Un fallo de red puro nunca cae en la rama de rechazo: la promesa
    // simplemente no resuelve (ver arriba), así que sigue contando como
    // pendiente igual que antes.
    void setDoc(
      ref,
      {
        uid,
        nombre: this.usuario.obtenerNombre() ?? "",
        cantidad,
        registradoEn: serverTimestamp(),
        dispositivoId: obtenerIdDispositivo(),
        version: increment(1),
      },
      { merge: true }, // NUNCA un set() de reemplazo total: rompe increment() (doc 09 §3)
    ).then(
      () => this.decrementarPendientes(sesionId),
      () => {
        // Rechazo del servidor: el aporte se perdió y NO se reintenta.
        // Deliberadamente no se decrementa: el pendiente activo mantiene
        // visible el banner de sincronización (doc 07 §8).
      },
    );
  }

  async confirmarSincronizacion(sesionId: string): Promise<void> {
    const uid = this.usuario.obtenerUid();
    const ref = doc(this.db, "sesiones", sesionId, "sincronizacion", "estado");
    // Aquí SÍ se espera: sólo se llama con cero pendientes (RF-16), y su
    // éxito es la condición que habilita el cierre en el panel admin.
    await updateDoc(ref, {
      [`participantes.${uid}.confirmadoEn`]: serverTimestamp(),
      actualizadoEn: serverTimestamp(),
    } as DocumentData);
  }

  uidActual(): string {
    return this.usuario.obtenerUid();
  }

  observarEscriturasPendientes(sesionId: string, onChange: (n: number) => void): Unsubscribe {
    let listeners = this.listenersPendientes.get(sesionId);
    if (!listeners) {
      listeners = new Set();
      this.listenersPendientes.set(sesionId, listeners);
    }
    listeners.add(onChange);
    onChange(this.pendientesPorSesion.get(sesionId) ?? 0);
    return () => listeners.delete(onChange);
  }

  private incrementarPendientes(sesionId: string): void {
    const n = (this.pendientesPorSesion.get(sesionId) ?? 0) + 1;
    this.pendientesPorSesion.set(sesionId, n);
    this.notificarPendientes(sesionId, n);
  }

  private decrementarPendientes(sesionId: string): void {
    const n = Math.max(0, (this.pendientesPorSesion.get(sesionId) ?? 0) - 1);
    this.pendientesPorSesion.set(sesionId, n);
    this.notificarPendientes(sesionId, n);
  }

  private notificarPendientes(sesionId: string, n: number): void {
    this.listenersPendientes.get(sesionId)?.forEach((cb) => cb(n));
  }
}
