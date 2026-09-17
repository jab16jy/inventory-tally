# analisis-precio-pdf

## Objetivo

Mejorar la pantalla de análisis de sesión (`AnalisisScreen`, `/admin/sesiones/:sesionId/analisis`) en dos frentes: ordenar categorías por precio numérico real (no alfabético) y permitir exportar/imprimir la sesión, sin costo de servidor.

## Problema

1. El desglose por Categoría ordena la primera columna (`etiqueta`, que para categorías ES el precio, ej. "$1.000") como texto. `valorOrden: (f) => f.etiqueta` en `columnasTabla` (apps/web/src/ui/admin/AnalisisScreen.tsx:198-228) hace que "$10.000" quede antes que "$2.000". La columna "Valor" (total contado) ya ordena bien numéricamente — ese no es el problema.
2. No hay forma de exportar/imprimir la sesión de análisis.

## Por qué

El admin necesita revisar rápido qué categorías de precio alto/bajo concentran el conteo, y a veces necesita una copia física/PDF de la sesión (cierre de caja, auditoría interna).

## Alcance

- Task 1: cuando `dimension === "categoria"`, ordenar la columna de precio numéricamente (asc/desc), no como string. No tocar el comportamiento de "area"/"cajero" (ahí `etiqueta` es un nombre, no un precio — el orden string ahí es correcto).
- Task 2: acción "Imprimir/Exportar" en `AnalisisScreen` que dispara `window.print()`, con CSS de impresión (`@media print` / variantes `print:` de Tailwind) que oculta chrome no imprimible (botones, nav, toggle "vs. sesión anterior") y deja la tabla y las tarjetas resumen legibles en la página impresa.

## Restricciones (no negociables)

- **Cero backend nuevo para el PDF**: nada de Cloud Function, Cloud Storage, ni llamada nueva. Decisión explícita del usuario por costo: el proyecto ya corre en plan Blaze (Cloud Functions v2 lo exige siempre), y la preocupación real es no salirse de las cuotas gratis mensuales de Blaze. Un PDF generado en servidor consumiría esa cuota en cada exportación; imprimir desde el navegador no consume nada de backend.
- **Cero dependencia nueva**: no instalar jsPDF ni librerías equivalentes (confirmado que no hay ninguna instalada). Usar la función nativa `window.print()`.
- TDD estricto activo en este proyecto (AGENTS.md §2): RED observado antes de implementar, luego GREEN, luego REFACTOR, por tarea.
- RDD (revisión) está ON global — se corre `gentle-ai review assess` después de cada commit de work-unit.

## Checklist

- [x] **T1** — Ordenar categorías por precio numérico en el desglose por Categoría.
  - Criterio de aceptación: con dimension="categoria", el orden por la columna de precio es numérico ascendente/descendente (no alfabético). Dimensiones "area"/"cajero" sin cambios de comportamiento. Test cubre el caso "$10.000" vs "$2.000" ordenando correctamente.
  - Evidencia: RED confirmado (test fallaba mostrando "$150000" primero al ordenar asc). Fix: `FilaDimension.precioUnitario` nuevo (opcional, sólo poblado en la rama "categoria" de `agruparPorDimension`, packages/shared/src/services/calculadora-analisis.ts) + `columnasTabla` en AnalisisScreen.tsx usa `valorOrden: dimension === "categoria" ? (f) => f.precioUnitario ?? 0 : (f) => f.etiqueta`. GREEN: 31/31 tests AnalisisScreen.test.tsx, 48/48 calculadora-analisis.test.ts, typecheck limpio en apps/web y packages/shared.
- [x] **T2** — Exportar/imprimir la sesión de análisis vía `window.print()`.
  - Criterio de aceptación: botón "Imprimir" visible en `AnalisisScreen`; CSS de impresión oculta elementos no imprimibles y mantiene tabla + resumen legibles; sin nuevas dependencias ni llamadas a backend. Test cubre que el botón dispara `window.print` y que el estado de carga/skeleton y sesión sin líneas contadas no rompen la impresión.
  - Evidencia: RED confirmado (botón "Imprimir" no existía). Fix: botón nativo `onClick={() => window.print()}` en la cabecera de AnalisisScreen.tsx, con `print:hidden` (Tailwind); el toggle "vs. sesión anterior" también lleva `print:hidden`. GREEN: 33/33 tests AnalisisScreen.test.tsx, typecheck limpio.
  - Limitación conocida (fuera de alcance, documentada, no silenciosa): el sidebar/nav de `AdminLayout` (shell compartido por las 7 pantallas del panel admin) no lleva `print:hidden` — tocarlo es un cambio de un componente compartido fuera del alcance de esta feature (sólo AnalisisScreen). Al imprimir, el navegador seguiría mostrando esa barra lateral. Si se quiere resolver, es una tarea separada sobre AdminLayout, no de este feature.

## Progreso

- 2026-09-17: documento creado, rama `feat/analisis-precio-pdf` creada desde `main` (boundary: `9d03189`).
- 2026-09-17: T1 commiteado (`4b56b52`). `gentle-ai review assess` → risk=medium, deferido a cierre de slice (no revisa ahora).
- 2026-09-17: T2 implementado y verificado (RED→GREEN). Pendiente commit de work-unit.

## Próximo paso

Commit de work-unit para T2. Con las dos tareas cerradas, la feature termina: cerrar slice y correr la revisión diferida (`gentle-ai review status --next-transition` desde el boundary `9d03189`).
