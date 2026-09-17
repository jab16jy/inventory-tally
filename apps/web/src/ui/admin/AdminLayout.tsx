// apps/web/src/ui/admin/AdminLayout.tsx
// (docs/plan-panel-administrador.md §5, fase F1)
//
// Armazón del panel de administrador: nav + <Outlet/>. Sin `max-w-md`: ese
// wrapper pertenece a la PWA de cajero (ConteoScreen, SucursalesScreen), no
// a esta pantalla de mouse y teclado (ni a su variante táctil).
//
// issue #20 item 1 (doc 11 §298-304): 3 disposiciones según
// `useDisenoAdaptativo` — antes esta pantalla era fija de escritorio
// (comentario histórico: "Sólo escritorio ≥1024 px, sin nav inferior, sin
// breakpoint de tablet"), un corte de alcance sin razón registrada (issue
// #20), no un trade-off.
//
// `onSalir` entra por prop, no como el singleton `auth` importado de
// `lib/firebase.js` — mismo patrón que `LoginScreen.onIniciarSesion` (la
// pantalla recibe su frontera de I/O desde afuera para que el test la monte
// sin Firebase real).
import clsx from "clsx";
import { useRef } from "react";
import { NavLink, Outlet } from "react-router-dom";
import { useDisenoAdaptativo } from "../../state/useDisenoAdaptativo.js";
import { Icono, type IconoProps } from "../primitivos/Icono.js";

interface Destino {
  readonly ruta: string;
  readonly etiqueta: string;
  readonly icono: IconoProps["nombre"];
  /** Sólo Panel: sin esto, NavLink lo marcaría activo en cualquier /admin/*
   *  por ser el prefijo común de las siete rutas. */
  readonly fin?: boolean;
}

// Siete destinos de primer nivel (doc plan §1 + agrupación por área). Áreas
// y Categorías viven juntas en CatalogoScreen (D-10): son los dos sentidos
// de la misma relación N:M, y separarlas obligaría a elegir de antemano el
// sentido de asignación. Análisis y Cerrar se alcanzan DESDE Panel/Sesiones
// — no son nav de primer nivel (F4/F5).
const DESTINOS: readonly Destino[] = [
  { ruta: "/admin", etiqueta: "Panel", icono: "panel", fin: true },
  { ruta: "/admin/cajeros", etiqueta: "Cajeros", icono: "usuarios" },
  { ruta: "/admin/sucursales", etiqueta: "Sucursales", icono: "sucursal" },
  { ruta: "/admin/categorias", etiqueta: "Categorías", icono: "etiqueta" },
  { ruta: "/admin/sesiones", etiqueta: "Sesiones", icono: "sesiones" },
  { ruta: "/admin/auditoria", etiqueta: "Auditoría", icono: "auditoria" },
  { ruta: "/admin/comparativo", etiqueta: "Comparativo", icono: "comparativo" },
];

/** Contexto que `<Outlet/>` pasa a las pantallas hijas (D7): así
 *  `CajerosScreen` sabe qué rol la está mirando sin leer Firebase de nuevo. */
export interface PanelContexto {
  readonly rol?: string;
}

export interface AdminLayoutProps {
  readonly onSalir: () => void | Promise<void>;
  /** Rol crudo del token (D8/D9): un admin_sucursal nunca ve el destino
   *  Comparativo — sin esto (Gerente o tests existentes) se ven los siete. */
  readonly rol?: string;
}

export function AdminLayout({ onSalir, rol }: AdminLayoutProps) {
  const diseno = useDisenoAdaptativo();
  const barraInferior = diseno === "movil";
  const soloIconos = diseno === "tablet";
  const destinos =
    rol === "admin_sucursal" ? DESTINOS.filter((d) => d.ruta !== "/admin/comparativo") : DESTINOS;
  // Mismo patrón de confirmación que BotonSalir.tsx (issue #72/ADR-19):
  // un toque accidental aquí saca al admin del panel de golpe. Un solo
  // <dialog> para los dos triggers posibles (sidebar / nav inferior) porque
  // nunca se renderizan a la vez.
  const dialogoRef = useRef<HTMLDialogElement>(null);

  return (
    <div className={clsx("flex min-h-dvh", barraInferior && "flex-col")}>
      {!barraInferior && (
        <nav
          aria-label="Panel de administrador"
          className={clsx(
            "flex shrink-0 flex-col border-r border-borde bg-placa print:hidden",
            soloIconos ? "w-16" : "w-60",
          )}
        >
          {/* Callado a propósito, mismo criterio que el h1 de
              SucursalesScreen: el numeral de 32px es del KPI, no de una
              etiqueta de marca. Sólo cabe con etiquetas — a 56px de ancho no
              hay espacio para el texto sin que se corte. */}
          {!soloIconos && (
            <p className="px-4 pt-5 pb-4 text-micro tracking-[0.18em] text-tenue uppercase">
              Panel administrador
            </p>
          )}

          <ul
            className={clsx("flex flex-1 flex-col gap-0.5 px-2", soloIconos && "items-center pt-3")}
          >
            {destinos.map((destino) => (
              <li key={destino.ruta} className="list-none">
                <NavLink
                  to={destino.ruta}
                  end={destino.fin}
                  title={soloIconos ? destino.etiqueta : undefined}
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
                      {!soloIconos && (
                        <span className="min-w-0 flex-1 truncate">{destino.etiqueta}</span>
                      )}
                      {/* Marca "estás aquí" sin gastar la regla de tinta de
                          Placa: esa señal está reservada al bloque de
                          sincronización de F4 (RF-16), no a la navegación. */}
                      {!soloIconos && isActive && (
                        <Icono nombre="chevron" className="size-3.5 shrink-0" />
                      )}
                    </>
                  )}
                </NavLink>
              </li>
            ))}
          </ul>

          <div className={clsx("border-t border-borde p-2", soloIconos && "flex justify-center")}>
            {/* "Salir", nunca "Cerrar sesión": el nombre accesible de la
                pantalla de conteo no puede matchear /cerrar|descartar/i, y la
                convención es del repo entero, no sólo de esa pantalla. */}
            <button
              type="button"
              onClick={() => dialogoRef.current?.showModal()}
              title={soloIconos ? "Salir" : undefined}
              className={clsx(
                "flex items-center gap-2.5 rounded-placa px-2.5 py-2.5 text-base text-tenue transition-colors duration-150 ease-out hover:bg-placa-alta/60 hover:text-tinta",
                soloIconos ? "justify-center" : "w-full",
              )}
            >
              <Icono nombre="cerrar" className="size-4 shrink-0" />
              {!soloIconos && "Salir"}
            </button>
          </div>
        </nav>
      )}

      <main className={clsx("min-w-0 flex-1 overflow-y-auto", barraInferior && "pb-16")}>
        <Outlet context={{ rol } satisfies PanelContexto} />
      </main>

      {/* < 600px (doc 11 §298-304): navegación inferior en vez de sidebar.
          Mismos 7 destinos + Salir que el sidebar, sólo que en fila — el
          diseño no pide un menú "más" para recortarlos, y overflow-x-auto
          cubre el caso de una pantalla angosta sin inventar esa pieza. */}
      {barraInferior && (
        <nav
          aria-label="Panel de administrador"
          className="fixed inset-x-0 bottom-0 flex shrink-0 overflow-x-auto border-t border-borde bg-placa print:hidden"
        >
          {destinos.map((destino) => (
            <NavLink
              key={destino.ruta}
              to={destino.ruta}
              end={destino.fin}
              className={({ isActive }) =>
                clsx(
                  "flex min-w-[4.5rem] flex-1 flex-col items-center gap-1 px-2 py-2 text-micro",
                  isActive ? "font-semibold text-senal" : "text-tenue",
                )
              }
            >
              <Icono nombre={destino.icono} className="size-4 shrink-0" />
              <span className="truncate">{destino.etiqueta}</span>
            </NavLink>
          ))}
          <button
            type="button"
            onClick={() => dialogoRef.current?.showModal()}
            className="flex min-w-[4.5rem] flex-1 flex-col items-center gap-1 px-2 py-2 text-micro text-tenue"
          >
            <Icono nombre="cerrar" className="size-4 shrink-0" />
            Salir
          </button>
        </nav>
      )}

      <dialog
        ref={dialogoRef}
        aria-label="Confirmar salida"
        className="m-auto w-[calc(100%-1.5rem)] max-w-sm rounded-placa border border-borde bg-placa-alta p-4 backdrop:bg-fondo/70"
      >
        <p className="text-base text-tinta">¿Seguro que quieres salir?</p>
        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={() => dialogoRef.current?.close()}
            className="min-h-[var(--size-toque)] flex-1 rounded-placa border border-borde text-tinta transition-colors duration-150 ease-out active:bg-placa/85"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => {
              dialogoRef.current?.close();
              void onSalir();
            }}
            className="min-h-[var(--size-toque)] flex-1 rounded-placa bg-senal font-semibold text-fondo transition-colors duration-150 ease-out active:bg-senal/85"
          >
            Salir
          </button>
        </div>
      </dialog>
    </div>
  );
}
