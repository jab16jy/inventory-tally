import { z } from "zod";

// contracts/schemas/actualizar-categoria.schema.ts
// (docs/plan-panel-administrador.md §3). Mismo shape editable que
// crear-categoria.schema.ts (etiqueta/valor/orden/sucursalesAsignadas/areaIds)
// más `categoriaId`: `activa`/`creadaEn` los maneja
// desactivar/reactivar-categoria (I-7), no esta callable.
export const actualizarCategoriaSchema = z.object({
  categoriaId: z.string().min(1),
  etiqueta: z.string().min(1),
  valor: z.number().int().min(0),
  orden: z.number().int().min(0),
  sucursalesAsignadas: z.array(z.string()).min(1).max(10).optional(),
  // N:M (issue #81): ver crear-categoria.schema.ts.
  areaIds: z.array(z.string()).min(1).max(10).optional(),
}).strict();

export type ActualizarCategoriaInput = z.infer<typeof actualizarCategoriaSchema>;
