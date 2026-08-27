import { z } from "zod";

// contracts/schemas/crear-categoria.schema.ts (docs/plan-panel-administrador.md §3)
// `sucursalesAsignadas` (ticket #39, D6): ausente = categoría global (grilla
// de $500 en $500, comportamiento actual). Presente = catálogo "nombrado"
// visible sólo en esas sucursales (D4) — `.min(1)` evita el footgun de un
// array vacío ("nadie la ve"); mismo límite `.max(10)` que
// crear-cajero.schema.ts por consistencia, no por una invariante nueva.
export const crearCategoriaSchema = z.object({
  etiqueta: z.string().min(1),
  valor: z.number().int().min(0),
  orden: z.number().int().min(0),
  sucursalesAsignadas: z.array(z.string()).min(1).max(10).optional(),
  areaId: z.string().min(1).optional(),
});

export type CrearCategoriaInput = z.infer<typeof crearCategoriaSchema>;
