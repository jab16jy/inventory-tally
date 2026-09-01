import { z } from "zod";

// contracts/schemas/actualizar-area.schema.ts (docs/plan-panel-administrador.md
// §3). Sólo `nombre` es editable: `activa` la manejan desactivar/reactivar
// (I-7), no una edición de admin.
export const actualizarAreaSchema = z.object({
  areaId: z.string().min(1),
  nombre: z.string().min(1),
});

export type ActualizarAreaInput = z.infer<typeof actualizarAreaSchema>;
