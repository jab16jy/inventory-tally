// apps/web/src/ui/CabeceraCajero.tsx — issue #40 (variante A elegida sobre
// /prototype: Salir dentro de la cabecera existente, sin barra nueva). Las 3
// pantallas lineales del cajero con título propio (Sucursales, Preparar,
// Finalizar) comparten esta cabecera; ConteoScreen no, porque su cabecera ya
// es progreso+búsqueda sin un título de una línea — ahí BotonSalir se inserta
// directo en su fila existente.
import type { ReactNode } from "react";
import { BotonSalir } from "./BotonSalir.js";

export interface CabeceraCajeroProps {
  readonly titulo: ReactNode;
  readonly onSalir: () => void | Promise<void>;
}

export function CabeceraCajero({ titulo, onSalir }: CabeceraCajeroProps) {
  return (
    <header className="flex items-start justify-between gap-3 pb-3">
      {/* Cabecera callada a propósito, mismo criterio que antes de este
          cambio (DESIGN.md: el numeral de 2rem es el outlier reservado a la
          denominación de categoría, no a un título de pantalla). */}
      <h1 className="text-micro tracking-[0.18em] text-tenue uppercase">{titulo}</h1>
      <BotonSalir onSalir={onSalir} />
    </header>
  );
}
