// apps/web/src/ui/BotonSalir.tsx — issue #40. "Salir", nunca "Cerrar sesión":
// mismo nombre accesible reservado que admin/AdminLayout.tsx:111-113 — la
// pantalla de conteo ya usa "cerrar" para otro concepto (cerrar la sesión de
// conteo), y la convención es del repo entero.
//
// `onSalir` entra por prop, no como el singleton `auth` importado de
// `lib/firebase.js` — mismo patrón que AdminLayout/LoginScreen: la pantalla
// recibe su frontera de I/O desde afuera para que el test la monte sin
// Firebase real.
import { Icono } from "./primitivos/Icono.js";

export interface BotonSalirProps {
  readonly onSalir: () => void | Promise<void>;
}

export function BotonSalir({ onSalir }: BotonSalirProps) {
  return (
    <button
      type="button"
      onClick={() => void onSalir()}
      className="flex shrink-0 items-center gap-1.5 text-micro text-tenue hover:text-tinta"
    >
      <Icono nombre="cerrar" className="size-4 shrink-0" />
      Salir
    </button>
  );
}
