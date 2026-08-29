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

export { crearCategoriaSchema } from "./crear-categoria.schema.js";
export type { CrearCategoriaInput } from "./crear-categoria.schema.js";

export { desactivarCategoriaSchema } from "./desactivar-categoria.schema.js";
export type { DesactivarCategoriaInput } from "./desactivar-categoria.schema.js";

export { crearAreaSchema } from "./crear-area.schema.js";
export type { CrearAreaInput } from "./crear-area.schema.js";

export { desactivarAreaSchema } from "./desactivar-area.schema.js";
export type { DesactivarAreaInput } from "./desactivar-area.schema.js";

// ponytail: mismo shape {categoriaId} que desactivarCategoriaSchema; separar
// el archivo cuando diverjan (docs/plan-panel-administrador.md §3). Sin test
// propio: es el mismo objeto que ya cubre desactivar-categoria.schema.test.ts.
export { desactivarCategoriaSchema as eliminarCategoriaSchema } from "./desactivar-categoria.schema.js";
export type { DesactivarCategoriaInput as EliminarCategoriaInput } from "./desactivar-categoria.schema.js";

// ponytail: mismo shape {areaId} que desactivarAreaSchema; separar el archivo
// cuando diverjan (docs/plan-panel-administrador.md §3). Sin test propio: es
// el mismo objeto que ya cubre desactivar-area.schema.test.ts.
export { desactivarAreaSchema as eliminarAreaSchema } from "./desactivar-area.schema.js";
export type { DesactivarAreaInput as EliminarAreaInput } from "./desactivar-area.schema.js";

// ponytail: mismo shape {uid} que desactivarCajeroSchema; separar el archivo
// cuando diverjan (docs/plan-panel-administrador.md §3). Sin test propio: es
// el mismo objeto que ya cubre desactivar-cajero.schema.test.ts.
export { desactivarCajeroSchema as eliminarCajeroSchema } from "./desactivar-cajero.schema.js";
export type { DesactivarCajeroInput as EliminarCajeroInput } from "./desactivar-cajero.schema.js";

export { eliminarSucursalSchema } from "./eliminar-sucursal.schema.js";
export type { EliminarSucursalInput } from "./eliminar-sucursal.schema.js";
