import { z } from "zod";

// contracts/schemas/desactivar-cajero.schema.ts (gestion-cajeros spec)
// Sólo `uid`: sin `motivo`/`fecha`/bandera — no están en ningún documento de
// diseño (YAGNI).
export const desactivarCajeroSchema = z.object({
  uid: z.string().min(1),
});

export type DesactivarCajeroInput = z.infer<typeof desactivarCajeroSchema>;
