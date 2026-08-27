import { z } from "zod";

// contracts/schemas/crear-area.schema.ts (docs/plan-panel-administrador.md §3)
export const crearAreaSchema = z.object({
  nombre: z.string().min(1),
});

export type CrearAreaInput = z.infer<typeof crearAreaSchema>;
