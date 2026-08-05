// apps/web/src/ui/primitivos/Icono.tsx
//
// Cero dependencias de iconos (plan §3): un pack genérico (lucide, heroicons)
// dibuja en trazo redondeado y trae más glifos de los que este mundo usa.
// Sólo los paths que la pantalla de conteo necesita de verdad — búsqueda y
// filtro — en la gramática del mundo: trazo duro (`strokeLinecap: "square"`,
// sin curva de esquina), nunca emoji.
import type { SVGProps } from "react";

const PATHS = {
  /** Lupa — encabeza el campo de búsqueda por valor/etiqueta. */
  buscar: "M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14ZM21 21l-4.35-4.35",
  /** Embudo — el filtro "sólo pendientes" (doc 10 §2). */
  filtro: "M3 4h18M6 4v4l5 6v6M18 4v4l-5 6",
  /** Tres arcos + un punto CUADRADO (nunca redondo, gramática del mundo):
   *  marca de conectividad WiFi en `/sucursales` (doc 03 §48, plan §5). */
  wifi: "M2 7A12.5 12.5 0 0 1 22 7M5.5 11A8.5 8.5 0 0 1 18.5 11M9 15A4.2 4.2 0 0 1 15 15M11.25 18.25h1.5v1.5h-1.5z",
  /** Barras ascendentes de señal — marca de conectividad "datos" (datos
   *  móviles) en `/sucursales`, trazo recto puro, sin curvas. */
  datos: "M4 20V17M9 20V14M14 20V10M19 20V5",
} as const;

export interface IconoProps extends Omit<SVGProps<SVGSVGElement>, "children"> {
  readonly nombre: keyof typeof PATHS;
}

export function Icono({ nombre, ...props }: IconoProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="square"
      strokeLinejoin="miter"
      aria-hidden="true"
      {...props}
    >
      <path d={PATHS[nombre]} />
    </svg>
  );
}
