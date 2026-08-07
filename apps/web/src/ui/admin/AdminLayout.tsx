// apps/web/src/ui/admin/AdminLayout.tsx
// (docs/plan-panel-administrador.md §5, fase F1)
//
// Armazón fijo del panel de administrador: sidebar + <Outlet/>. Sólo
// escritorio ≥1024 px (doc plan §1, tabla de decisiones "Responsive") — sin
// nav inferior, sin breakpoint de tablet, y sin `max-w-md`: ese wrapper
// pertenece a la PWA de cajero (ConteoScreen, SucursalesScreen), no a esta
// pantalla de mouse y teclado.
//
// `onSalir` entra por prop, no como el singleton `auth` importado de
// `lib/firebase.js` — mismo patrón que `LoginScreen.onIniciarSesion` (la
// pantalla recibe su frontera de I/O desde afuera para que el test la monte
// sin Firebase real).
import clsx from "clsx";
import { NavLink, Outlet } from "react-router-dom";
import { Icono, type IconoProps } from "../primitivos/Icono.js";

interface Destino {
  readonly ruta: string;
  readonly etiqueta: string;
  readonly icono: IconoProps["nombre"];
  /** Sólo Panel: sin esto, NavLink lo marcaría activo en cualquier /admin/*
   *  por ser el prefijo común de las siete rutas. */
  readonly fin?: boolean;
}

// Siete destinos de primer nivel (doc plan §1). Análisis y Cerrar se
// alcanzan DESDE Panel/Sesiones — no son nav de primer nivel (F4/F5).
const DESTINOS: readonly Destino[] = [
  { ruta: "/admin", etiqueta: "Panel", icono: "panel", fin: true },
  { ruta: "/admin/cajeros", etiqueta: "Cajeros", icono: "usuarios" },
  { ruta: "/admin/sucursales", etiqueta: "Sucursales", icono: "sucursal" },
  { ruta: "/admin/categorias", etiqueta: "Categorías", icono: "etiqueta" },
  { ruta: "/admin/sesiones", etiqueta: "Sesiones", icono: "sesiones" },
  { ruta: "/admin/auditoria", etiqueta: "Auditoría", icono: "auditoria" },
  { ruta: "/admin/comparativo", etiqueta: "Comparativo", icono: "comparativo" },
];

export interface AdminLayoutProps {
  readonly onSalir: () => void | Promise<void>;
}

export function AdminLayout({ onSalir }: AdminLayoutProps) {
  return (
    <div className="flex min-h-dvh">
      <nav
        aria-label="Panel de administrador"
        className="flex w-60 shrink-0 flex-col border-r border-borde bg-placa"
      >
        {/* Callado a propósito, mismo criterio que el h1 de SucursalesScreen:
            el numeral de 32px es del KPI, no de una etiqueta de marca. */}
        <p className="px-4 pt-5 pb-4 text-micro tracking-[0.18em] text-tenue uppercase">
          Panel administrador
        </p>

        <ul className="flex flex-1 flex-col gap-0.5 px-2">
          {DESTINOS.map((destino) => (
            <li key={destino.ruta} className="list-none">
              <NavLink
                to={destino.ruta}
                end={destino.fin}
                className={({ isActive }) =>
                  clsx(
                    "flex items-center gap-2.5 rounded-placa px-2.5 py-2.5 text-base transition-colors duration-150 ease-out",
                    isActive
                      ? "bg-placa-alta font-semibold text-senal"
                      : "text-tinta hover:bg-placa-alta/60",
                  )
                }
              >
                {({ isActive }) => (
                  <>
                    <Icono nombre={destino.icono} className="size-4 shrink-0" />
                    <span className="min-w-0 flex-1 truncate">{destino.etiqueta}</span>
                    {/* Marca "estás aquí" sin gastar la regla de tinta de
                        Placa: esa señal está reservada al bloque de
                        sincronización de F4 (RF-16), no a la navegación. */}
                    {isActive && <Icono nombre="chevron" className="size-3.5 shrink-0" />}
                  </>
                )}
              </NavLink>
            </li>
          ))}
        </ul>

        <div className="border-t border-borde p-2">
          {/* "Salir", nunca "Cerrar sesión": el nombre accesible de la
              pantalla de conteo no puede matchear /cerrar|descartar/i, y la
              convención es del repo entero, no sólo de esa pantalla. */}
          <button
            type="button"
            onClick={() => void onSalir()}
            className="flex w-full items-center gap-2.5 rounded-placa px-2.5 py-2.5 text-base text-tenue transition-colors duration-150 ease-out hover:bg-placa-alta/60 hover:text-tinta"
          >
            <Icono nombre="cerrar" className="size-4 shrink-0" />
            Salir
          </button>
        </div>
      </nav>

      <main className="min-w-0 flex-1 overflow-y-auto">
        <Outlet />
      </main>
    </div>
  );
}
