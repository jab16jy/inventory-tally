export { abrirSesionSchema } from "./abrir-sesion.schema.js";
export type { AbrirSesionInput } from "./abrir-sesion.schema.js";

export { cerrarSesionSchema } from "./cerrar-sesion.schema.js";
export type { CerrarSesionInput } from "./cerrar-sesion.schema.js";

export { crearCajeroSchema } from "./crear-cajero.schema.js";
export type { CrearCajeroInput } from "./crear-cajero.schema.js";

export { actualizarCajeroSchema } from "./actualizar-cajero.schema.js";
export type { ActualizarCajeroInput } from "./actualizar-cajero.schema.js";

export { desactivarCajeroSchema } from "./desactivar-cajero.schema.js";
export type { DesactivarCajeroInput } from "./desactivar-cajero.schema.js";

// ponytail: mismo shape {uid} que desactivarCajeroSchema; separar el archivo
// cuando diverjan (docs/plan-panel-administrador.md §3).
export { desactivarCajeroSchema as reactivarCajeroSchema } from "./desactivar-cajero.schema.js";
export type { DesactivarCajeroInput as ReactivarCajeroInput } from "./desactivar-cajero.schema.js";

export { crearSucursalSchema } from "./crear-sucursal.schema.js";
export type { CrearSucursalInput } from "./crear-sucursal.schema.js";

export { actualizarSucursalSchema } from "./actualizar-sucursal.schema.js";
export type { ActualizarSucursalInput } from "./actualizar-sucursal.schema.js";
