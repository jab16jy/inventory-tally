/**
 * CategoriaValor — precio de venta definido por el negocio, global a todas
 * las sucursales (doc 03 §3). Documento: `categoriasValor/{categoriaId}`
 * (doc 04 §3). Nunca se borra, sólo se desactiva.
 */
export interface CategoriaValor {
  readonly categoriaId: string;
  readonly valor: number;
  readonly etiqueta: string;
  readonly activa: boolean;
  readonly orden: number;
  readonly creadaEn: Date;
}
