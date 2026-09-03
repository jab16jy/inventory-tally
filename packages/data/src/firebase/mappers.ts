// packages/data/src/firebase/mappers.ts — únicos puntos del sistema que
// convierten tipos de Firestore (Timestamp) a los tipos de dominio de
// `packages/shared` (doc 07 §2/§6: shared no puede importar Firebase).
import type { DocumentData, Timestamp } from "firebase/firestore";
import type { Aporte } from "@conteo/shared/models/aporte.js";
import type { Area } from "@conteo/shared/models/area.js";
import type { CategoriaValor } from "@conteo/shared/models/categoria-valor.js";
import type { EventoAuditoria } from "@conteo/shared/models/evento-auditoria.js";
import type { Historico } from "@conteo/shared/models/historico.js";
import type { LineaConteo } from "@conteo/shared/models/linea-conteo.js";
import type { SesionConteo } from "@conteo/shared/models/sesion-conteo.js";
import type { Conectividad, Sucursal } from "@conteo/shared/models/sucursal.js";
import type { RolUsuario, Usuario } from "@conteo/shared/models/usuario.js";

interface AporteDoc {
  readonly uid: string;
  readonly nombre: string;
  readonly cantidad: number;
  readonly registradoEn: Timestamp;
  readonly dispositivoId: string;
  readonly version: number;
}

export function aporteDesdeDoc(data: AporteDoc): Aporte {
  return {
    uid: data.uid,
    nombre: data.nombre,
    cantidad: data.cantidad,
    registradoEn: data.registradoEn.toDate(),
    dispositivoId: data.dispositivoId,
    version: data.version,
  };
}

interface LineaConteoDoc {
  readonly valorUnitario: number;
  readonly etiqueta: string;
  readonly area: string;
  readonly areaFijaPorAdmin: boolean;
  readonly cantidadTotal: number;
  readonly numAportantes: number;
  readonly versiones: Record<string, number>;
  readonly actualizadaEn: Timestamp;
  readonly actualizadaPor: string;
  readonly aplicados?: Record<string, number>;
}

export function lineaConteoDesdeDoc(categoriaId: string, data: LineaConteoDoc): LineaConteo {
  return {
    categoriaId,
    valorUnitario: data.valorUnitario,
    etiqueta: data.etiqueta,
    area: data.area,
    areaFijaPorAdmin: data.areaFijaPorAdmin,
    cantidadTotal: data.cantidadTotal,
    numAportantes: data.numAportantes,
    versiones: data.versiones,
    actualizadaEn: data.actualizadaEn.toDate(),
    actualizadaPor: data.actualizadaPor,
    aplicados: data.aplicados,
  };
}

interface SesionConteoDoc {
  readonly sucursalId: string;
  readonly sucursalNombre: string;
  readonly estado: "abierta" | "cerrada";
  readonly abiertaEn: Timestamp;
  readonly abiertaPor: string;
  readonly cerradaEn: Timestamp | null;
  readonly cerradaPor: string | null;
  readonly participantes: readonly string[];
  readonly totalUnidades: number;
  readonly sesionCorregidaId: string | null;
}

interface SucursalDoc {
  readonly nombre: string;
  readonly direccion: string;
  readonly conectividad: Conectividad;
  readonly activa: boolean;
  readonly sesionAbiertaId: string | null;
  readonly creadaEn: Timestamp;
}

export function sucursalDesdeDoc(sucursalId: string, data: SucursalDoc): Sucursal {
  return {
    sucursalId,
    nombre: data.nombre,
    direccion: data.direccion,
    conectividad: data.conectividad,
    activa: data.activa,
    sesionAbiertaId: data.sesionAbiertaId,
    creadaEn: data.creadaEn.toDate(),
  };
}

export function sesionConteoDesdeDoc(sesionId: string, data: SesionConteoDoc): SesionConteo {
  return {
    sesionId,
    sucursalId: data.sucursalId,
    sucursalNombre: data.sucursalNombre,
    estado: data.estado,
    abiertaEn: data.abiertaEn.toDate(),
    abiertaPor: data.abiertaPor,
    cerradaEn: data.cerradaEn?.toDate() ?? null,
    cerradaPor: data.cerradaPor,
    participantes: data.participantes,
    totalUnidades: data.totalUnidades,
    sesionCorregidaId: data.sesionCorregidaId,
  };
}

// ── mappers del panel admin (docs/plan-panel-administrador.md §4) ──

interface UsuarioDoc {
  readonly nombre: string;
  readonly correo: string;
  readonly rol: RolUsuario;
  readonly sucursalesAsignadas: readonly string[];
  readonly activo: boolean;
  readonly creadoEn: Timestamp;
  readonly creadoPor: string;
  readonly pwaInstalada?: boolean;
  readonly ultimoAccesoEn?: Timestamp;
}

export function usuarioDesdeDoc(uid: string, data: UsuarioDoc): Usuario {
  return {
    uid,
    nombre: data.nombre,
    correo: data.correo,
    rol: data.rol,
    sucursalesAsignadas: data.sucursalesAsignadas,
    activo: data.activo,
    creadoEn: data.creadoEn.toDate(),
    creadoPor: data.creadoPor,
    pwaInstalada: data.pwaInstalada,
    ultimoAccesoEn: data.ultimoAccesoEn?.toDate(),
  };
}

interface CategoriaValorDoc {
  readonly valor: number;
  readonly etiqueta: string;
  readonly activa: boolean;
  readonly orden: number;
  readonly creadaEn: Timestamp;
  readonly sucursalesAsignadas?: readonly string[];
  readonly areaIds?: readonly string[];
}

export function categoriaValorDesdeDoc(
  categoriaId: string,
  data: CategoriaValorDoc,
): CategoriaValor {
  return {
    categoriaId,
    valor: data.valor,
    etiqueta: data.etiqueta,
    activa: data.activa,
    orden: data.orden,
    creadaEn: data.creadaEn.toDate(),
    sucursalesAsignadas: data.sucursalesAsignadas,
    areaIds: data.areaIds,
  };
}

interface AreaDoc {
  readonly nombre: string;
  readonly activa: boolean;
  readonly creadaEn: Timestamp;
}

export function areaDesdeDoc(areaId: string, data: AreaDoc): Area {
  return {
    areaId,
    nombre: data.nombre,
    activa: data.activa,
    creadaEn: data.creadaEn.toDate(),
  };
}

/**
 * eventoAuditoriaDesdeDoc — a diferencia del resto de mappers, `data` no
 * tiene una forma fija: `EventoAuditoria` varía por `tipo`
 * (packages/functions/src/lib/auditoria.ts:21-24), así que sólo se convierte
 * el campo con Timestamp conocido (`ocurridoEn`) y el resto pasa intacto.
 */
export function eventoAuditoriaDesdeDoc(eventoId: string, data: DocumentData): EventoAuditoria {
  const { ocurridoEn, ...resto } = data as { ocurridoEn: Timestamp; [campo: string]: unknown };
  return { ...resto, eventoId, ocurridoEn: ocurridoEn.toDate() } as EventoAuditoria;
}

interface HistoricoDoc {
  readonly sesionId: string;
  readonly cerradaEn: Timestamp;
  readonly totalUnidades: number;
  readonly totalMonetario: number;
  readonly porCategoria: Record<string, { cantidad: number; subtotal: number }>;
}

export function historicoDesdeDoc(data: HistoricoDoc): Historico {
  return {
    sesionId: data.sesionId,
    cerradaEn: data.cerradaEn.toDate(),
    totalUnidades: data.totalUnidades,
    totalMonetario: data.totalMonetario,
    porCategoria: data.porCategoria,
  };
}
