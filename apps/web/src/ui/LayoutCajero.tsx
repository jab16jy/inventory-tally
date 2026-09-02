// apps/web/src/ui/LayoutCajero.tsx (docs/plan-diseno-visual-pwa.md, doc 11
// §2). Armazón de la PWA de cajero: barra inferior de 3 pestañas + <Outlet/>.
//
// Sin props: no recibe `onSalir`. "Salir" vive en el CabeceraCajero/
// BotonSalir de cada pantalla — duplicarlo aquí daría dos botones "Salir" en
// pantalla a la vez.
//
// ponytail: sin `useDisenoAdaptativo` (a diferencia de AdminLayout). La PWA
// del cajero es `max-w-md` a cualquier ancho — es una app de teléfono aunque
// el viewport mida 1600 px — así que hay una sola rama de barra en vez de
// tres. Añadir el hook aquí sería resolver un problema que este layout no
// tiene.
import { NavLink, Outlet } from "react-router-dom";
import { Icono, type IconoProps } from "./primitivos/Icono.js";

interface Destino {
  readonly ruta: string;
  readonly etiqueta: string;
  readonly icono: IconoProps["nombre"];
}

// Sin `end` en ningún destino: "Mis conteos" tiene que seguir activo en
// /mis-conteos/:sesionId, no sólo en la ruta exacta.
const DESTINOS: readonly Destino[] = [
  { ruta: "/sucursales", etiqueta: "Conteos", icono: "sucursal" },
  { ruta: "/mis-conteos", etiqueta: "Mis conteos", icono: "sesiones" },
  { ruta: "/cuenta", etiqueta: "Cuenta", icono: "cuenta" },
] as const;

// ponytail: no se extrae un `BarraInferior` compartido con AdminLayout. Los
// dos consumidores difieren en número de destinos, en el botón "Salir" extra
// del panel y en sus variantes de ancho (AdminLayout tiene sidebar/tablet/
// móvil; esta barra es única). Se extrae cuando aparezca un tercer
// consumidor — hoy sería generalizar sobre una muestra de dos.
export function LayoutCajero() {
  return (
    <div className="flex min-h-dvh flex-col">
      <main className="min-w-0 flex-1 pb-16">
        <Outlet />
      </main>

      <nav
        aria-label="Secciones"
        className="fixed inset-x-0 bottom-0 flex shrink-0 border-t border-borde bg-placa pb-[env(safe-area-inset-bottom)]"
      >
        {DESTINOS.map((destino) => (
          <NavLink
            key={destino.ruta}
            to={destino.ruta}
            className={({ isActive }) =>
              `flex min-h-[var(--size-toque)] flex-1 flex-col items-center justify-center gap-1 px-2 py-2 text-micro ${
                isActive ? "font-semibold text-senal" : "text-tenue"
              }`
            }
          >
            <Icono nombre={destino.icono} className="size-4 shrink-0" />
            <span>{destino.etiqueta}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
