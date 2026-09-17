import { z } from "zod";

// contracts/schemas/actualizar-cajero.schema.ts (design.md D-6, gestion-cajeros spec)
// Reemplazo total, no parche parcial: los 4 campos son obligatorios. `correo`
// queda excluido (cambiar el correo de acceso es otra operación, doc 08 §2).
export const actualizarCajeroSchema = z
  .object({
    uid: z.string().min(1),
    nombre: z.string().min(1),
    rol: z.enum(["admin", "admin_sucursal", "cajero"]),
    sucursalesAsignadas: z.array(z.string()).max(10),
  })
  // D3/D-6: admin_sucursal es de UNA sola sucursal (anti-escalada, gestion-cajeros spec).
  .refine((datos) => datos.rol !== "admin_sucursal" || datos.sucursalesAsignadas.length === 1, {
    message: "admin_sucursal requiere exactamente una sucursal asignada.",
    path: ["sucursalesAsignadas"],
  });

export type ActualizarCajeroInput = z.infer<typeof actualizarCajeroSchema>;
