// packages/data/src/repositories/conteo-repository.ts (doc 07 §6)
// Import por submódulo, no por el barrel `@conteo/shared`: el barrel
// re-exporta `Config` (config/entorno.ts), que exige el ambient
// `ImportMeta.env` de Vite — innecesario aquí y fuera del alcance de esta
// ola tocar `packages/shared` para exponerlo en este programa de TS.
import type { Area } from "@conteo/shared/models/area.js";
import type { Aporte, Partida } from "@conteo/shared/models/aporte.js";
import type { LineaConteo } from "@conteo/shared/models/linea-conteo.js";
import type { SesionConteo } from "@conteo/shared/models/sesion-conteo.js";
import type { Sucursal } from "@conteo/shared/models/sucursal.js";
// `Pagina<T>` vive en admin-repository.ts (mismo paquete `packages/data`):
// import cruzado en vez de duplicar el tipo — es el mismo contrato de
// paginación con cursor opaco (ver su doc ahí).
import type { Pagina } from "./admin-repository.js";

export type Unsubscribe = () => void;

export interface RegistrarAporteInput {
  readonly sesionId: string;
  readonly categoriaId: string;
  /** Área activa del contador al aportar (ADR-23) — parte de la clave del
   *  documento (`{uid}__{areaId}`, infra/firestore.rules:74-80). */
  readonly areaId: string;
  readonly cantidad: number;
  /** Ledger de tandas agrupadas (ADR-24). Ausente = toque suelto del
   *  stepper: no crea una tanda nueva en `Aporte.partidas`. */
  readonly partidas?: readonly Partida[];
}

// ── payloads de catálogo-en-conteo ──
// Declarados AQUÍ, no importados de `@conteo/contracts` — mismo criterio que
// admin-repository.ts: `apps/web` no gana la dependencia de zod (fuera del
// bundle del cliente, que ya revalida la callable) ni un alias nuevo en
// vite.config.ts.

export interface CrearCategoriaEnSesionPayload {
  readonly sesionId: string;
  readonly etiqueta: string;
  readonly areaId?: string;
  /** Precio opcional que el cajero conoce al crear el producto (D-9, ADR-23).
   *  Sin él, el servidor sigue escribiendo `valor: 0`. */
  readonly valor?: number;
}

export interface ConteoRepository {
  observarLineas(sesionId: string, onChange: (lineas: LineaConteo[]) => void): Unsubscribe;

  /** `areaId` es el área activa del contador (ADR-23): el documento vive en
   *  `aportes/{uid}__{areaId}`, así que sin ella no hay id de documento que
   *  observar. */
  observarMiAporte(
    sesionId: string,
    categoriaId: string,
    areaId: string,
    onChange: (aporte: Aporte | null) => void,
  ): Unsubscribe;

  observarSesionAbierta(
    sucursalId: string,
    onChange: (sesion: SesionConteo | null) => void,
  ): Unsubscribe;

  /**
   * Observa UNA sesión por `sesionId` — al revés de `observarSesionAbierta`,
   * que necesita el `sucursalId` y no sirve para esto (F4-A1). Es la ruta de
   * escalamiento que ya nombraba el `ponytail:` de `PrepararScreen.tsx`, y la
   * única forma de detectar "sesión cerrada por el admin" (doc 11 §5:
   * `estado != 'abierta'`) desde la pantalla de conteo, que sólo tiene el
   * `sesionId` de la ruta.
   */
  observarSesion(sesionId: string, onChange: (sesion: SesionConteo | null) => void): Unsubscribe;

  /**
   * Observa las sucursales asignadas al cajero activo. `sucursalIds` entra
   * por parámetro — no lo resuelve el repositorio — porque la fuente real
   * es el custom claim `request.auth.token.sucursales`
   * (`infra/firestore.rules:16`, `tools/seed.ts:41`), y este repositorio
   * está deliberadamente desacoplado de `firebase/auth` (ver `uidActual()`
   * más abajo: mismo principio, misma razón). Quien construye el
   * repositorio no conoce los claims; quien renderiza la pantalla sí.
   */
  observarSucursales(
    sucursalIds: readonly string[],
    onChange: (sucursales: Sucursal[]) => void,
  ): Unsubscribe;

  /**
   * Sesiones en las que participó el cajero activo, de la más reciente a la
   * más antigua. El uid NO entra por parámetro: sale de `uidActual()`, igual
   * que en `observarMiAporte` — cada implementación ya conoce su propio
   * usuario. `sucursalIds` SÍ entra por parámetro, por la misma razón que en
   * `observarSucursales`: la fuente real es el claim
   * `request.auth.token.sucursales` y este repositorio está deliberadamente
   * desacoplado de `firebase/auth`.
   *
   * Ese `sucursalIds` no es un filtro de conveniencia, es OBLIGATORIO.
   * `infra/firestore.rules` concede `allow read` sobre `sesiones/{sesionId}`
   * sólo si `tieneSucursal(resource.data.sucursalId)`, y Firestore evalúa esa
   * condición contra la query ENTERA, no fila por fila: basta con que el
   * cajero haya participado alguna vez en una sucursal que ya no tiene
   * asignada (una reasignación vía `actualizarCajero`) para que, sin la
   * cláusula `in`, se deniegue la consulta completa en vez de ocultar esa
   * sola fila.
   */
  listarMisSesiones(
    sucursalIds: readonly string[],
    cursor?: unknown,
  ): Promise<Pagina<SesionConteo>>;

  /** Registra o corrige el aporte propio. NUNCA escribe totales. */
  registrarAporte(input: RegistrarAporteInput): Promise<void>;

  /** Marca al usuario como sincronizado (RF-16). Sólo si no hay pendientes. */
  confirmarSincronizacion(sesionId: string): Promise<void>;

  /** Escrituras aún no confirmadas por el servidor. */
  observarEscriturasPendientes(sesionId: string, onChange: (n: number) => void): Unsubscribe;

  /** Escrituras que agotaron sus reintentos automáticos y siguen sin confirmarse. */
  observarEscriturasConError(sesionId: string, onChange: (n: number) => void): Unsubscribe;

  /** Reintenta manualmente las escrituras que quedaron marcadas con error. */
  reintentarEscriturasFallidas(sesionId: string): void;

  /**
   * uid del cajero activo. Síncrono y sin suscripción propia — a diferencia
   * del resto de la interfaz, no cambia mientras dura la sesión de la
   * pantalla. Existe para que `ConteoScreen` pueda leer
   * `LineaConteo.versiones[uid]` (progreso, filtro "sólo pendientes", avance
   * del teclado) sin importar `firebase/auth` directamente: cada
   * implementación ya conocía su propio uid por dentro
   * (`FirestoreConteoRepository.usuario.obtenerUid()`,
   * `FakeConteoRepository.usuario.uid`), esto sólo lo expone.
   */
  uidActual(): string;

  /**
   * Áreas activas, para que el cajero elija a cuál vincular una categoría
   * dentro de su conteo abierto. Dos hechos verificables:
   *  (a) `areas` es `read: if autenticado()` en `infra/firestore.rules:52` —
   *      el cajero las lee directo, no necesita `AdminRepository`.
   *  (b) el filtro `activa` va EN MEMORIA, no con `where()`: son decenas de
   *      documentos y `where("activa","==",true) + orderBy("nombre")`
   *      pediría un índice compuesto nuevo.
   * // ponytail: filtro en memoria, techo decenas de áreas — pasar a
   * // `where()` + índice si la colección crece a cientos.
   */
  observarAreasActivas(onChange: (areas: Area[]) => void): Unsubscribe;

  /** Crea una categoría nueva desde el conteo del cajero y siembra su línea
   *  en la sesión. Escribe vía callable — `sesiones/*\/lineas` es `write: if false`. */
  crearCategoriaEnSesion(payload: CrearCategoriaEnSesionPayload): Promise<{ categoriaId: string }>;
}
