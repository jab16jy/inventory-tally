import { z } from "zod";

// contracts/schemas/actualizar-cajero.schema.ts (design.md D-6, gestion-cajeros spec)
// Reemplazo total, no parche parcial: los 4 campos son obligatorios. `correo`
// queda excluido (cambiar el correo de acceso es otra operación, doc 08 §2).
export const actualizarCajeroSchema = z.object({
  uid: z.string().min(1),
  nombre: z.string().min(1),
  rol: z.enum(["admin", "cajero"]),
  sucursalesAsignadas: z.array(z.string()).max(10),
});

export type ActualizarCajeroInput = z.infer<typeof actualizarCajeroSchema>;
