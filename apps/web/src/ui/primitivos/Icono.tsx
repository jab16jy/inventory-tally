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

  // ── LayoutCajero (docs/plan-diseno-visual-pwa.md, nav inferior cajero) ──
  /** Una sola figura de hombros rectos (líneas diagonales, nunca un arco) —
   *  nav "Cuenta" del cajero. Distinta de `usuarios`, que son DOS figuras
   *  hechas de rectángulos apilados sin hombro: aquí hay una sola persona y
   *  el cuerpo se angosta hacia la cabeza con dos tramos rectos, no con un
   *  bloque cuadrado repetido. */
  cuenta: "M9 3h6v6H9z M5 21v-2l4-6h6l4 6v2z",

  // ── borrado real con guardas (categorías, áreas, cajeros) ──
  /** Papelera cuadrada: tapa recta, sin curva de tacho — botón "Eliminar" en
   *  las pantallas de admin. */
  papelera: "M4 6h16M9 6V4h6v2M6 6l1 14h10l1-14M10 10v6M14 10v6",
  /** Flecha recta hacia una bandeja abierta — botón "Exportar PDF" de
   *  AnalisisScreen.tsx. Punta en ángulo recto (tramos rectos, como
   *  `chevron`), nunca curva. */
  descargar: "M12 3v12M7 10l5 5 5-5M4 15v6h16v-6",
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
