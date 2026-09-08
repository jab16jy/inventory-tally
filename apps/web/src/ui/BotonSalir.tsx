// apps/web/src/ui/BotonSalir.tsx — issue #40. "Salir", nunca "Cerrar sesión":
// mismo nombre accesible reservado que admin/AdminLayout.tsx:111-113 — la
// pantalla de conteo ya usa "cerrar" para otro concepto (cerrar la sesión de
// conteo), y la convención es del repo entero.
//
// `onSalir` entra por prop, no como el singleton `auth` importado de
// `lib/firebase.js` — mismo patrón que AdminLayout/LoginScreen: la pantalla
// recibe su frontera de I/O desde afuera para que el test la monte sin
// Firebase real.
//
// issue #72 (docs/diseno/13-decisiones-adr.md#adr-19): un toque
// accidental en este botón cierra la sesión de golpe a mitad de un conteo, a
// diferencia del resto de la app (patrón "sin diálogo" de #56). Se agrega un
// paso de confirmación aquí, no un componente de modal genérico reutilizable
// — <dialog> nativo inline, mismo patrón que ModalSesionCerrada.tsx, único
// consumidor real de esa forma hoy.
import { useRef } from "react";
import { Icono } from "./primitivos/Icono.js";

export interface BotonSalirProps {
  readonly onSalir: () => void | Promise<void>;
}

export function BotonSalir({ onSalir }: BotonSalirProps) {
  const dialogoRef = useRef<HTMLDialogElement>(null);

  return (
    <>
      <button
        type="button"
        onClick={() => dialogoRef.current?.showModal()}
        className="flex shrink-0 items-center gap-1.5 text-micro text-tenue hover:text-tinta"
      >
        <Icono nombre="cerrar" className="size-4 shrink-0" />
        Salir
      </button>

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
    </>
  );
}
