import { z } from "zod";

// contracts/schemas/actualizar-sucursal.schema.ts (docs/plan-panel-administrador.md §3)
// Reemplazo total, igual que actualizarCajero. `sesionAbiertaId` queda
// deliberadamente fuera de este esquema: ese campo pertenece a
// abrirSesion/cerrarSesion (invariante I-1), no a una edición de admin.
export const actualizarSucursalSchema = z.object({
  sucursalId: z.string().min(1),
  nombre: z.string().min(1),
  direccion: z.string().min(1),
  conectividad: z.enum(["wifi", "datos"]),
  activa: z.boolean(),
});

export type ActualizarSucursalInput = z.infer<typeof actualizarSucursalSchema>;
