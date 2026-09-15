import { z } from "zod";

// contracts/schemas/crear-cajero.schema.ts (doc 07 §3, doc 08 §3)
export const crearCajeroSchema = z
  .object({
    nombre: z.string().min(1),
    correo: z.email(),
    passwordTemporal: z.string().min(8).regex(/\d/), // doc 09 §2: mínimo 8 caracteres con un dígito
    rol: z.enum(["admin", "admin_sucursal", "cajero"]),
    sucursalesAsignadas: z.array(z.string()).max(10),
  })
  // D3/D-6: admin_sucursal es de UNA sola sucursal (anti-escalada, gestion-cajeros spec).
  .refine((datos) => datos.rol !== "admin_sucursal" || datos.sucursalesAsignadas.length === 1, {
    message: "admin_sucursal requiere exactamente una sucursal asignada.",
    path: ["sucursalesAsignadas"],
  });

export type CrearCajeroInput = z.infer<typeof crearCajeroSchema>;
