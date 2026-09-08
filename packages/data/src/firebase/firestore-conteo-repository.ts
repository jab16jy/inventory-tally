// packages/data/src/firebase/firestore-conteo-repository.ts (doc 07 §6)
import type { Functions } from "firebase/functions";
import { httpsCallable } from "firebase/functions";
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
  type DocumentReference,
  type Firestore,
  type QueryDocumentSnapshot,
} from "firebase/firestore";
import { CantidadInvalidaError } from "@conteo/shared/errors.js";
import type { Area } from "@conteo/shared/models/area.js";
import type { Aporte } from "@conteo/shared/models/aporte.js";
import type { LineaConteo } from "@conteo/shared/models/linea-conteo.js";
import type { SesionConteo } from "@conteo/shared/models/sesion-conteo.js";
import type { Sucursal } from "@conteo/shared/models/sucursal.js";
import type { Pagina } from "../repositories/admin-repository.js";
import type {
  ConteoRepository,
  CrearCategoriaEnSesionPayload,
  RegistrarAporteInput,
  Unsubscribe,
} from "../repositories/conteo-repository.js";
import {
  aporteDesdeDoc,
  areaDesdeDoc,
  lineaConteoDesdeDoc,
  sesionConteoDesdeDoc,
  sucursalDesdeDoc,
} from "./mappers.js";
import { obtenerIdDispositivo } from "./dispositivo.js";

const TAMANO_PAGINA = 20; // mismo valor que FirestoreAdminRepository.listarAuditoria

// Issue #41: un rechazo del servidor (p.ej. conflicto de `version`,
// infra/firestore.rules:85-88) ya no se abandona en silencio. Se reintenta
// con backoff exponencial y, agotados los intentos, se expone vía
// `observarEscriturasConError` con un botón de reintento manual — nunca se
// pierde el conteo sin que el cajero pueda notarlo (principio rector README).
const MAX_REINTENTOS = 3;
const RETRASO_BASE_MS = 1000;

/** Desacopla el repositorio de `firebase/auth`: quien lo construye resuelve
 *  el usuario activo (apps/web lo hace con `getAuth().currentUser`). */
export interface ProveedorUsuarioActual {
  obtenerUid(): string;
  obtenerNombre(): string | null;
}

export class FirestoreConteoRepository implements ConteoRepository {
  private readonly pendientesPorSesion = new Map<string, number>();
  private readonly listenersPendientes = new Map<string, Set<(n: number) => void>>();
  private readonly fallidosPorSesion = new Map<
    string,
    Map<string, { ref: DocumentReference; datos: DocumentData }>
  >();
  private readonly listenersError = new Map<string, Set<(n: number) => void>>();

  constructor(
    private readonly db: Firestore,
    private readonly usuario: ProveedorUsuarioActual,
    private readonly functions: Functions,
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
    areaId: string,
    onChange: (aporte: Aporte | null) => void,
  ): Unsubscribe {
    const ref = doc(
      this.db,
      "sesiones",
      sesionId,
      "lineas",
      categoriaId,
      "aportes",
      `${this.usuario.obtenerUid()}__${areaId}`,
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
   * Historial del cajero (`/mis-conteos`). `array-contains` sobre
   * `participantes` (que el trigger `on-aporte-escrito` mantiene con
   * `FieldValue.arrayUnion(uid)`) responde "¿participé?", pero es el
   * `where("sucursalId", "in", ...)` el que hace que Firestore pueda demostrar
   * que TODO resultado posible cumple `tieneSucursal(...)`. Sin él la query
   * entera se deniega en cuanto el cajero participó alguna vez en una sucursal
   * que ya no tiene asignada.
   *
   * Máx. 10 sucursales por cajero
   * (`contracts/schemas/crear-cajero.schema.ts`: `.max(10)`), muy por debajo
   * del límite de 30 valores de `in`.
   */
  async listarMisSesiones(
    sucursalIds: readonly string[],
    cursor?: unknown,
  ): Promise<Pagina<SesionConteo>> {
    if (sucursalIds.length === 0) return { items: [], siguienteCursor: null };

    // Índice compuesto sucursalId ASC, participantes CONTAINS, abiertaEn DESC
    // (infra/firestore.indexes.json, doc 04 §4).
    const base = query(
      collection(this.db, "sesiones"),
      where("participantes", "array-contains", this.usuario.obtenerUid()),
      where("sucursalId", "in", sucursalIds),
      orderBy("abiertaEn", "desc"),
    );
    const acotada = cursor
      ? query(base, startAfter(cursor as QueryDocumentSnapshot), limit(TAMANO_PAGINA))
      : query(base, limit(TAMANO_PAGINA));
    const snap = await getDocs(acotada);
    const siguienteCursor = snap.docs.length === TAMANO_PAGINA ? (snap.docs.at(-1) ?? null) : null;
    return {
      items: snap.docs.map((d) => sesionConteoDesdeDoc(d.id, d.data() as never)),
      siguienteCursor,
    };
  }

  async registrarAporte({
    sesionId,
    categoriaId,
    areaId,
    cantidad,
    partidas,
  }: RegistrarAporteInput): Promise<void> {
    if (cantidad < 0) throw new CantidadInvalidaError("La cantidad no puede ser negativa");

    const uid = this.usuario.obtenerUid();
    const ref = doc(
      this.db,
      "sesiones",
      sesionId,
      "lineas",
      categoriaId,
      "aportes",
      `${uid}__${areaId}`,
    );
    const datos = {
      uid,
      areaId,
      nombre: this.usuario.obtenerNombre() ?? "",
      cantidad,
      registradoEn: serverTimestamp(),
      dispositivoId: obtenerIdDispositivo(),
      version: increment(1),
      // ADR-24: sólo se incluye cuando viene definida — Firestore rechaza
      // `undefined` como valor de campo.
      ...(partidas !== undefined ? { partidas } : {}),
    };

    this.incrementarPendientes(sesionId);

    // Sin await intencional (doc 07 §6): con red ausente la promesa de
    // setDoc no resuelve hasta confirmar en servidor y la UI quedaría
    // colgada. El listener local (observarMiAporte/observarLineas) ya
    // actualizó la pantalla desde la caché de Firestore. NO reemplazar por
    // `await` — rompe el conteo offline (RF-16 / doc 06 §3).
    this.intentarEscritura(sesionId, categoriaId, ref, datos, 0);
  }

  /**
   * Issue #41: un solo `datos` (con el `increment(1)` ya congelado) se
   * reutiliza en cada reintento — un rechazo significa que Firestore no
   * aplicó nada, así que reenviar el mismo incremento es seguro (no hay
   * doble-conteo). Agotado `MAX_REINTENTOS`, se rinde vía `registrarFallo`
   * en vez de perder el aporte en silencio.
   */
  private intentarEscritura(
    sesionId: string,
    categoriaId: string,
    ref: DocumentReference,
    datos: DocumentData,
    intento: number,
  ): void {
    void setDoc(
      ref,
      datos,
      { merge: true }, // NUNCA un set() de reemplazo total: rompe increment() (doc 09 §3)
    ).then(
      () => {
        this.limpiarFallo(sesionId, categoriaId);
        this.decrementarPendientes(sesionId);
      },
      () => {
        if (intento < MAX_REINTENTOS) {
          setTimeout(
            () => this.intentarEscritura(sesionId, categoriaId, ref, datos, intento + 1),
            RETRASO_BASE_MS * 2 ** intento,
          );
          return;
        }
        this.registrarFallo(sesionId, categoriaId, ref, datos);
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

  observarAreasActivas(onChange: (areas: Area[]) => void): Unsubscribe {
    // Filtro `activa` EN MEMORIA, no where() — ver el comentario de la
    // interfaz (conteo-repository.ts): decenas de documentos, sin índice
    // compuesto nuevo.
    const q = query(collection(this.db, "areas"), orderBy("nombre"));
    return onSnapshot(q, (snap) => {
      onChange(snap.docs.map((d) => areaDesdeDoc(d.id, d.data() as never)).filter((a) => a.activa));
    });
  }

  async crearCategoriaEnSesion(
    payload: CrearCategoriaEnSesionPayload,
  ): Promise<{ categoriaId: string }> {
    return this.llamar("crearCategoriaEnSesion", payload);
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

  observarEscriturasConError(sesionId: string, onChange: (n: number) => void): Unsubscribe {
    let listeners = this.listenersError.get(sesionId);
    if (!listeners) {
      listeners = new Set();
      this.listenersError.set(sesionId, listeners);
    }
    listeners.add(onChange);
    onChange(this.fallidosPorSesion.get(sesionId)?.size ?? 0);
    return () => listeners.delete(onChange);
  }

  reintentarEscriturasFallidas(sesionId: string): void {
    const fallidos = this.fallidosPorSesion.get(sesionId);
    if (!fallidos) return;

    // Se limpian ANTES de reintentar: si vuelven a fallar, `registrarFallo`
    // las repone. No se llama `incrementarPendientes` — el pendiente ya
    // estaba contado desde el intento original, nunca se decrementó.
    for (const [categoriaId, { ref, datos }] of fallidos) {
      fallidos.delete(categoriaId);
      this.intentarEscritura(sesionId, categoriaId, ref, datos, 0);
    }
    this.notificarError(sesionId);
  }

  private registrarFallo(
    sesionId: string,
    categoriaId: string,
    ref: DocumentReference,
    datos: DocumentData,
  ): void {
    let fallidos = this.fallidosPorSesion.get(sesionId);
    if (!fallidos) {
      fallidos = new Map();
      this.fallidosPorSesion.set(sesionId, fallidos);
    }
    fallidos.set(categoriaId, { ref, datos });
    this.notificarError(sesionId);
  }

  private limpiarFallo(sesionId: string, categoriaId: string): void {
    const fallidos = this.fallidosPorSesion.get(sesionId);
    if (!fallidos?.delete(categoriaId)) return; // no-op si no había fallo (camino normal de éxito)
    this.notificarError(sesionId);
  }

  private notificarError(sesionId: string): void {
    const n = this.fallidosPorSesion.get(sesionId)?.size ?? 0;
    this.listenersError.get(sesionId)?.forEach((cb) => cb(n));
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

  // ponytail: copia de FirestoreAdminRepository.llamar (~5 líneas) en vez de
  // un helper compartido — ambos repositorios no comparten nada más, un
  // import cruzado sólo por esto sería más acoplamiento que la duplicación.
  //
  // JSON.parse(JSON.stringify(...)) sanea el payload ANTES de invocar la
  // callable: `httpsCallable` (node_modules/@firebase/functions/dist/
  // index.cjs.js, encode()) convierte cualquier propiedad `undefined` a
  // `null` antes de enviarla por la red. Un schema zod con `.optional()`
  // (p.ej. `crearCategoriaEnSesionSchema.areaId`) acepta `undefined` pero
  // rechaza `null` → `invalid-argument` (HTTP 400) — el bug real que impedía
  // crear un producto dejando "Sin área" (el valor por defecto, el camino
  // normal). El round-trip por JSON elimina las claves `undefined` en vez de
  // dejar que Firebase las convierta: es el único punto por el que pasan
  // TODAS las llamadas de este repositorio, así que arregla la causa raíz
  // una sola vez, no por schema. `null` explícito sí sobrevive el round-trip intacto.
  private async llamar<Entrada, Salida>(nombre: string, payload: Entrada): Promise<Salida> {
    const llamada = httpsCallable<Entrada, Salida>(this.functions, nombre);
    const payloadSaneado = JSON.parse(JSON.stringify(payload)) as Entrada;
    const resultado = await llamada(payloadSaneado);
    return resultado.data;
  }
}
