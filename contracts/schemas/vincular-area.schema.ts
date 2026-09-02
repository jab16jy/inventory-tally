import { z } from "zod";

// contracts/schemas/vincular-area.schema.ts (doc 08 §3)
// El cajero, dentro de su sesión abierta, vincula un área existente a una
// categoría existente. No crea ni edita ninguna de las dos (eso sigue siendo
// del admin) — sólo la relación entre ellas.
export const vincularAreaSchema = z.object({
  sesionId: z.string().min(1),
  categoriaId: z.string().min(1),
  areaId: z.string().min(1),
});

export type VincularAreaInput = z.infer<typeof vincularAreaSchema>;
