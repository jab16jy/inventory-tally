import { z } from "zod";

// contracts/schemas/desactivar-area.schema.ts (docs/plan-panel-administrador.md §3)
export const desactivarAreaSchema = z.object({
  areaId: z.string().min(1),
});

export type DesactivarAreaInput = z.infer<typeof desactivarAreaSchema>;
