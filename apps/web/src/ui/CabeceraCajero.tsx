// apps/web/src/ui/CabeceraCajero.tsx — issue #40 (variante A elegida sobre
// /prototype: Salir dentro de la cabecera existente, sin barra nueva). Las 3
// pantallas lineales del cajero con título propio (Sucursales, Preparar,
// Finalizar) comparten esta cabecera; ConteoScreen no lleva Salir: su
// cabecera es progreso+búsqueda y la salida vive en Cuenta (cajero) y en el
// panel (admin).
import type { ReactNode } from "react";
import { BotonSalir } from "./BotonSalir.js";

export interface CabeceraCajeroProps {
  readonly titulo: ReactNode;
  readonly onSalir: () => void | Promise<void>;
  // Sólo un admin que entró a contar lo recibe informado: vuelve al panel
  // sin cerrar sesión. Sin diálogo — a diferencia de Salir (issue #72/ADR-19),
  // no pierde nada.
  readonly onVolverAdmin?: () => void;
}

export function CabeceraCajero({ titulo, onSalir, onVolverAdmin }: CabeceraCajeroProps) {
  return (
    <header className="flex items-start justify-between gap-3 pb-3">
      {/* Cabecera callada a propósito, mismo criterio que antes de este
          cambio (DESIGN.md: el numeral de 2rem es el outlier reservado a la
          denominación de categoría, no a un título de pantalla). */}
      <h1 className="text-micro tracking-[0.18em] text-tenue uppercase">{titulo}</h1>
      <div className="flex shrink-0 items-center gap-3">
        {onVolverAdmin && (
          <button
            type="button"
            onClick={onVolverAdmin}
            className="text-micro text-tenue hover:text-tinta"
          >
            Volver al panel
          </button>
        )}
        <BotonSalir onSalir={onSalir} />
      </div>
    </header>
  );
}
