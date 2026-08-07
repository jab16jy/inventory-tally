import { z } from "zod";

// contracts/schemas/crear-sucursal.schema.ts (docs/plan-panel-administrador.md §3)
export const crearSucursalSchema = z.object({
  nombre: z.string().min(1),
  direccion: z.string().min(1),
  conectividad: z.enum(["wifi", "datos"]),
});

export type CrearSucursalInput = z.infer<typeof crearSucursalSchema>;
