// apps/web/src/lib/guardas.ts (doc 11 §2) — lógica de la guarda de ruta,
// extraída como función pura para poder probarla sin renderizar React ni
// tocar Firebase Auth. La guarda es CONVENIENCIA, no seguridad: la
// autorización real vive en las Security Rules.
export interface UsuarioAutenticado {
  readonly uid: string;
  readonly nombre: string | null;
  readonly esAdmin: boolean;
  // Opcional a propósito (F3-A): `guardas.test.ts` está protegido y
  // construye literales `{ uid, nombre, esAdmin }` como UsuarioAutenticado
  // sin este campo. Volverlo requerido rompe `npm run typecheck` en un
  // archivo que no se puede tocar. El consumidor (`SucursalesScreen`)
  // normaliza la ausencia a `[]`.
  readonly sucursales?: readonly string[];
  // Opcional a propósito (D8/D9): `guardas.test.ts` está protegido y
  // construye literales sin `rol`.
  readonly rol?: string;
}

/** `undefined` = resolviendo la sesión (splash); `null` = sin sesión. */
export type EstadoAuth = UsuarioAutenticado | null | undefined;

/** Devuelve la ruta a la que redirigir, o `null` si no hace falta redirigir. */
export function calcularRedireccion(auth: EstadoAuth, pathname: string): string | null {
  if (auth === undefined) return null;
  if (auth === null) return "/login";
  if (pathname.startsWith("/admin") && !auth.esAdmin) return "/sucursales";
  if (pathname.startsWith("/admin/comparativo") && auth.rol === "admin_sucursal") return "/admin";
  return null;
}

/** Ruta de inicio según el rol (doc 11 §2: SPLASH → HOME{rol}). */
export function homePorRol(auth: UsuarioAutenticado): string {
  return auth.esAdmin ? "/admin" : "/sucursales";
}
