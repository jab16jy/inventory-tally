# pulido-impresion-admin

## Objetivo

Pulir dos huecos de usabilidad del panel admin encontrados tras `analisis-precio-pdf`: la afordancia de orden de `Tabla.tsx` (nadie ve que una columna es ordenable antes del primer click) y la impresión real de `AnalisisScreen` (hoy el nav de `AdminLayout` y el layout móvil de `Tabla` se cuelan en el papel, y el botón Imprimir no tiene ícono).

## Problema

1. `Tabla.tsx`: el `<button>` de encabezado ordenable no tiene `cursor-pointer` (Tailwind v4 resetea `<button>` a `cursor: default`) y sólo muestra el ícono `chevron` cuando la columna YA está activa — ninguna columna ordenable comunica que lo es antes del primer click.
2. El botón "Imprimir" de `AnalisisScreen` es sólo texto — sin ícono, no encaja con el resto de acciones del panel que sí llevan `Icono`.
3. `useDisenoAdaptativo` decide el layout por `window.innerWidth`, que no cambia al imprimir: una sesión abierta en móvil imprime las tarjetas apiladas de `Tabla` en vez de la tabla de escritorio, y una tabla ancha se recorta por `overflow-x-auto`.
4. `AdminLayout.tsx`: ninguno de los dos `<nav>` (sidebar de escritorio, bottom nav móvil) lleva `print:hidden` — la navegación completa del panel sale impresa en cualquier pantalla admin (limitación conocida, documentada como fuera de alcance en `odd/tasks/analisis-precio-pdf.md`).
5. `AnalisisScreen`/`EvolucionMensual`: las cards de resumen no fuerzan contraste en blanco y negro, el `<select>` de dimensión imprime como control de formulario inútil, y el sparkline + botón "Ver valores" de `EvolucionMensual` no tienen sentido en papel.

## Por qué

Feature de acabado post-`analisis-precio-pdf`: esa feature ya dejó documentada la limitación de `AdminLayout` sin `print:hidden` como fuera de su alcance. Esta feature cierra esa deuda y pule el resto de la superficie de impresión antes de que el admin la use para cierre de caja/auditoría real.

## Alcance

- T1: afordancia de orden visible en toda columna ordenable de `Tabla.tsx`, no sólo la activa.
- T2: ícono `imprimir` en `Icono.tsx` + restyle del botón "Imprimir" de `AnalisisScreen`.
- T3: forzar `useDisenoAdaptativo` a `"escritorio"` durante `beforeprint`/`afterprint`; `overflow-x-auto` → también `print:overflow-visible` en `Tabla.tsx`.
- T4: `print:hidden` en ambos `<nav>` de `AdminLayout.tsx`.
- T5: estructura imprimible de `AnalisisScreen.tsx` (cards, selector de dimensión) y `EvolucionMensual.tsx` (sparkline, botón, lista de valores).

## Restricciones (no negociables)

- Cero dependencia npm nueva.
- Cero backend/Cloud Function/Firebase Storage nuevo: sigue siendo `window.print()` nativo (misma decisión de costo que `analisis-precio-pdf`, plan Blaze).
- TDD estricto: RED confirmado antes de cada implementación, GREEN después, sin tests en skip.
- Gramática de íconos de `Icono.tsx`: `viewBox 0 0 24 24`, sólo comandos de líneas rectas (`M`/`h`/`v`/`z`, nunca `C`/`Q`/arcos), `strokeLinecap: "square"`, nunca emoji.

## Checklist

- [ ] **T1** — Afordancia de orden en columnas no activas de `Tabla.tsx`.
- [ ] **T2** — Ícono + restyle del botón "Imprimir" en `AnalisisScreen.tsx`.
- [ ] **T3** — Forzar layout de escritorio de `Tabla` al imprimir (`beforeprint`/`afterprint` en `useDisenoAdaptativo`) + `overflow-visible` en impresión.
- [ ] **T4** — `print:hidden` en ambos `<nav>` de `AdminLayout.tsx`.
- [ ] **T5** — Estructura imprimible de `AnalisisScreen.tsx` + `EvolucionMensual.tsx`.

## Progreso

- 2026-09-17: documento creado, rama `feat/pulido-impresion-admin` creada desde `main`.

## Cierre

(pendiente)

## Próximo paso

Empezar T1.
