import { z } from "zod";

// contracts/schemas/eliminar-sucursal.schema.ts (docs/plan-panel-administrador.md §3)
export const eliminarSucursalSchema = z.object({
  sucursalId: z.string().min(1),
});

export type EliminarSucursalInput = z.infer<typeof eliminarSucursalSchema>;
