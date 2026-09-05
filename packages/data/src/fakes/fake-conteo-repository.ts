// packages/data/src/fakes/fake-conteo-repository.ts — implementación en
// memoria de ConteoRepository (doc 07 §6), para los tests de UI en
// `apps/web` sin tocar el SDK de Firebase ni el emulador.
import { CantidadInvalidaError } from "@conteo/shared/errors.js";
import type { Area } from "@conteo/shared/models/area.js";
import type { Aporte } from "@conteo/shared/models/aporte.js";
import type { LineaConteo } from "@conteo/shared/models/linea-conteo.js";
import type { SesionConteo } from "@conteo/shared/models/sesion-conteo.js";
import type { Sucursal } from "@conteo/shared/models/sucursal.js";
import type { LlamadaEscritura } from "./fake-admin-repository.js";
import type { Pagina } from "../repositories/admin-repository.js";
import type {
  ConteoRepository,
  CrearCategoriaEnSesionPayload,
  RegistrarAporteInput,
  Unsubscribe,
} from "../repositories/conteo-repository.js";

const TAMANO_PAGINA = 20; // mismo valor que FirestoreConteoRepository (constante en producción)

// Issue #41: misma máquina de estados que FirestoreConteoRepository
// (reintento con backoff, fallo permanente expuesto tras agotar intentos).
// Duplicar la constante aquí es aceptable — son 2 números, no vale la pena
// una abstracción compartida entre paquete `data`/`firebase` y este fake.
const MAX_REINTENTOS = 3;

export interface UsuarioFake {
  readonly uid: string;
  readonly nombre: string;
}

export interface OpcionesFake {
  /** Simula la latency de "sincronizar con el servidor" (doc 06 §4). */
  readonly retrasoSincronizacionMs?: number;
}

/** Aporte guardado internamente, indexado por sesión → categoría → uid. */
type MapaAportes = Map<string, Map<string, Map<string, Aporte>>>;
type MapaLineas = Map<string, Map<string, LineaConteo>>;

export class FakeConteoRepository implements ConteoRepository {
  private readonly usuario: UsuarioFake;
  private readonly retrasoSincronizacionMs: number;

  private readonly lineas: MapaLineas = new Map();
  private readonly aportes: MapaAportes = new Map();
  private readonly sesionesPorSucursal = new Map<string, SesionConteo>();
  private readonly sesionesPorId = new Map<string, SesionConteo>();
  private readonly sucursales = new Map<string, Sucursal>();
  private readonly pendientesPorSesion = new Map<string, number>();
  private readonly areas = new Map<string, Area>();
  private contadorCategoriaId = 0;

  /** Igual que FakeAdminRepository.llamadas: registro para que los tests de
   *  UI asserten los argumentos exactos de
   *  crearCategoriaEnSesion. */
  readonly llamadas: LlamadaEscritura[] = [];

  // Issue #41: seam de prueba para simular rechazos deterministas del
  // "servidor" — cuenta cuántos rechazos consecutivos quedan por consumir
  // para la (sesionId, categoriaId) sembrada.
  private readonly rechazosPendientes = new Map<string, number>();
  private readonly fallidosPorSesion = new Map<string, Set<string>>();

  private readonly listenersLineas = new Map<string, Set<(l: LineaConteo[]) => void>>();
  private readonly listenersAporte = new Map<string, Set<(a: Aporte | null) => void>>();
  private readonly listenersSesion = new Map<string, Set<(s: SesionConteo | null) => void>>();
  private readonly listenersSesionPorId = new Map<string, Set<(s: SesionConteo | null) => void>>();
  private readonly listenersPendientes = new Map<string, Set<(n: number) => void>>();
  private readonly listenersError = new Map<string, Set<(n: number) => void>>();

  constructor(
    usuario: UsuarioFake = { uid: "uid_test", nombre: "Cajero de prueba" },
    opciones: OpcionesFake = {},
  ) {
    this.usuario = usuario;
    this.retrasoSincronizacionMs = opciones.retrasoSincronizacionMs ?? 0;
  }

  // ─────────── siembra para tests ───────────

  sembrarLinea(sesionId: string, linea: LineaConteo): void {
    this.lineasDeSesion(sesionId).set(linea.categoriaId, linea);
  }

  sembrarSesionAbierta(sucursalId: string, sesion: SesionConteo): void {
    this.sesionesPorSucursal.set(sucursalId, sesion);
    this.listenersSesion.get(sucursalId)?.forEach((cb) => cb(sesion));
  }

  /** Siembra (o reemplaza) por `sesionId`, notificando a los suscriptores
   *  activos de `observarSesion` — así un test puede simular al admin
   *  cerrando la sesión a mitad de un conteo (F4-A1), sembrando de nuevo con
   *  `estado: "cerrada"`. */
  sembrarSesion(sesion: SesionConteo): void {
    this.sesionesPorId.set(sesion.sesionId, sesion);
    this.listenersSesionPorId.get(sesion.sesionId)?.forEach((cb) => cb(sesion));
  }

  sembrarSucursal(sucursal: Sucursal): void {
    this.sucursales.set(sucursal.sucursalId, sucursal);
  }

  sembrarArea(area: Area): void {
    this.areas.set(area.areaId, area);
  }

  /** Hace que las próximas `veces` "escrituras" de esa (sesionId, categoriaId)
   *  rechacen, antes de que el fake decida éxito o fallo permanente. */
  sembrarRechazosAporte(sesionId: string, categoriaId: string, veces: number): void {
    const clave = `${sesionId}/${categoriaId}`;
    this.rechazosPendientes.set(clave, (this.rechazosPendientes.get(clave) ?? 0) + veces);
  }

  // ─────────── ConteoRepository ───────────

  observarLineas(sesionId: string, onChange: (lineas: LineaConteo[]) => void): Unsubscribe {
    const listeners = this.listenersDe(this.listenersLineas, sesionId);
    listeners.add(onChange);
    onChange([...this.lineasDeSesion(sesionId).values()]);
    return () => listeners.delete(onChange);
  }

  observarMiAporte(
    sesionId: string,
    categoriaId: string,
    areaId: string,
    onChange: (aporte: Aporte | null) => void,
  ): Unsubscribe {
    const clave = `${sesionId}/${categoriaId}/${areaId}`;
    const listeners = this.listenersDe(this.listenersAporte, clave);
    listeners.add(onChange);
    onChange(
      this.aportesDeLinea(sesionId, categoriaId).get(`${this.usuario.uid}__${areaId}`) ?? null,
    );
    return () => listeners.delete(onChange);
  }

  observarSesionAbierta(
    sucursalId: string,
    onChange: (sesion: SesionConteo | null) => void,
  ): Unsubscribe {
    const listeners = this.listenersDe(this.listenersSesion, sucursalId);
    listeners.add(onChange);
    onChange(this.sesionesPorSucursal.get(sucursalId) ?? null);
    return () => listeners.delete(onChange);
  }

  observarSesion(sesionId: string, onChange: (sesion: SesionConteo | null) => void): Unsubscribe {
    const listeners = this.listenersDe(this.listenersSesionPorId, sesionId);
    listeners.add(onChange);
    onChange(this.sesionesPorId.get(sesionId) ?? null);
    return () => listeners.delete(onChange);
  }

  // Mismo contrato observable que FirestoreConteoRepository.observarSucursales
  // (doc 07 §6): orden estable por nombre con desempate por id, IDs
  // inexistentes omitidos, array vacío → un solo onChange([]).
  observarSucursales(
    sucursalIds: readonly string[],
    onChange: (sucursales: Sucursal[]) => void,
  ): Unsubscribe {
    const encontradas = sucursalIds
      .map((id) => this.sucursales.get(id))
      .filter((s): s is Sucursal => s !== undefined)
      .sort((a, b) => a.nombre.localeCompare(b.nombre) || a.sucursalId.localeCompare(b.sucursalId));
    onChange(encontradas);
    return () => {};
  }

  // Mismo contrato observable que FirestoreConteoRepository.listarMisSesiones:
  // sólo sesiones donde el uid está en `participantes` Y cuyo `sucursalId`
  // está en `sucursalIds` (la cláusula `in` que las reglas exigen), ordenadas
  // de la más reciente a la más antigua. Lee de `sesionesPorId`, que es lo que
  // siembra `sembrarSesion`.
  async listarMisSesiones(
    sucursalIds: readonly string[],
    cursor?: unknown,
  ): Promise<Pagina<SesionConteo>> {
    const filtradas = [...this.sesionesPorId.values()]
      .filter(
        (s) => s.participantes.includes(this.usuario.uid) && sucursalIds.includes(s.sucursalId),
      )
      .sort((a, b) => b.abiertaEn.getTime() - a.abiertaEn.getTime());
    const offset = typeof cursor === "number" ? cursor : 0;
    const items = filtradas.slice(offset, offset + TAMANO_PAGINA);
    const siguienteCursor = offset + items.length < filtradas.length ? offset + items.length : null;
    return { items, siguienteCursor };
  }

  async registrarAporte({
    sesionId,
    categoriaId,
    areaId,
    cantidad,
  }: RegistrarAporteInput): Promise<void> {
    if (cantidad < 0) throw new CantidadInvalidaError("La cantidad no puede ser negativa");

    const claveAporte = `${this.usuario.uid}__${areaId}`;
    const aportesLinea = this.aportesDeLinea(sesionId, categoriaId);
    const anterior = aportesLinea.get(claveAporte);
    const delta = cantidad - (anterior?.cantidad ?? 0);
    const eraNuevo = anterior === undefined;

    const aporte: Aporte = {
      uid: this.usuario.uid,
      areaId,
      nombre: this.usuario.nombre,
      cantidad,
      registradoEn: new Date(),
      dispositivoId: "fake-device",
      version: (anterior?.version ?? 0) + 1,
    };
    aportesLinea.set(claveAporte, aporte);
    this.notificar(this.listenersAporte, `${sesionId}/${categoriaId}/${areaId}`, aporte);

    const lineas = this.lineasDeSesion(sesionId);
    const linea = lineas.get(categoriaId);
    if (linea) {
      const actualizada: LineaConteo = {
        ...linea,
        cantidadTotal: linea.cantidadTotal + delta,
        numAportantes: linea.numAportantes + (eraNuevo ? 1 : 0),
        versiones: { ...linea.versiones, [claveAporte]: aporte.version },
        // Mismo desglose que mantiene onAporteEscrito en producción (ADR-23).
        porArea: { ...linea.porArea, [areaId]: (linea.porArea[areaId] ?? 0) + delta },
        actualizadaEn: aporte.registradoEn,
        actualizadaPor: this.usuario.uid,
      };
      lineas.set(categoriaId, actualizada);
    }
    this.notificar(this.listenersLineas, sesionId, [...lineas.values()]);

    // Escritura local instantánea, "sincronización" en segundo plano — mismo
    // contrato observable que FirestoreConteoRepository.registrarAporte: la
    // promesa devuelta NO espera a que baje el contador de pendientes.
    this.incrementarPendientes(sesionId);
    this.intentarSincronizar(sesionId, categoriaId, 0);
  }

  async confirmarSincronizacion(sesionId: string): Promise<void> {
    // ponytail: el fake no modela sincronizacion/estado (no hay hook que lo
    // observe en esta ola); sólo cumple el contrato de la interfaz.
    void sesionId;
  }

  observarEscriturasPendientes(sesionId: string, onChange: (n: number) => void): Unsubscribe {
    const listeners = this.listenersDe(this.listenersPendientes, sesionId);
    listeners.add(onChange);
    onChange(this.pendientesPorSesion.get(sesionId) ?? 0);
    return () => listeners.delete(onChange);
  }

  observarEscriturasConError(sesionId: string, onChange: (n: number) => void): Unsubscribe {
    const listeners = this.listenersDe(this.listenersError, sesionId);
    listeners.add(onChange);
    onChange(this.fallidosPorSesion.get(sesionId)?.size ?? 0);
    return () => listeners.delete(onChange);
  }

  reintentarEscriturasFallidas(sesionId: string): void {
    const fallidos = this.fallidosPorSesion.get(sesionId);
    if (!fallidos) return;

    for (const categoriaId of fallidos) {
      fallidos.delete(categoriaId);
      this.intentarSincronizar(sesionId, categoriaId, 0);
    }
    this.notificar(this.listenersError, sesionId, fallidos.size);
  }

  uidActual(): string {
    return this.usuario.uid;
  }

  observarAreasActivas(onChange: (areas: Area[]) => void): Unsubscribe {
    onChange([...this.areas.values()].filter((a) => a.activa));
    return () => {};
  }

  async crearCategoriaEnSesion({
    sesionId,
    etiqueta,
    areaId,
    valor,
  }: CrearCategoriaEnSesionPayload): Promise<{ categoriaId: string }> {
    const categoriaId = `cat_fake_${++this.contadorCategoriaId}`;
    this.llamadas.push({
      metodo: "crearCategoriaEnSesion",
      payload: { sesionId, etiqueta, areaId, valor },
    });

    const linea: LineaConteo = {
      categoriaId,
      // D-9/ADR-23: mismo default que crearCategoriaEnSesionImpl — sin
      // `valor` explícito, la línea nace en 0 y el admin la precia después.
      valorUnitario: valor ?? 0,
      etiqueta,
      porArea: {},
      cantidadTotal: 0,
      numAportantes: 0,
      versiones: {},
      actualizadaEn: new Date(),
      actualizadaPor: this.usuario.uid,
      // Mismo criterio que crearCategoriaEnSesionImpl (D-1): la línea copia
      // areaIds del área elegida, ausente si no se eligió ninguna.
      ...(areaId && { areaIds: [areaId] }),
    };
    const lineas = this.lineasDeSesion(sesionId);
    lineas.set(categoriaId, linea);
    this.notificar(this.listenersLineas, sesionId, [...lineas.values()]);

    return { categoriaId };
  }

  // ─────────── helpers privados ───────────

  private lineasDeSesion(sesionId: string): Map<string, LineaConteo> {
    let mapa = this.lineas.get(sesionId);
    if (!mapa) {
      mapa = new Map();
      this.lineas.set(sesionId, mapa);
    }
    return mapa;
  }

  private aportesDeLinea(sesionId: string, categoriaId: string): Map<string, Aporte> {
    let porSesion = this.aportes.get(sesionId);
    if (!porSesion) {
      porSesion = new Map();
      this.aportes.set(sesionId, porSesion);
    }
    let porCategoria = porSesion.get(categoriaId);
    if (!porCategoria) {
      porCategoria = new Map();
      porSesion.set(categoriaId, porCategoria);
    }
    return porCategoria;
  }

  private listenersDe<K, V>(mapa: Map<K, Set<V>>, clave: K): Set<V> {
    let set = mapa.get(clave);
    if (!set) {
      set = new Set();
      mapa.set(clave, set);
    }
    return set;
  }

  private notificar<K, V>(mapa: Map<K, Set<(v: V) => void>>, clave: K, valor: V): void {
    mapa.get(clave)?.forEach((cb) => cb(valor));
  }

  private incrementarPendientes(sesionId: string): void {
    const n = (this.pendientesPorSesion.get(sesionId) ?? 0) + 1;
    this.pendientesPorSesion.set(sesionId, n);
    this.notificar(this.listenersPendientes, sesionId, n);
  }

  private decrementarPendientes(sesionId: string): void {
    const n = Math.max(0, (this.pendientesPorSesion.get(sesionId) ?? 0) - 1);
    this.pendientesPorSesion.set(sesionId, n);
    this.notificar(this.listenersPendientes, sesionId, n);
  }

  /**
   * Issue #41: réplica de la máquina de estados de
   * FirestoreConteoRepository.intentarEscritura, sin temporizadores reales
   * de backoff (ponytail: los tests de UI no dependen de timing exacto) —
   * un rechazo sembrado se resuelve en el siguiente microtask.
   */
  private intentarSincronizar(sesionId: string, categoriaId: string, intento: number): void {
    const clave = `${sesionId}/${categoriaId}`;
    const rechazos = this.rechazosPendientes.get(clave) ?? 0;

    if (rechazos > 0) {
      this.rechazosPendientes.set(clave, rechazos - 1);
      if (intento < MAX_REINTENTOS) {
        void Promise.resolve().then(() =>
          this.intentarSincronizar(sesionId, categoriaId, intento + 1),
        );
        return;
      }
      this.registrarFallo(sesionId, categoriaId);
      return;
    }

    setTimeout(() => {
      this.limpiarFallo(sesionId, categoriaId);
      this.decrementarPendientes(sesionId);
    }, this.retrasoSincronizacionMs);
  }

  private registrarFallo(sesionId: string, categoriaId: string): void {
    const fallidos = this.listenersDe(this.fallidosPorSesion, sesionId);
    fallidos.add(categoriaId);
    this.notificar(this.listenersError, sesionId, fallidos.size);
  }

  private limpiarFallo(sesionId: string, categoriaId: string): void {
    const fallidos = this.fallidosPorSesion.get(sesionId);
    if (!fallidos?.delete(categoriaId)) return; // no-op si no había fallo
    this.notificar(this.listenersError, sesionId, fallidos.size);
  }
}
