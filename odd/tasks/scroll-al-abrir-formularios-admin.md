# scroll-al-abrir-formularios-admin

## Objetivo

Que el admin vea el formulario de crear/editar en cuanto lo abre, aunque tenga la tabla scrolleada hacia abajo.

## Problema

En `AreasScreen.tsx`, `CategoriasScreen.tsx`, `CajerosScreen.tsx` y `SucursalesAdminScreen.tsx`, el formulario de crear/editar se pinta arriba del `<section>`, pero quien scrollea es el `<main className="overflow-y-auto">` de `AdminLayout.tsx`, no la ventana. Con muchas filas en la tabla, el admin hace click en "Editar" y no ve que el formulario se abrió: la tabla sigue mostrando la fila donde estaba scrolleado y el formulario queda fuera de vista, arriba.

## Por qué

Usabilidad básica del panel admin: una acción que no se ve como si hubiera pasado (aunque sí pasó) genera doble click y confusión, sobre todo en sucursales/áreas/categorías/cajeros con más de una pantalla de filas.

## Alcance

- T1: hook `useScrollAlAbrir<T>(abierto)` + wiring en las 4 pantallas (`AreasScreen.tsx`, `CategoriasScreen.tsx`, `CajerosScreen.tsx`, `SucursalesAdminScreen.tsx`).

## Restricciones (no negociables)

- Cero dependencia npm nueva.
- Cero backend/Cloud Function nuevo.
- Sigue siendo scroll nativo del navegador (`Element.scrollIntoView`), sin librería de scroll ni polyfill.

## Checklist

- [x] **T1** — Hook `useScrollAlAbrir<T>(abierto)` + wiring en las 4 pantallas.
  - Evidencia: RED confirmado (el formulario se renderizaba fuera del contenedor con `ref`, sin invocar `scrollIntoView` al abrir). Fix: nuevo hook en `apps/web/src/state/useScrollAlAbrir.ts` que expone un `RefObject<T | null>` y, en un `useEffect` sobre `[abierto]`, llama `ref.current?.scrollIntoView?.({ behavior: "smooth", block: "start" })` — doble optional-chaining porque jsdom (usado en los tests) no implementa `scrollIntoView`, así que la llamada no truena aunque el método no exista. Cada pantalla envuelve su formulario condicional en un `<div ref={formularioRef}>` donde `formularioRef = useScrollAlAbrir<HTMLDivElement>(formulario !== null)`. GREEN: 66/66 tests en las 4 pantallas (`AreasScreen.test.tsx`, `CategoriasScreen.test.tsx`, `CajerosScreen.test.tsx`, `SucursalesAdminScreen.test.tsx`), `tsc -p tsconfig.json --noEmit` limpio.

## Progreso

- 2026-09-17: documento creado, rama `feat/scroll-al-abrir-formularios-admin` creada desde `main`.
- 2026-09-17: T1 implementado y probado en sesión previa (hook + wiring en las 4 pantallas), recuperado de stash y re-verificado: `tsc --noEmit` limpio, `npx vitest run` de las 4 suites de pantallas admin (66/66 en verde).

## Cierre

La única tarea de esta feature quedó implementada, tipada y probada: el hook `useScrollAlAbrir` centraliza el scroll nativo hacia el formulario recién abierto y las 4 pantallas admin lo usan de forma idéntica. Cero dependencias nuevas, cero backend nuevo, scroll 100% nativo del navegador.

## Próximo paso

Ninguno pendiente de esta feature. RDD sobre el diff completo antes de abrir el PR.
