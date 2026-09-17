// apps/web/src/lib/etiqueta-rol.ts (specs/admin-sucursal, "Requirement: Rol
// labels") — un único mapeo de `rol` crudo (claim/almacenado) a su etiqueta
// de UI. No muta ni renombra el valor crudo: sólo cambia lo que se muestra.
import type { RolUsuario } from "@conteo/shared/models/usuario.js";

const ETIQUETAS: Record<RolUsuario, string> = {
  admin: "Gerente",
  admin_sucursal: "Admin de sucursal",
  cajero: "Cajero",
};

/** `rol` ausente o inesperado cae a "Cajero" — mismo default que tenían los
 *  call sites reemplazados (CuentaScreen, CajerosScreen, auditoria-helpers). */
export function etiquetaRol(rol: string | undefined): string {
  return (rol && rol in ETIQUETAS ? ETIQUETAS[rol as RolUsuario] : undefined) ?? "Cajero";
}
