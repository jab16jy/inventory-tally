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
  /** Visto — checklist de `/conteo/:sesionId/preparar` y `/finalizar`
   *  (doc 11 §3, §6). Ángulo recto en el quiebre, nunca la curva de un
   *  check tipográfico: mantiene la gramática de trazo duro del mundo y
   *  reemplaza el "✅" del mock, que en iOS renderiza el emoji de Apple. */
  visto: "M4 13l4 4L20 6",

  // ── F1 del panel admin (docs/plan-panel-administrador.md §5) ──
  /** Cuadrícula 2×2 — nav "Panel" de AdminLayout: el tablero de sesiones. */
  panel: "M3 3h8v8H3zM13 3h8v8h-8zM3 13h8v8H3zM13 13h8v8h-8z",
  /** Dos figuras cuadradas — nav "Cajeros": personas, no persona. */
  usuarios: "M6 3h4v4H6zM4 10h8v9H4zM14 5h4v4h-4zM12 12h8v7h-8z",
  /** Local con toldo recto (nunca curvo) y vitrinas — nav "Sucursales". */
  sucursal: "M4 8h16v12H4zM4 8l2-4h12l2 4M10 20v-5h4v5M8 12h2v2H8zM14 12h2v2h-2z",
  /** Rótulo de precio con orificio cuadrado — nav "Categorías". */
  etiqueta: "M3 3h8l10 10-10 10L3 13z M7 7h2v2H7z",
  /** Carpeta con pestaña recta — nav "Áreas": agrupa categorías, distinto
   *  de la cuadrícula de "Panel" para no repetir glifo en el sidebar. */
  carpeta: "M3 6h6l2 2h10v11H3z",
  /** Lista de tres filas — nav "Sesiones". */
  sesiones: "M4 6h2v2H4zM8 6h12M4 12h2v2H4zM8 12h12M4 18h2v2H4zM8 18h8",
  /** Documento con esquina doblada y visto interno — nav "Auditoría". */
  auditoria: "M5 3h9l5 5v13H5z M14 3v5h5 M8 13l3 3 6-7",
  /** Barras de altura desigual sobre línea base — nav "Comparativo". */
  comparativo: "M2 20h20M5 20V12M10 20V4M15 20V15M19 20V9",
  /** Ángulo recto — marca el destino activo del sidebar. */
  chevron: "M9 4l8 8-8 8",
  /** Puerta abierta + flecha saliente — botón "Salir" del sidebar (nunca el
   *  texto "Cerrar sesión": ver AdminLayout.tsx). */
  cerrar: "M14 3H5v18h9M20 12H9M16 8l4 4-4 4",
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
