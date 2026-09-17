// apps/web/src/ui/admin/auditoria-helpers.ts — funciones puras para formatear y
// contextualizar eventos de auditoría (quién lo hizo, causa y sucursal).
import type { EventoAuditoria } from "@conteo/shared/models/evento-auditoria.js";
import type { Sucursal } from "@conteo/shared/models/sucursal.js";
import type { Usuario } from "@conteo/shared/models/usuario.js";
import { etiquetaRol } from "../../lib/etiqueta-rol.js";

export interface AutorAuditoria {
  readonly nombre: string;
  readonly rol?: string;
}

export function obtenerAutor(
  evento: EventoAuditoria,
  usuariosMap?: ReadonlyMap<string, Usuario>,
): AutorAuditoria {
  if (evento.origen === "cron") {
    return { nombre: "Sistema", rol: "Automático" };
  }

  if (evento.usuarioNombre) {
    const usuario = evento.usuarioId ? usuariosMap?.get(evento.usuarioId) : undefined;
    return { nombre: evento.usuarioNombre, rol: etiquetaRol(usuario?.rol) };
  }

  if (evento.ejecutadoPor) {
    const usuario = usuariosMap?.get(evento.ejecutadoPor);
    if (usuario) {
      return { nombre: usuario.nombre, rol: etiquetaRol(usuario.rol) };
    }
    return { nombre: evento.ejecutadoPor };
  }

  if (evento.usuarioId) {
    const usuario = usuariosMap?.get(evento.usuarioId);
    if (usuario) {
      return { nombre: usuario.nombre, rol: etiquetaRol(usuario.rol) };
    }
  }

  if (evento.origen === "trigger") {
    return { nombre: "Sistema", rol: "Trigger" };
  }

  return { nombre: "—" };
}

export function describirContexto(evento: EventoAuditoria): string {
  switch (evento.tipo) {
    case "APORTE_MODIFICADO":
      return `Ajuste de aporte: ${evento.cantidadAnterior ?? 0} → ${evento.cantidadNueva ?? 0} unid.`;

    case "APORTE_CREADO":
      return `Aporte inicial: ${evento.cantidadNueva ?? 0} unid.`;

    case "SESION_ABIERTA":
      return "Apertura de sesión de conteo";

    case "SESION_CERRADA":
      if (evento.forzado) {
        const numPendientes = evento.sinConfirmar?.length ?? 0;
        return `Cierre forzado (${numPendientes} pendientes sin sincronizar)`;
      }
      return "Cierre normal de sesión";

    case "CIERRE_BLOQUEADO": {
      const numSinConfirmar = evento.sinConfirmar?.length ?? 0;
      return `Bloqueado por ${numSinConfirmar} participantes sin sincronizar`;
    }

    case "USUARIO_CREADO":
      return `Alta de usuario: ${evento.usuarioNombre ?? evento.usuarioId ?? "nuevo"}`;

    case "USUARIO_ACTUALIZADO":
      if (evento.campos && evento.campos.length > 0) {
        return `Campos actualizados: ${evento.campos.join(", ")}`;
      }
      return "Actualización de datos de usuario";

    case "USUARIO_DESACTIVADO":
      return "Desactivación de cuenta de usuario";

    case "USUARIO_ELIMINADO":
      return "Eliminación definitiva de cuenta";

    case "CATEGORIA_CREADA":
      if (evento.origen === "conteo") {
        return "Creada desde conteo en sesión";
      }
      return "Categoría creada en catálogo";

    case "CATEGORIA_ACTUALIZADA":
      return "Categoría actualizada";

    case "CATEGORIA_DESACTIVADA":
      return "Categoría desactivada";

    case "CATEGORIA_REACTIVADA":
      return "Categoría reactivada";

    case "CATEGORIA_ELIMINADA":
      return "Categoría eliminada del catálogo";

    case "AREA_CREADA":
      return "Área creada en catálogo";

    case "AREA_ACTUALIZADA":
      return "Área actualizada";

    case "AREA_DESACTIVADA":
      return "Área desactivada";

    case "AREA_REACTIVADA":
      return "Área reactivada";

    case "AREA_ELIMINADA":
      return "Área eliminada";

    case "AREA_VINCULADA":
      return "Área vinculada";

    case "LINEA_REETIQUETADA":
      return "Reetiquetado de área en conteo";

    case "SUCURSAL_CREADA":
      return "Sucursal creada";

    case "SUCURSAL_ACTUALIZADA":
      return "Sucursal actualizada";

    case "SUCURSAL_ELIMINADA":
      return "Sucursal eliminada";

    case "RECONCILIACION":
      return `Reconciliación: ${evento.cantidadAnterior ?? 0} → ${evento.cantidadNueva ?? 0} unid.`;

    case "AUDITORIA_PURGADA":
      return `Purga de retención: ${evento.eliminados ?? 0} eventos eliminados`;

    default:
      return "Evento registrado";
  }
}

export function obtenerNombreSucursal(
  evento: EventoAuditoria,
  sucursalesMap?: ReadonlyMap<string, Sucursal>,
): string {
  if (evento.sucursalNombre) {
    return String(evento.sucursalNombre);
  }
  if (evento.sucursalId) {
    const id = String(evento.sucursalId);
    return sucursalesMap?.get(id)?.nombre ?? id;
  }
  return "Global";
}
