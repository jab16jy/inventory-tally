// apps/web/src/lib/guardas.ts (doc 11 §2) — lógica de la guarda de ruta,
// extraída como función pura para poder probarla sin renderizar React ni
// tocar Firebase Auth. La guarda es CONVENIENCIA, no seguridad: la
// autorización real vive en las Security Rules.
export interface UsuarioAutenticado {
  readonly uid: string;
  readonly nombre: string | null;
  readonly esAdmin: boolean;
}

/** `undefined` = resolviendo la sesión (splash); `null` = sin sesión. */
export type EstadoAuth = UsuarioAutenticado | null | undefined;

/** Devuelve la ruta a la que redirigir, o `null` si no hace falta redirigir. */
export function calcularRedireccion(auth: EstadoAuth, pathname: string): string | null {
  if (auth === undefined) return null;
  if (auth === null) return "/login";
  if (pathname.startsWith("/admin") && !auth.esAdmin) return "/sucursales";
  return null;
}
