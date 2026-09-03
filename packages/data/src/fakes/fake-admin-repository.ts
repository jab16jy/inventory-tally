// packages/data/src/fakes/fake-admin-repository.ts — implementación en
// memoria de AdminRepository (docs/plan-panel-administrador.md §4), espejo
// de fake-conteo-repository.ts para los tests de UI del panel admin en
// `apps/web` sin tocar el SDK de Firebase ni el emulador.
import type { Area } from "@conteo/shared/models/area.js";
import type { CategoriaValor } from "@conteo/shared/models/categoria-valor.js";
import type { EventoAuditoria } from "@conteo/shared/models/evento-auditoria.js";
import type { Historico } from "@conteo/shared/models/historico.js";
import type { LineaConteo } from "@conteo/shared/models/linea-conteo.js";
import type { SesionConteo } from "@conteo/shared/models/sesion-conteo.js";
import type { Sucursal } from "@conteo/shared/models/sucursal.js";
import type { Usuario } from "@conteo/shared/models/usuario.js";
import type {
  AbrirSesionPayload,
  ActualizarAreaPayload,
  ActualizarCajeroPayload,
  ActualizarCategoriaPayload,
  ActualizarSucursalPayload,
  AdminRepository,
  CerrarSesionPayload,
  CrearAreaPayload,
  CrearCajeroPayload,
  CrearCategoriaPayload,
  CrearSucursalPayload,
  EstadoSincronizacion,
  FiltroAuditoria,
  FiltroSesiones,
  Pagina,
  Unsubscribe,
} from "../repositories/admin-repository.js";

export interface OpcionesFakeAdmin {
  /** Tamaño de página de listarSesiones/listarAuditoria — constante en
   *  producción, configurable aquí sólo para poder probar la paginación sin
   *  sembrar decenas de registros (mismo espíritu que
   *  `OpcionesFake.retrasoSincronizacionMs` de FakeConteoRepository). */
  readonly tamanoPagina?: number;
}

/** Un write vía httpsCallable, tal como lo vio el fake. El fake no simula la
 *  lógica de servidor (Auth, transacciones): sólo registra la llamada y
 *  devuelve una respuesta plausible — lo real lo cubre
 *  packages/functions/test. */
export interface LlamadaEscritura {
  readonly metodo: string;
  readonly payload: unknown;
}

const TAMANO_PAGINA_POR_DEFECTO = 20;

export class FakeAdminRepository implements AdminRepository {
  private readonly tamanoPagina: number;

  private readonly sesiones = new Map<string, SesionConteo>();
  private readonly lineas = new Map<string, Map<string, LineaConteo>>();
  private readonly sincronizacion = new Map<string, EstadoSincronizacion>();
  private readonly usuarios = new Map<string, Usuario>();
  private readonly sucursales = new Map<string, Sucursal>();
  private readonly categorias = new Map<string, CategoriaValor>();
  private readonly areas = new Map<string, Area>();
  private readonly auditoria: EventoAuditoria[] = [];
  private readonly historicos = new Map<string, Historico[]>();

  private readonly listenersSesionesAbiertas = new Set<(s: SesionConteo[]) => void>();
  private readonly listenersSesion = new Map<string, Set<(s: SesionConteo | null) => void>>();
  private readonly listenersLineas = new Map<string, Set<(l: LineaConteo[]) => void>>();
  private readonly listenersSincronizacion = new Map<
    string,
    Set<(e: EstadoSincronizacion) => void>
  >();
  private readonly listenersUsuarios = new Set<(u: Usuario[]) => void>();
  private readonly listenersSucursales = new Set<(s: Sucursal[]) => void>();
  private readonly listenersCategorias = new Set<(c: CategoriaValor[]) => void>();
  private readonly listenersAreas = new Set<(a: Area[]) => void>();

  readonly llamadas: LlamadaEscritura[] = [];

  constructor(opciones: OpcionesFakeAdmin = {}) {
    this.tamanoPagina = opciones.tamanoPagina ?? TAMANO_PAGINA_POR_DEFECTO;
  }

  // ─────────── siembra para tests ───────────

  sembrarSesion(sesion: SesionConteo): void {
    this.sesiones.set(sesion.sesionId, sesion);
    this.notificar(this.listenersSesion, sesion.sesionId, sesion);
    this.emitirSesionesAbiertas();
  }

  sembrarLinea(sesionId: string, linea: LineaConteo): void {
    this.lineasDeSesion(sesionId).set(linea.categoriaId, linea);
    this.notificar(this.listenersLineas, sesionId, [...this.lineasDeSesion(sesionId).values()]);
  }

  sembrarSincronizacion(sesionId: string, estado: EstadoSincronizacion): void {
    this.sincronizacion.set(sesionId, estado);
    this.notificar(this.listenersSincronizacion, sesionId, estado);
  }

  sembrarUsuario(usuario: Usuario): void {
    this.usuarios.set(usuario.uid, usuario);
    this.emitirUsuarios();
  }

  sembrarSucursal(sucursal: Sucursal): void {
    this.sucursales.set(sucursal.sucursalId, sucursal);
    this.emitirSucursales();
  }

  sembrarCategoria(categoria: CategoriaValor): void {
    this.categorias.set(categoria.categoriaId, categoria);
    this.emitirCategorias();
  }

  sembrarArea(area: Area): void {
    this.areas.set(area.areaId, area);
    this.emitirAreas();
  }

  sembrarAuditoria(evento: EventoAuditoria): void {
    this.auditoria.push(evento);
  }

  sembrarHistorico(sucursalId: string, historico: Historico): void {
    this.historicos.set(sucursalId, [...(this.historicos.get(sucursalId) ?? []), historico]);
  }

  // ─────────── AdminRepository — lecturas en vivo ───────────

  observarSesionesAbiertas(onChange: (sesiones: SesionConteo[]) => void): Unsubscribe {
    this.listenersSesionesAbiertas.add(onChange);
    onChange(this.sesionesAbiertasOrdenadas());
    return () => this.listenersSesionesAbiertas.delete(onChange);
  }

  observarSesion(sesionId: string, onChange: (sesion: SesionConteo | null) => void): Unsubscribe {
    const listeners = this.listenersDe(this.listenersSesion, sesionId);
    listeners.add(onChange);
    onChange(this.sesiones.get(sesionId) ?? null);
    return () => listeners.delete(onChange);
  }

  observarLineasSesion(sesionId: string, onChange: (lineas: LineaConteo[]) => void): Unsubscribe {
    const listeners = this.listenersDe(this.listenersLineas, sesionId);
    listeners.add(onChange);
    onChange([...this.lineasDeSesion(sesionId).values()]);
    return () => listeners.delete(onChange);
  }

  observarSincronizacion(
    sesionId: string,
    onChange: (estado: EstadoSincronizacion) => void,
  ): Unsubscribe {
    const listeners = this.listenersDe(this.listenersSincronizacion, sesionId);
    listeners.add(onChange);
    onChange(this.sincronizacion.get(sesionId) ?? { participantes: [] });
    return () => listeners.delete(onChange);
  }

  observarUsuarios(onChange: (usuarios: Usuario[]) => void): Unsubscribe {
    this.listenersUsuarios.add(onChange);
    onChange(this.usuariosOrdenados());
    return () => this.listenersUsuarios.delete(onChange);
  }

  observarSucursales(onChange: (sucursales: Sucursal[]) => void): Unsubscribe {
    this.listenersSucursales.add(onChange);
    onChange([...this.sucursales.values()]);
    return () => this.listenersSucursales.delete(onChange);
  }

  observarCategorias(onChange: (categorias: CategoriaValor[]) => void): Unsubscribe {
    this.listenersCategorias.add(onChange);
    onChange(this.categoriasOrdenadas());
    return () => this.listenersCategorias.delete(onChange);
  }

  observarAreas(onChange: (areas: Area[]) => void): Unsubscribe {
    this.listenersAreas.add(onChange);
    onChange(this.areasOrdenadas());
    return () => this.listenersAreas.delete(onChange);
  }

  // ─────────── AdminRepository — paginadas ───────────

  async listarSesiones(filtro: FiltroSesiones, cursor?: unknown): Promise<Pagina<SesionConteo>> {
    const filtradas = [...this.sesiones.values()]
      .filter((s) => (filtro.sucursalId ? s.sucursalId === filtro.sucursalId : true))
      .filter((s) => (filtro.estado ? s.estado === filtro.estado : true))
      .sort((a, b) => b.abiertaEn.getTime() - a.abiertaEn.getTime());
    return this.paginar(filtradas, cursor);
  }

  async listarAuditoria(
    filtro: FiltroAuditoria,
    cursor?: unknown,
  ): Promise<Pagina<EventoAuditoria>> {
    const filtrados = this.auditoria
      .filter((e) => (filtro ? e[filtro.campo] === filtro.valor : true))
      .sort((a, b) => b.ocurridoEn.getTime() - a.ocurridoEn.getTime());
    return this.paginar(filtrados, cursor);
  }

  async ultimoHistoricoPorSucursal(
    sucursalIds: readonly string[],
  ): Promise<Map<string, Historico | null>> {
    return new Map(sucursalIds.map((id) => [id, this.historicosOrdenados(id).at(0) ?? null]));
  }

  async historicosRecientesPorSucursal(
    sucursalId: string,
    limite = 12,
  ): Promise<readonly Historico[]> {
    return this.historicosOrdenados(sucursalId).slice(0, limite);
  }

  // ─────────── AdminRepository — escrituras (registran la llamada) ───────────

  async abrirSesion(payload: AbrirSesionPayload): Promise<{ sesionId: string }> {
    this.registrar("abrirSesion", payload);
    return { sesionId: "ses_fake" };
  }

  async cerrarSesion(payload: CerrarSesionPayload): Promise<{ sesionId: string }> {
    this.registrar("cerrarSesion", payload);
    return { sesionId: payload.sesionId };
  }

  async crearCajero(payload: CrearCajeroPayload): Promise<{ uid: string; creado: true }> {
    this.registrar("crearCajero", payload);
    return { uid: "uid_fake", creado: true };
  }

  async actualizarCajero(
    payload: ActualizarCajeroPayload,
  ): Promise<{ uid: string; actualizado: true }> {
    this.registrar("actualizarCajero", payload);
    return { uid: payload.uid, actualizado: true };
  }

  async desactivarCajero(uid: string): Promise<{ uid: string; desactivado: true }> {
    this.registrar("desactivarCajero", { uid });
    return { uid, desactivado: true };
  }

  async reactivarCajero(uid: string): Promise<{ uid: string; reactivado: true }> {
    this.registrar("reactivarCajero", { uid });
    return { uid, reactivado: true };
  }

  async crearSucursal(
    payload: CrearSucursalPayload,
  ): Promise<{ sucursalId: string; creada: true }> {
    this.registrar("crearSucursal", payload);
    return { sucursalId: "suc_fake", creada: true };
  }

  async actualizarSucursal(
    payload: ActualizarSucursalPayload,
  ): Promise<{ sucursalId: string; actualizada: true }> {
    this.registrar("actualizarSucursal", payload);
    return { sucursalId: payload.sucursalId, actualizada: true };
  }

  async crearCategoria(
    payload: CrearCategoriaPayload,
  ): Promise<{ categoriaId: string; creada: true }> {
    this.registrar("crearCategoria", payload);
    return { categoriaId: "cat_fake", creada: true };
  }

  async actualizarCategoria(
    payload: ActualizarCategoriaPayload,
  ): Promise<{ categoriaId: string; actualizada: true }> {
    this.registrar("actualizarCategoria", payload);
    return { categoriaId: payload.categoriaId, actualizada: true };
  }

  async desactivarCategoria(
    categoriaId: string,
  ): Promise<{ categoriaId: string; desactivada: true }> {
    this.registrar("desactivarCategoria", { categoriaId });
    return { categoriaId, desactivada: true };
  }

  async crearArea(payload: CrearAreaPayload): Promise<{ areaId: string; creada: true }> {
    this.registrar("crearArea", payload);
    return { areaId: "area_fake", creada: true };
  }

  async actualizarArea(
    payload: ActualizarAreaPayload,
  ): Promise<{ areaId: string; actualizada: true }> {
    this.registrar("actualizarArea", payload);
    return { areaId: payload.areaId, actualizada: true };
  }

  async desactivarArea(areaId: string): Promise<{ areaId: string; desactivada: true }> {
    this.registrar("desactivarArea", { areaId });
    return { areaId, desactivada: true };
  }

  async eliminarCategoria(categoriaId: string): Promise<{ categoriaId: string; eliminada: true }> {
    this.registrar("eliminarCategoria", { categoriaId });
    return { categoriaId, eliminada: true };
  }

  async eliminarArea(areaId: string): Promise<{ areaId: string; eliminada: true }> {
    this.registrar("eliminarArea", { areaId });
    return { areaId, eliminada: true };
  }

  async eliminarCajero(uid: string): Promise<{ uid: string; eliminado: true }> {
    this.registrar("eliminarCajero", { uid });
    return { uid, eliminado: true };
  }

  async reactivarCategoria(
    categoriaId: string,
  ): Promise<{ categoriaId: string; reactivada: true }> {
    this.registrar("reactivarCategoria", { categoriaId });
    return { categoriaId, reactivada: true };
  }

  async reactivarArea(areaId: string): Promise<{ areaId: string; reactivada: true }> {
    this.registrar("reactivarArea", { areaId });
    return { areaId, reactivada: true };
  }

  // ─────────── helpers privados ───────────

  private registrar(metodo: string, payload: unknown): void {
    this.llamadas.push({ metodo, payload });
  }

  private paginar<T>(ordenados: readonly T[], cursor: unknown): Pagina<T> {
    const offset = typeof cursor === "number" ? cursor : 0;
    const items = ordenados.slice(offset, offset + this.tamanoPagina);
    const hayMas = offset + items.length < ordenados.length;
    return { items, siguienteCursor: hayMas ? offset + items.length : null };
  }

  private sesionesAbiertasOrdenadas(): SesionConteo[] {
    return [...this.sesiones.values()]
      .filter((s) => s.estado === "abierta")
      .sort((a, b) => b.abiertaEn.getTime() - a.abiertaEn.getTime());
  }

  private usuariosOrdenados(): Usuario[] {
    return [...this.usuarios.values()].sort((a, b) => a.nombre.localeCompare(b.nombre));
  }

  private categoriasOrdenadas(): CategoriaValor[] {
    return [...this.categorias.values()].sort((a, b) => a.orden - b.orden);
  }

  private areasOrdenadas(): Area[] {
    return [...this.areas.values()].sort((a, b) => a.nombre.localeCompare(b.nombre));
  }

  /** Serie de una sucursal ordenada por `cerradaEn` desc — no asume orden de
   *  inserción de `sembrarHistorico` (los tests siembran fuera de orden a
   *  propósito). */
  private historicosOrdenados(sucursalId: string): Historico[] {
    return [...(this.historicos.get(sucursalId) ?? [])].sort(
      (a, b) => b.cerradaEn.getTime() - a.cerradaEn.getTime(),
    );
  }

  private lineasDeSesion(sesionId: string): Map<string, LineaConteo> {
    let mapa = this.lineas.get(sesionId);
    if (!mapa) {
      mapa = new Map();
      this.lineas.set(sesionId, mapa);
    }
    return mapa;
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

  private emitirSesionesAbiertas(): void {
    const valor = this.sesionesAbiertasOrdenadas();
    this.listenersSesionesAbiertas.forEach((cb) => cb(valor));
  }

  private emitirUsuarios(): void {
    const valor = this.usuariosOrdenados();
    this.listenersUsuarios.forEach((cb) => cb(valor));
  }

  private emitirSucursales(): void {
    const valor = [...this.sucursales.values()];
    this.listenersSucursales.forEach((cb) => cb(valor));
  }

  private emitirCategorias(): void {
    const valor = this.categoriasOrdenadas();
    this.listenersCategorias.forEach((cb) => cb(valor));
  }

  private emitirAreas(): void {
    const valor = this.areasOrdenadas();
    this.listenersAreas.forEach((cb) => cb(valor));
  }
}
