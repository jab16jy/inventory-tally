import { z } from "zod";

// contracts/schemas/crear-categoria-en-sesion.schema.ts (doc 08 §3)
// El contador crea una categoría/producto DESDE su conteo abierto. Un
// "producto nombrado" es una CategoriaValor cuya `etiqueta` es un nombre en
// vez de un precio formateado (ticket #39, D1) — no hay modelo nuevo.
//
// SIN `valor` y SIN `orden`, a diferencia de crearCategoriaSchema. No es un
// olvido: I-9 y ADR-07 separan los datos monetarios por rol, y dejar que un
// cajero escriba un precio sería exactamente cruzar esa frontera. El servidor
// escribe `valor: 0` y el admin lo precia después desde el panel.
//
// z.object (no `.strict()`, misma convención que el resto de contracts/): una
// clave `valor` enviada por un cliente se DESCARTA en el parse — `validar()`
// devuelve `resultado.data`, así que nunca llega a la callable. El descarte es
// la guarda, y crear-categoria-en-sesion.schema.test.ts lo fija.
export const crearCategoriaEnSesionSchema = z.object({
  sesionId: z.string().min(1),
  etiqueta: z.string().min(1).max(60),
  areaId: z.string().min(1).optional(),
});

export type CrearCategoriaEnSesionInput = z.infer<typeof crearCategoriaEnSesionSchema>;
