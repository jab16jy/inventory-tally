import { z } from "zod";

// contracts/schemas/crear-cajero.schema.ts (doc 07 §3, doc 08 §3)
export const crearCajeroSchema = z.object({
  nombre: z.string().min(1),
  correo: z.email(),
  passwordTemporal: z.string().min(8).regex(/\d/), // doc 09 §2: mínimo 8 caracteres con un dígito
  rol: z.enum(["admin", "cajero"]),
  sucursalesAsignadas: z.array(z.string()).max(10),
});

export type CrearCajeroInput = z.infer<typeof crearCajeroSchema>;
