// packages/data/src/repositories/admin-repository.ts
// Espejo de conteo-repository.ts (doc 07 §6, docs/plan-panel-administrador.md
// §4): mismo patrón, segundo archivo. Import por submódulo, no por el
// barrel `@conteo/shared` — misma razón que conteo-repository.ts: el barrel
// re-exporta `Config` (config/entorno.ts), que exige el ambient
// `ImportMeta.env` de Vite.
import type { Area } from "@conteo/shared/models/area.js";
import type { CategoriaValor } from "@conteo/shared/models/categoria-valor.js";
import type {
  EventoAuditoria,
  TipoEventoAuditoria,
} from "@conteo/shared/models/evento-auditoria.js";
import type { Historico } from "@conteo/shared/models/historico.js";
import type { LineaConteo } from "@conteo/shared/models/linea-conteo.js";
import type { EstadoSesion, SesionConteo } from "@conteo/shared/models/sesion-conteo.js";
import type { Conectividad, Sucursal } from "@conteo/shared/models/sucursal.js";
import type { RolUsuario, Usuario } from "@conteo/shared/models/usuario.js";

export type Unsubscribe = () => void;

/**
 * Página opaca de resultados. `siguienteCursor` sólo se devuelve al
 * llamador — nunca se interpreta fuera del repositorio (doc plan §4):
 * `FirestoreAdminRepository` guarda ahí un `QueryDocumentSnapshot`,
 * `FakeAdminRepository` un offset numérico. Así `QueryDocumentSnapshot` no
 * se filtra a `apps/web` y no hace falta inventar un esquema de cursores.
 */
export interface Pagina<T> {
  readonly items: readonly T[];
  readonly siguienteCursor: unknown | null;
}

export interface FiltroSesiones {
  readonly sucursalId?: string;
  readonly estado?: EstadoSesion;
}

export type FiltroAuditoria =
  | { readonly campo: "tipo"; readonly valor: TipoEventoAuditoria }
  | { readonly campo: "sucursalId" | "usuarioId" | "sesionId"; readonly valor: string }
  | null; // ponytail: un filtro a la vez — cada combinación exigiría su índice compuesto

export interface EstadoSincronizacion {
  readonly participantes: readonly {
    readonly uid: string;
    readonly nombre: string;
    readonly sincronizado: boolean;
  }[];
  /** `true` cuando no se pudo leer `usuarios/{uid}` para algún participante
   *  (permiso denegado, offline, doc borrado): `participantes` es el
   *  fallback conservador (todos `sincronizado: false`), no la lectura real
   *  — `CierreScreen` debe decirlo, no presentarlo como si fuera el estado
   *  real (doc plan §5, F4). */
  readonly degradado?: boolean;
}

// ── payloads de escritura ──
// Espejo campo a campo de contracts/schemas/*.schema.ts, declarados AQUÍ (no
// importados de `@conteo/contracts`) para que `apps/web` no gane esa
// dependencia — evita un alias nuevo en vite.config.ts y meter zod en el
// bundle del cliente para revalidar lo que la callable ya valida (doc plan §4).

export interface AbrirSesionPayload {
  readonly sucursalId: string;
}

export interface CerrarSesionPayload {
  readonly sesionId: string;
  readonly forzar?: boolean;
}

// Espejo de contracts/schemas/crear-cajero.schema.ts.
export interface CrearCajeroPayload {
  readonly nombre: string;
  readonly correo: string;
  readonly passwordTemporal: string;
  readonly rol: RolUsuario;
  readonly sucursalesAsignadas: readonly string[];
}

// Espejo de contracts/schemas/actualizar-cajero.schema.ts (reemplazo total).
export interface ActualizarCajeroPayload {
  readonly uid: string;
  readonly nombre: string;
  readonly rol: RolUsuario;
  readonly sucursalesAsignadas: readonly string[];
}

// Espejo del cuerpo de crearSucursal descrito en doc plan §3 (callable aún
// sin esquema en contracts/: la trae F2).
export interface CrearSucursalPayload {
  readonly nombre: string;
  readonly direccion: string;
  readonly conectividad: Conectividad;
}

// Reemplazo total, igual que actualizarCajero (doc plan §3): sin
// `sesionAbiertaId`, ese campo pertenece a abrirSesion/cerrarSesion (I-1).
export interface ActualizarSucursalPayload {
  readonly sucursalId: string;
  readonly nombre: string;
  readonly direccion: string;
  readonly conectividad: Conectividad;
  readonly activa: boolean;
}

// Espejo de contracts/schemas/crear-categoria.schema.ts. `sucursalesAsignadas`
// (ticket #39, D6): ausente = categoría global; presente = catálogo "nombrado"
// visible sólo en esas sucursales.
export interface CrearCategoriaPayload {
  readonly etiqueta: string;
  readonly valor: number;
  readonly orden: number;
  readonly sucursalesAsignadas?: readonly string[];
  readonly areaId?: string;
}

// Espejo de contracts/schemas/crear-area.schema.ts.
export interface CrearAreaPayload {
  readonly nombre: string;
}

export interface AdminRepository {
  // ── lecturas en vivo ──
  observarSesionesAbiertas(onChange: (sesiones: SesionConteo[]) => void): Unsubscribe;
  observarSesion(sesionId: string, onChange: (sesion: SesionConteo | null) => void): Unsubscribe;
  observarLineasSesion(sesionId: string, onChange: (lineas: LineaConteo[]) => void): Unsubscribe;
  observarSincronizacion(
    sesionId: string,
    onChange: (estado: EstadoSincronizacion) => void,
  ): Unsubscribe;
  observarUsuarios(onChange: (usuarios: Usuario[]) => void): Unsubscribe;
  /** TODAS las sucursales — a diferencia de `ConteoRepository.observarSucursales`,
   *  el admin no está acotado por el claim `sucursales` (doc plan §4). */
  observarSucursales(onChange: (sucursales: Sucursal[]) => void): Unsubscribe;
  observarCategorias(onChange: (categorias: CategoriaValor[]) => void): Unsubscribe;
  observarAreas(onChange: (areas: Area[]) => void): Unsubscribe;

  // ── paginadas ──
  listarSesiones(filtro: FiltroSesiones, cursor?: unknown): Promise<Pagina<SesionConteo>>;
  listarAuditoria(filtro: FiltroAuditoria, cursor?: unknown): Promise<Pagina<EventoAuditoria>>;

  /**
   * Fan-out N+1 deliberado, una consulta por sucursal (doc plan §4): no
   * existe regla `match /{path=**}/historicos/{id}` ni un solo índice
   * COLLECTION_GROUP, así que `collectionGroup("historicos")` cae en la
   * denegación por defecto de `infra/firestore.rules:134-136` — fallaría
   * SÓLO en producción, nunca en el emulador. No "optimizar" esto a un
   * collectionGroup.
   */
  ultimoHistoricoPorSucursal(
    sucursalIds: readonly string[],
  ): Promise<Map<string, Historico | null>>;

  /**
   * Serie de históricos de UNA sucursal, más reciente primero (doc 10 §5,
   * §6 — "Evolución mensual"): consulta ÚNICA, sin fan-out — a diferencia de
   * `ultimoHistoricoPorSucursal`, aquí la sucursal ya se conoce (la de la
   * sesión analizada). `limite` por defecto 12 (un año de conteos mensuales).
   */
  historicosRecientesPorSucursal(
    sucursalId: string,
    limite?: number,
  ): Promise<readonly Historico[]>;

  // ── escrituras: TODAS vía httpsCallable, ninguna escritura directa a
  // Firestore — las reglas son `if false` en cada ruta que toca el admin. ──
  abrirSesion(payload: AbrirSesionPayload): Promise<{ sesionId: string }>;
  cerrarSesion(payload: CerrarSesionPayload): Promise<{ sesionId: string }>;
  crearCajero(payload: CrearCajeroPayload): Promise<{ uid: string; creado: true }>;
  actualizarCajero(payload: ActualizarCajeroPayload): Promise<{ uid: string; actualizado: true }>;
  desactivarCajero(uid: string): Promise<{ uid: string; desactivado: true }>;
  reactivarCajero(uid: string): Promise<{ uid: string; reactivado: true }>;
  crearSucursal(payload: CrearSucursalPayload): Promise<{ sucursalId: string; creada: true }>;
  actualizarSucursal(
    payload: ActualizarSucursalPayload,
  ): Promise<{ sucursalId: string; actualizada: true }>;
  crearCategoria(payload: CrearCategoriaPayload): Promise<{ categoriaId: string; creada: true }>;
  desactivarCategoria(categoriaId: string): Promise<{ categoriaId: string; desactivada: true }>;
  crearArea(payload: CrearAreaPayload): Promise<{ areaId: string; creada: true }>;
  desactivarArea(areaId: string): Promise<{ areaId: string; desactivada: true }>;
  eliminarCategoria(categoriaId: string): Promise<{ categoriaId: string; eliminada: true }>;
  eliminarArea(areaId: string): Promise<{ areaId: string; eliminada: true }>;
  eliminarCajero(uid: string): Promise<{ uid: string; eliminado: true }>;
  reactivarCategoria(categoriaId: string): Promise<{ categoriaId: string; reactivada: true }>;
  reactivarArea(areaId: string): Promise<{ areaId: string; reactivada: true }>;
}
