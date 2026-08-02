import { z } from "zod";

// contracts/schemas/abrir-sesion.schema.ts (doc 08 §3)
export const abrirSesionSchema = z.object({
  sucursalId: z.string().min(1),
});

export type AbrirSesionInput = z.infer<typeof abrirSesionSchema>;
