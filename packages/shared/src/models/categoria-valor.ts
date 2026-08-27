/**
 * CategoriaValor — precio de venta definido por el negocio (doc 03 §3).
 * Documento: `categoriasValor/{categoriaId}` (doc 04 §3). Nunca se borra,
 * sólo se desactiva.
 *
 * Una fila también puede ser un "producto nombrado" (ticket #39, D1): la
 * misma forma, sólo que `etiqueta` es un nombre propio en vez de un precio
 * formateado — no hay un modelo nuevo para eso.
 *
 * `sucursalesAsignadas` (D6, mismo campo/forma que `Usuario.sucursalesAsignadas`):
 * ausente/`undefined` = categoría global, visible en cualquier sucursal
 * (comportamiento actual, sin cambios). Presente = sólo esas sucursales la
 * ven al abrir sesión (D4).
 */
export interface CategoriaValor {
  readonly categoriaId: string;
  readonly valor: number;
  readonly etiqueta: string;
  readonly activa: boolean;
  readonly orden: number;
  readonly creadaEn: Date;
  readonly sucursalesAsignadas?: readonly string[];
  readonly areaId?: string;
}
