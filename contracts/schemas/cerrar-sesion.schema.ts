import { z } from "zod";

// contracts/schemas/cerrar-sesion.schema.ts (doc 08 §3)
export const cerrarSesionSchema = z.object({
  sesionId: z.string().min(1),
  forzar: z.boolean().default(false),
});

export type CerrarSesionInput = z.infer<typeof cerrarSesionSchema>;
