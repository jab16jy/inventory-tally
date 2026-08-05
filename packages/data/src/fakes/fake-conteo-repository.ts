// packages/data/src/fakes/fake-conteo-repository.ts — implementación en
// memoria de ConteoRepository (doc 07 §6), para los tests de UI en
// `apps/web` sin tocar el SDK de Firebase ni el emulador.
import { CantidadInvalidaError } from "@conteo/shared/errors.js";
import type { Aporte } from "@conteo/shared/models/aporte.js";
import type { LineaConteo } from "@conteo/shared/models/linea-conteo.js";
import type { SesionConteo } from "@conteo/shared/models/sesion-conteo.js";
import type { Sucursal } from "@conteo/shared/models/sucursal.js";
import type {
  ConteoRepository,
  RegistrarAporteInput,
  Unsubscribe,
} from "../repositories/conteo-repository.js";

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

  private readonly listenersLineas = new Map<string, Set<(l: LineaConteo[]) => void>>();
  private readonly listenersAporte = new Map<string, Set<(a: Aporte | null) => void>>();
  private readonly listenersSesion = new Map<string, Set<(s: SesionConteo | null) => void>>();
  private readonly listenersSesionPorId = new Map<string, Set<(s: SesionConteo | null) => void>>();
  private readonly listenersPendientes = new Map<string, Set<(n: number) => void>>();

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
    onChange: (aporte: Aporte | null) => void,
  ): Unsubscribe {
    const clave = `${sesionId}/${categoriaId}`;
    const listeners = this.listenersDe(this.listenersAporte, clave);
    listeners.add(onChange);
    onChange(this.aportesDeLinea(sesionId, categoriaId).get(this.usuario.uid) ?? null);
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

  async registrarAporte({ sesionId, categoriaId, cantidad }: RegistrarAporteInput): Promise<void> {
    if (cantidad < 0) throw new CantidadInvalidaError("La cantidad no puede ser negativa");

    const aportesLinea = this.aportesDeLinea(sesionId, categoriaId);
    const anterior = aportesLinea.get(this.usuario.uid);
    const delta = cantidad - (anterior?.cantidad ?? 0);
    const eraNuevo = anterior === undefined;

    const aporte: Aporte = {
      uid: this.usuario.uid,
      nombre: this.usuario.nombre,
      cantidad,
      registradoEn: new Date(),
      dispositivoId: "fake-device",
      version: (anterior?.version ?? 0) + 1,
    };
    aportesLinea.set(this.usuario.uid, aporte);
    this.notificar(this.listenersAporte, `${sesionId}/${categoriaId}`, aporte);

    const lineas = this.lineasDeSesion(sesionId);
    const linea = lineas.get(categoriaId);
    if (linea) {
      const actualizada: LineaConteo = {
        ...linea,
        cantidadTotal: linea.cantidadTotal + delta,
        numAportantes: linea.numAportantes + (eraNuevo ? 1 : 0),
        versiones: { ...linea.versiones, [this.usuario.uid]: aporte.version },
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
    setTimeout(() => this.decrementarPendientes(sesionId), this.retrasoSincronizacionMs);
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

  uidActual(): string {
    return this.usuario.uid;
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
}
