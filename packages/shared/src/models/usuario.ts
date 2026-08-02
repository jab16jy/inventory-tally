/**
 * Usuario — cajero o administrador. Documento: `usuarios/{uid}` (doc 04 §3).
 * El ID del documento es el UID de Firebase Auth; nunca se guarda contraseña.
 *
 * `pwaInstalada` y `ultimoAccesoEn` no los escribe `crearCajero` (doc 08 §3):
 * se llenan después, desde el cliente. Por eso son opcionales aquí.
 */
export type RolUsuario = "admin" | "cajero";

export interface Usuario {
  readonly uid: string;
  readonly nombre: string;
  readonly correo: string;
  readonly rol: RolUsuario;
  readonly sucursalesAsignadas: readonly string[];
  readonly activo: boolean;
  readonly creadoEn: Date;
  readonly creadoPor: string;
  readonly pwaInstalada?: boolean;
  readonly ultimoAccesoEn?: Date;
}
