import { z } from "zod";

// contracts/schemas/desactivar-categoria.schema.ts (docs/plan-panel-administrador.md §3)
export const desactivarCategoriaSchema = z.object({
  categoriaId: z.string().min(1),
});

export type DesactivarCategoriaInput = z.infer<typeof desactivarCategoriaSchema>;
