import { z } from "zod";

// contracts/schemas/reetiquetar-linea-en-sesion.schema.ts (ADR-22)
// El cajero, dentro de su sesión abierta, reetiqueta el área de una línea
// cuya categoría sigue sin `areaId` en el catálogo — tantas veces como
// quiera, incluyendo volver a "Sin área". `areaId` es `nullish`: `undefined`
// (se omite) y `null` (se limpia explícitamente) significan lo mismo, volver
// al sentinel SIN_AREA — el cliente puede mandar cualquiera de los dos.
export const reetiquetarLineaEnSesionSchema = z.object({
  sesionId: z.string().min(1),
  categoriaId: z.string().min(1),
  areaId: z.string().min(1).nullish(),
});

export type ReetiquetarLineaEnSesionInput = z.infer<typeof reetiquetarLineaEnSesionSchema>;
