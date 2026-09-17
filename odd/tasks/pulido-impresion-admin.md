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

- [x] **T1** — Afordancia de orden en columnas no activas de `Tabla.tsx`.
  - Evidencia: RED confirmado (`toHaveClass("cursor-pointer")` y `querySelector("svg")` fallaban en columna no activa). Fix: `cursor-pointer` en el botón + `Icono nombre="chevron"` siempre presente (atenuado `text-tenue` sin rotar cuando no está activa). GREEN: 17/17 `Tabla.test.tsx`, 33/33 `AnalisisScreen.test.tsx` sin regresión.
- [x] **T2** — Ícono + restyle del botón "Imprimir" en `AnalisisScreen.tsx`.
  - Evidencia: RED confirmado (`boton.querySelector("svg")` era `null`). Fix: nuevo path `imprimir` en `Icono.tsx` (sólo `M`/`h`/`v`/`H`/`z`, sin curvas) + `<Icono nombre="imprimir">` antepuesto al texto dentro de un `<span>`. GREEN: 33/33 `AnalisisScreen.test.tsx`, el test existente `getByRole("button", { name: /imprimir/i })` siguió pasando sin tocarlo.
- [x] **T3** — Forzar layout de escritorio de `Tabla` al imprimir + `overflow-visible` en impresión.
  - Evidencia: RED confirmado (`useDisenoAdaptativo` seguía en `"movil"` tras `beforeprint`). Fix: efecto nuevo con listeners `beforeprint`/`afterprint` en `useDisenoAdaptativo.ts` (fuerza `"escritorio"`, restaura recalculando con `calcular(window.innerWidth)` — sin `matchMedia`, respeta la decisión documentada en la cabecera del archivo) + `print:overflow-visible` en el wrapper de `Tabla.tsx`. GREEN: 7/7 `useDisenoAdaptativo.test.ts`, 17/17 `Tabla.test.tsx`, 12/12 `AdminLayout.test.tsx`, 33/33 `AnalisisScreen.test.tsx`.
- [x] **T4** — `print:hidden` en ambos `<nav>` de `AdminLayout.tsx`.
  - Evidencia: RED confirmado (ambos navs sin `print:hidden`). Fix: clase agregada al sidebar de escritorio y a la barra inferior móvil. GREEN: 14/14 `AdminLayout.test.tsx`. Cierra la limitación conocida documentada en `odd/tasks/analisis-precio-pdf.md`.
- [x] **T5** — Estructura imprimible de `AnalisisScreen.tsx` + `EvolucionMensual.tsx`.
  - Evidencia: RED confirmado (cards sin `print:bg-white`/`print:border-black`, selector sin `print:hidden`, sparkline/botón sin `print:hidden`, `<ul>` sin `print:not-sr-only`). Fix: `print:border-black print:bg-white` en las 3 cards + `print:text-black` en sus textos planos (`Delta` se dejó igual — no acepta `className`, documentado en comentario de una línea); `print:hidden` en el wrapper del `<select>` + párrafo equivalente `hidden print:block` con `etiquetaDimension(dimension)` reutilizada; en `EvolucionMensual.tsx`, `print:hidden` en `Sparkline` y en el botón "Ver/Ocultar valores", `print:not-sr-only` en el `<ul>` (sin violar la regla de nunca usar `hidden`/`display:none` ahí). GREEN: 35/35 `AnalisisScreen.test.tsx`, 7/7 `EvolucionMensual.test.tsx`.

## Progreso

- 2026-09-17: documento creado, rama `feat/pulido-impresion-admin` creada desde `main` (`2114870`).
- 2026-09-17: T1 commiteado (`96fe565`).
- 2026-09-17: T2 commiteado (`d3a8609`).
- 2026-09-17: T3 commiteado (`a09a27f`).
- 2026-09-17: T4 commiteado (`9a55a3e`).
- 2026-09-17: T5 commiteado (`4810079`) + fix de tipo del test (`e6c02de`, `container.querySelector<HTMLElement>` para que `within()` tipara bien).
- 2026-09-17: verificación final — `tsc --noEmit` limpio, `npx vitest run` completo: 61 archivos, 508 tests, todos en verde, ninguno en skip. Cero dependencias nuevas (`git diff main --stat -- '**/package.json'` sin salida).

## Cierre

Las 5 tareas quedaron implementadas con TDD estricto (RED confirmado por tarea antes de cada fix) y sin romper ningún test existente del workspace `apps/web`. Cero dependencias npm nuevas, cero backend/Cloud Function nuevo — toda la impresión sigue siendo `window.print()` nativo + CSS de impresión (`print:*` de Tailwind). Cierra explícitamente la limitación conocida documentada en `odd/tasks/analisis-precio-pdf.md` (nav de `AdminLayout` sin `print:hidden`).

## Próximo paso

Ninguno pendiente de esta feature. Revisión RDD del slice completo pendiente de ejecutar (ver Progreso), y push/PR a criterio del usuario.
