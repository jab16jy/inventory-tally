import { z } from "zod";

// contracts/schemas/crear-categoria.schema.ts (docs/plan-panel-administrador.md §3)
export const crearCategoriaSchema = z.object({
  etiqueta: z.string().min(1),
  valor: z.number().int().min(0),
  orden: z.number().int().min(0),
});

export type CrearCategoriaInput = z.infer<typeof crearCategoriaSchema>;
