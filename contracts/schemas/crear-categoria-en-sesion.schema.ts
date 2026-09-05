import { z } from "zod";

// contracts/schemas/crear-categoria-en-sesion.schema.ts (doc 08 §3)
// El contador crea una categoría/producto DESDE su conteo abierto. Un
// "producto nombrado" es una CategoriaValor cuya `etiqueta` es un nombre en
// vez de un precio formateado (ticket #39, D1) — no hay modelo nuevo.
//
// `valor` es OPCIONAL (ADR-23, docs/diseno/13-decisiones-adr.md#adr-23):
// corrige la lectura de ADR-07 que ADR-21 heredó ("el cajero no puede fijar
// precio" nunca fue lo que ADR-07 protegía — protege el consolidado de
// sesión, no el valorUnitario de una línea). Si el cajero conoce el precio
// del producto que está dando de alta, puede escribirlo; si no lo envía, el
// servidor sigue escribiendo `valor: 0` y el admin lo precia después.
//
// SIN `orden`, a diferencia de crearCategoriaSchema: ese campo sigue siendo
// sólo del servidor. z.object (no `.strict()`, misma convención que el resto
// de contracts/): una clave `orden` enviada por un cliente se DESCARTA en el
// parse — `validar()` devuelve `resultado.data`, así que nunca llega a la
// callable. El descarte es la guarda, y crear-categoria-en-sesion.schema.test.ts
// lo fija.
export const crearCategoriaEnSesionSchema = z.object({
  sesionId: z.string().min(1),
  etiqueta: z.string().min(1).max(60),
  areaId: z.string().min(1).optional(),
  valor: z.number().int().min(0).optional(),
});

export type CrearCategoriaEnSesionInput = z.infer<typeof crearCategoriaEnSesionSchema>;
