// packages/data/src/firebase/firestore-conteo-repository.ts (doc 07 §6)
import {
  collection,
  doc,
  getDocs,
  increment,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  startAfter,
  updateDoc,
  where,
  type DocumentData,
  type Firestore,
  type QueryDocumentSnapshot,
} from "firebase/firestore";
import { CantidadInvalidaError } from "@conteo/shared/errors.js";
import type { Aporte } from "@conteo/shared/models/aporte.js";
import type { EventoAuditoria } from "@conteo/shared/models/evento-auditoria.js";
import type { LineaConteo } from "@conteo/shared/models/linea-conteo.js";
import type { SesionConteo } from "@conteo/shared/models/sesion-conteo.js";
import type { Sucursal } from "@conteo/shared/models/sucursal.js";
import type { Pagina } from "../repositories/admin-repository.js";
import type {
  ConteoRepository,
  RegistrarAporteInput,
  Unsubscribe,
} from "../repositories/conteo-repository.js";
import {
  aporteDesdeDoc,
  eventoAuditoriaDesdeDoc,
  lineaConteoDesdeDoc,
  sesionConteoDesdeDoc,
  sucursalDesdeDoc,
} from "./mappers.js";
import { obtenerIdDispositivo } from "./dispositivo.js";

const TAMANO_PAGINA = 20; // mismo valor que FirestoreAdminRepository.listarAuditoria

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

  observarSesion(sesionId: string, onChange: (sesion: SesionConteo | null) => void): Unsubscribe {
    const ref = doc(this.db, "sesiones", sesionId);
    return onSnapshot(ref, (snap) => {
      onChange(snap.exists() ? sesionConteoDesdeDoc(sesionId, snap.data() as never) : null);
    });
  }

  // Decisión ya tomada (F3-A): N listeners onSnapshot(doc(...)), uno por
  // sucursalId, NUNCA where(documentId(), "in", ids). Tres razones:
  //   1. `infra/firestore.rules:33` concede `allow read` por documento vía
  //      `tieneSucursal(sucursalId)`, que depende del wildcard de la ruta
  //      (`match /sucursales/{sucursalId}`) — una consulta de colección no
  //      lo satisface de forma fiable documento por documento.
  //   2. El máximo por cajero es 10 (`contracts/schemas/crear-cajero.schema.ts`:
  //      `sucursalesAsignadas: z.array(z.string()).max(10)`), así que 10
  //      listeners de documento no cuestan nada y evitan un índice
  //      compuesto y los límites de `in` (máx. 10 valores, coincidencia).
  //   3. Cada doc individual sirve desde la caché offline sin depender de
  //      que la consulta completa esté cacheada — más robusto para una
  //      pantalla que se abre justo después de iniciar sesión.
  observarSucursales(
    sucursalIds: readonly string[],
    onChange: (sucursales: Sucursal[]) => void,
  ): Unsubscribe {
    if (sucursalIds.length === 0) {
      onChange([]);
      return () => {};
    }

    // Emisión PARCIAL desde el primer snapshot que llega, sin esperar a
    // los N: offline-first significa que cada doc resuelve su caché local
    // de forma independiente, y con máx. 10 sucursales bloquear la
    // pantalla hasta que la más lenta responda deja al cajero mirando una
    // lista vacía cuando 9 de 10 ya estaban disponibles. El array se
    // recalcula completo en cada snapshot porque el orden de llegada entre
    // N listeners independientes no es determinista.
    const vistas = new Map<string, Sucursal>();

    const emitir = (): void => {
      // Orden estable exigido por la ola: por nombre, desempate por id —
      // necesario porque el orden de llegada de los snapshots no lo es.
      const ordenadas = [...vistas.values()].sort(
        (a, b) => a.nombre.localeCompare(b.nombre) || a.sucursalId.localeCompare(b.sucursalId),
      );
      onChange(ordenadas);
    };

    const unsubs = sucursalIds.map((sucursalId) => {
      const ref = doc(this.db, "sucursales", sucursalId);
      return onSnapshot(ref, (snap) => {
        if (snap.exists()) {
          vistas.set(sucursalId, sucursalDesdeDoc(sucursalId, snap.data() as never));
        } else {
          // ID inexistente (p.ej. sucursal desactivada/borrada tras
          // asignar el claim): se omite del array, no rompe la pantalla.
          vistas.delete(sucursalId);
        }
        emitir();
      });
    });

    return () => unsubs.forEach((unsub) => unsub());
  }

  /**
   * Ticket #45: a diferencia de `observarSucursales`, SÍ es una query de
   * colección con `where("sucursalId", "in", sucursalIds)` — la regla nueva
   * de `infra/firestore.rules` exige que la query venga acotada así, porque
   * Firestore rechaza de entrada una query de colección sin `where` que no
   * pueda demostrar que TODOS sus resultados posibles cumplen la regla.
   */
  async listarAuditoria(
    sucursalIds: readonly string[],
    cursor?: unknown,
  ): Promise<Pagina<EventoAuditoria>> {
    if (sucursalIds.length === 0) return { items: [], siguienteCursor: null };

    const base = query(
      collection(this.db, "auditoria"),
      where("sucursalId", "in", sucursalIds),
      orderBy("ocurridoEn", "desc"),
    );
    const acotada = cursor
      ? query(base, startAfter(cursor as QueryDocumentSnapshot), limit(TAMANO_PAGINA))
      : query(base, limit(TAMANO_PAGINA));
    const snap = await getDocs(acotada);
    const siguienteCursor = snap.docs.length === TAMANO_PAGINA ? (snap.docs.at(-1) ?? null) : null;
    return {
      items: snap.docs.map((d) => eventoAuditoriaDesdeDoc(d.id, d.data())),
      siguienteCursor,
    };
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
