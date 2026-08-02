// Errores de dominio (doc 07 §8). Cada uno se mapea a un mensaje o diálogo
// específico en la UI; ver la tabla del documento para el detalle.
export class SinPermisoError extends Error {}
export class SesionCerradaError extends Error {}
export class CantidadInvalidaError extends Error {}
export class SinConexionError extends Error {}

export class CierreBloqueadoError extends Error {
  constructor(readonly sinConfirmar: string[]) {
    super("Cierre bloqueado: hay cajeros sin sincronizar");
  }
}
