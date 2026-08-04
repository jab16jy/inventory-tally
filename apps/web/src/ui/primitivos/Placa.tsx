// apps/web/src/ui/primitivos/Placa.tsx
//
// El bloque-rótulo base del sistema, y el soporte de LA FIRMA: la regla de
// tinta izquierda pasa de hueca a sólida cuando el servidor confirma.
//
// Sobre el borde de color a la izquierda: normalmente es decoración perezosa
// y habría que rechazarlo. Aquí se lo gana — no adorna, ES el estado. Una
// sola propiedad CSS por fila, sin coste a 200 filas, comunicando justo lo
// que RNF-12 y RF-16 protegen: que tu conteo no se perdió.
import clsx from "clsx";
import type { ReactNode } from "react";

export interface PlacaProps {
  /** Regla sólida = el servidor ya agregó el aporte. Hueca = en tránsito. */
  readonly confirmado?: boolean;
  readonly className?: string;
  readonly children: ReactNode;
}

export function Placa({ confirmado = false, className, children }: PlacaProps) {
  return (
    <div
      className={clsx(
        // Elevación declarada UNA vez, con borde. Sin sombra: el mundo es de
        // borde duro y una sombra suave debajo del borde da la "card fantasma".
        //
        // Sin borde izquierdo: la regla de tinta ES el canto izquierdo. Con
        // el borde puesto quedaba una línea gris de 1 px por fuera de la
        // regla que la ensuciaba y la hacía leer como parte del marco en vez
        // de como señal.
        "relative border border-l-0 border-borde bg-placa rounded-placa py-3 pr-3 pl-4",
        className,
      )}
    >
      <span
        aria-hidden="true"
        className={clsx(
          "absolute inset-y-0 left-0 w-1 transition-colors duration-200 ease-out",
          confirmado ? "bg-senal" : "bg-senal-hueco",
        )}
      />
      {children}
    </div>
  );
}
