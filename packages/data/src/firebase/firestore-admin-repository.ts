// packages/data/src/firebase/firestore-admin-repository.ts
// (docs/plan-panel-administrador.md §4)
//
// Test en firestore-admin-repository.test.ts, mismo patrón que
// firestore-conteo-repository.test.ts (vi.mock("firebase/firestore")):
// cubre lo que tiene lógica propia (el predicado RF-16, la paginación con
// cursor opaco, el fan-out de históricos, el ruteo de escrituras). Los
// `observar*` que son un onSnapshot + mapper sin ramas quedan sin test propio
// aquí — es una decisión deliberada; cada mapper que usa este archivo
// (incluidos usuarioDesdeDoc, categoriaValorDesdeDoc y
// eventoAuditoriaDesdeDoc) sí tiene su propio caso en mappers.test.ts.
import type { Functions } from "firebase/functions";
import { httpsCallable } from "firebase/functions";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  startAfter,
  where,
  type Firestore,
  type Query,
  type QueryDocumentSnapshot,
  type Timestamp,
} from "firebase/firestore";
import type { Area } from "@conteo/shared/models/area.js";
import type { CategoriaValor } from "@conteo/shared/models/categoria-valor.js";
import type { EventoAuditoria } from "@conteo/shared/models/evento-auditoria.js";
import type { Historico } from "@conteo/shared/models/historico.js";
import type { LineaConteo } from "@conteo/shared/models/linea-conteo.js";
import type { SesionConteo } from "@conteo/shared/models/sesion-conteo.js";
import type { Sucursal } from "@conteo/shared/models/sucursal.js";
import type { Usuario } from "@conteo/shared/models/usuario.js";
import { participanteSincronizado } from "@conteo/shared/services/sincronizacion.js";
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
import {
  areaDesdeDoc,
  categoriaValorDesdeDoc,
  eventoAuditoriaDesdeDoc,
  historicoDesdeDoc,
  lineaConteoDesdeDoc,
  sesionConteoDesdeDoc,
  sucursalDesdeDoc,
  usuarioDesdeDoc,
} from "./mappers.js";

const TAMANO_PAGINA = 20; // límite de página de listarSesiones/listarAuditoria (doc plan §4)
const LIMITE_SERIE_POR_DEFECTO = 12; // un año de conteos mensuales (doc 10 §6)

interface EntradaSincronizacionDoc {
  readonly confirmadoEn?: Timestamp | null;
  readonly ultimoAporteServidor?: Timestamp | null;
}

export class FirestoreAdminRepository implements AdminRepository {
  constructor(
    private readonly db: Firestore,
    private readonly functions: Functions,
  ) {}

  // ─────────── lecturas en vivo ───────────

  observarSesionesAbiertas(onChange: (sesiones: SesionConteo[]) => void): Unsubscribe {
    // Índice existente sucursalId/estado/abiertaEn no hace falta aquí: sólo
    // filtra por estado, campo único autoindexado (doc plan §2).
    const q = query(
      collection(this.db, "sesiones"),
      where("estado", "==", "abierta"),
      orderBy("abiertaEn", "desc"),
    );
    return onSnapshot(q, (snap) => {
      onChange(snap.docs.map((d) => sesionConteoDesdeDoc(d.id, d.data() as never)));
    });
  }

  observarSesion(sesionId: string, onChange: (sesion: SesionConteo | null) => void): Unsubscribe {
    const ref = doc(this.db, "sesiones", sesionId);
    return onSnapshot(ref, (snap) => {
      onChange(snap.exists() ? sesionConteoDesdeDoc(sesionId, snap.data() as never) : null);
    });
  }

  observarLineasSesion(sesionId: string, onChange: (lineas: LineaConteo[]) => void): Unsubscribe {
    const ref = collection(this.db, "sesiones", sesionId, "lineas");
    return onSnapshot(ref, (snap) => {
      onChange(snap.docs.map((d) => lineaConteoDesdeDoc(d.id, d.data() as never)));
    });
  }

  /**
   * El predicado de "sincronizado" es `participanteSincronizado` de
   * `@conteo/shared/services/sincronizacion.js` (RF-16), NO re-derivado —
   * mismo predicado que usa `verificarSincronizacion` en
   * packages/functions/src/lib/sincronizacion.ts. Los nombres no viven en
   * `sincronizacion/estado` (sólo uids): un `getDoc`
   * por participante contra `usuarios` en cada snapshot, igual de acotado
   * que el fan-out de `ultimoHistoricoPorSucursal` (participantes de una
   * sesión, no toda la colección).
   */
  observarSincronizacion(
    sesionId: string,
    onChange: (estado: EstadoSincronizacion) => void,
  ): Unsubscribe {
    const ref = doc(this.db, "sesiones", sesionId, "sincronizacion", "estado");
    return onSnapshot(ref, (snap) => {
      const entradas =
        (snap.data()?.participantes as Record<string, EntradaSincronizacionDoc> | undefined) ?? {};
      const uids = Object.keys(entradas);

      if (uids.length === 0) {
        onChange({ participantes: [] });
        return;
      }

      void Promise.all(uids.map((uid) => getDoc(doc(this.db, "usuarios", uid)))).then(
        (usuarioSnaps) => {
          const participantes = uids.map((uid, indice) => {
            const nombre = (usuarioSnaps[indice]?.data()?.nombre as string | undefined) ?? uid;
            const entrada = entradas[uid];
            const sincronizado = participanteSincronizado(
              entrada?.confirmadoEn?.toMillis() ?? null,
              entrada?.ultimoAporteServidor?.toMillis() ?? null,
            );
            return { uid, nombre, sincronizado };
          });
          onChange({ participantes });
        },
        () => {
          // Un `getDoc(usuarios/{uid})` rechazó (permiso denegado, offline,
          // doc borrado): se falla cerrado, mismo criterio conservador que
          // `verificarSincronizacion` en
          // packages/functions/src/lib/sincronizacion.ts ("un participante
          // ausente se trata como sin sincronizar"). NUNCA `participantes: []`
          // aquí — una lista vacía habilitaría "Cerrar conteo" sobre un
          // estado que en realidad no se pudo leer.
          onChange({
            participantes: uids.map((uid) => ({ uid, nombre: uid, sincronizado: false })),
            degradado: true,
          });
        },
      );
    });
  }

  observarUsuarios(onChange: (usuarios: Usuario[]) => void): Unsubscribe {
    const q = query(collection(this.db, "usuarios"), orderBy("nombre"));
    return onSnapshot(q, (snap) => {
      onChange(snap.docs.map((d) => usuarioDesdeDoc(d.id, d.data() as never)));
    });
  }

  observarSucursales(onChange: (sucursales: Sucursal[]) => void): Unsubscribe {
    // Colección completa, sin filtro: tieneSucursal() corta en esAdmin()
    // (infra/firestore.rules:16), así que este query SÍ pasa reglas para un
    // admin (doc plan §2) — a diferencia de ConteoRepository.observarSucursales,
    // que no puede usar una query de colección para un cajero.
    const q = query(collection(this.db, "sucursales"), orderBy("nombre"));
    return onSnapshot(q, (snap) => {
      onChange(snap.docs.map((d) => sucursalDesdeDoc(d.id, d.data() as never)));
    });
  }

  observarCategorias(onChange: (categorias: CategoriaValor[]) => void): Unsubscribe {
    const q = query(collection(this.db, "categoriasValor"), orderBy("orden"));
    return onSnapshot(q, (snap) => {
      onChange(snap.docs.map((d) => categoriaValorDesdeDoc(d.id, d.data() as never)));
    });
  }

  observarAreas(onChange: (areas: Area[]) => void): Unsubscribe {
    // Sin campo `orden` (a diferencia de categoriasValor): ordena por nombre.
    const q = query(collection(this.db, "areas"), orderBy("nombre"));
    return onSnapshot(q, (snap) => {
      onChange(snap.docs.map((d) => areaDesdeDoc(d.id, d.data() as never)));
    });
  }

  // ─────────── paginadas ───────────

  async listarSesiones(filtro: FiltroSesiones, cursor?: unknown): Promise<Pagina<SesionConteo>> {
    const clausulas = [
      ...(filtro.sucursalId ? [where("sucursalId", "==", filtro.sucursalId)] : []),
      ...(filtro.estado ? [where("estado", "==", filtro.estado)] : []),
    ];
    const base = query(collection(this.db, "sesiones"), ...clausulas, orderBy("abiertaEn", "desc"));
    return this.paginar(base, cursor, (d) => sesionConteoDesdeDoc(d.id, d.data() as never));
  }

  async listarAuditoria(
    filtro: FiltroAuditoria,
    cursor?: unknown,
  ): Promise<Pagina<EventoAuditoria>> {
    const clausulas = filtro ? [where(filtro.campo, "==", filtro.valor)] : [];
    const base = query(
      collection(this.db, "auditoria"),
      ...clausulas,
      orderBy("ocurridoEn", "desc"),
    );
    return this.paginar(base, cursor, (d) => eventoAuditoriaDesdeDoc(d.id, d.data()));
  }

  /**
   * Fan-out N+1 DELIBERADO, una consulta por sucursal: no hay regla
   * `match /{path=**}/historicos/{id}` ni un índice COLLECTION_GROUP en
   * infra/, así que `collectionGroup("historicos")` cae en la denegación
   * por defecto (infra/firestore.rules:134-136) — fallaría SÓLO en
   * producción, nunca en el emulador (donde el modo abierto/reglas de
   * desarrollo pueden ocultar el problema). No "optimizar" a collectionGroup.
   */
  async ultimoHistoricoPorSucursal(
    sucursalIds: readonly string[],
  ): Promise<Map<string, Historico | null>> {
    const entradas = await Promise.all(
      sucursalIds.map(async (sucursalId) => {
        const q = query(
          collection(this.db, "sucursales", sucursalId, "historicos"),
          orderBy("cerradaEn", "desc"),
          limit(1),
        );
        const snap = await getDocs(q);
        const primero = snap.docs[0];
        return [sucursalId, primero ? historicoDesdeDoc(primero.data() as never) : null] as const;
      }),
    );
    return new Map(entradas);
  }

  /** Consulta ÚNICA por un solo campo (`cerradaEn`): no requiere índice
   *  nuevo, a diferencia del fan-out N+1 de `ultimoHistoricoPorSucursal`. */
  async historicosRecientesPorSucursal(
    sucursalId: string,
    limite = LIMITE_SERIE_POR_DEFECTO,
  ): Promise<readonly Historico[]> {
    const q = query(
      collection(this.db, "sucursales", sucursalId, "historicos"),
      orderBy("cerradaEn", "desc"),
      limit(limite),
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => historicoDesdeDoc(d.data() as never));
  }

  // ─────────── escrituras: TODAS vía httpsCallable ───────────

  async abrirSesion(payload: AbrirSesionPayload): Promise<{ sesionId: string }> {
    return this.llamar("abrirSesion", payload);
  }

  async cerrarSesion(payload: CerrarSesionPayload): Promise<{ sesionId: string }> {
    return this.llamar("cerrarSesion", payload);
  }

  async crearCajero(payload: CrearCajeroPayload): Promise<{ uid: string; creado: true }> {
    return this.llamar("crearCajero", payload);
  }

  async actualizarCajero(
    payload: ActualizarCajeroPayload,
  ): Promise<{ uid: string; actualizado: true }> {
    return this.llamar("actualizarCajero", payload);
  }

  async desactivarCajero(uid: string): Promise<{ uid: string; desactivado: true }> {
    return this.llamar("desactivarCajero", { uid });
  }

  async reactivarCajero(uid: string): Promise<{ uid: string; reactivado: true }> {
    return this.llamar("reactivarCajero", { uid });
  }

  async crearSucursal(
    payload: CrearSucursalPayload,
  ): Promise<{ sucursalId: string; creada: true }> {
    return this.llamar("crearSucursal", payload);
  }

  async actualizarSucursal(
    payload: ActualizarSucursalPayload,
  ): Promise<{ sucursalId: string; actualizada: true }> {
    return this.llamar("actualizarSucursal", payload);
  }

  async crearCategoria(
    payload: CrearCategoriaPayload,
  ): Promise<{ categoriaId: string; creada: true }> {
    return this.llamar("crearCategoria", payload);
  }

  async actualizarCategoria(
    payload: ActualizarCategoriaPayload,
  ): Promise<{ categoriaId: string; actualizada: true }> {
    return this.llamar("actualizarCategoria", payload);
  }

  async desactivarCategoria(
    categoriaId: string,
  ): Promise<{ categoriaId: string; desactivada: true }> {
    return this.llamar("desactivarCategoria", { categoriaId });
  }

  async crearArea(payload: CrearAreaPayload): Promise<{ areaId: string; creada: true }> {
    return this.llamar("crearArea", payload);
  }

  async actualizarArea(
    payload: ActualizarAreaPayload,
  ): Promise<{ areaId: string; actualizada: true }> {
    return this.llamar("actualizarArea", payload);
  }

  async desactivarArea(areaId: string): Promise<{ areaId: string; desactivada: true }> {
    return this.llamar("desactivarArea", { areaId });
  }

  async eliminarCategoria(categoriaId: string): Promise<{ categoriaId: string; eliminada: true }> {
    return this.llamar("eliminarCategoria", { categoriaId });
  }

  async eliminarArea(areaId: string): Promise<{ areaId: string; eliminada: true }> {
    return this.llamar("eliminarArea", { areaId });
  }

  async eliminarCajero(uid: string): Promise<{ uid: string; eliminado: true }> {
    return this.llamar("eliminarCajero", { uid });
  }

  async reactivarCategoria(
    categoriaId: string,
  ): Promise<{ categoriaId: string; reactivada: true }> {
    return this.llamar("reactivarCategoria", { categoriaId });
  }

  async reactivarArea(areaId: string): Promise<{ areaId: string; reactivada: true }> {
    return this.llamar("reactivarArea", { areaId });
  }

  // ─────────── helpers privados ───────────

  private async llamar<Entrada, Salida>(nombre: string, payload: Entrada): Promise<Salida> {
    const llamada = httpsCallable<Entrada, Salida>(this.functions, nombre);
    const resultado = await llamada(payload);
    return resultado.data;
  }

  private async paginar<T>(
    base: Query,
    cursor: unknown,
    mapear: (doc: QueryDocumentSnapshot) => T,
  ): Promise<Pagina<T>> {
    const acotada = cursor
      ? query(base, startAfter(cursor as QueryDocumentSnapshot), limit(TAMANO_PAGINA))
      : query(base, limit(TAMANO_PAGINA));
    const snap = await getDocs(acotada);
    const siguienteCursor = snap.docs.length === TAMANO_PAGINA ? (snap.docs.at(-1) ?? null) : null;
    return { items: snap.docs.map(mapear), siguienteCursor };
  }
}
