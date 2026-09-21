# analisis-pdf-orden-precio

## Objetivo

En `AnalisisScreen` (`/admin/sesiones/:sesionId/analisis`): permitir elegir explícitamente el orden del desglose por Categoría (por valor total o por precio) y reemplazar `window.print()` por un PDF real, generado y descargado en el navegador.

## Problema

1. El orden por precio existe (`analisis-precio-pdf` T1), pero sólo se alcanza con clicks en el encabezado de la columna — y en móvil `Tabla` pinta tarjetas, sin encabezado clicable: ahí no hay forma de ordenar por precio.
2. `window.print()` depende del diálogo del navegador (márgenes, encabezados/pies del navegador, "Guardar como PDF" escondido en móvil) y produce una hoja con aspecto de pantalla impresa, no de documento.

## Por qué

El admin necesita un PDF presentable de la sesión (cierre de caja, auditoría interna) y poder revisar las categorías de precio alto/bajo desde cualquier dispositivo.

## Alcance

- T1: selector "Ordenar por" junto a "Desglose por", visible sólo en dimensión Categoría: "Mayor valor total" (por defecto), "Precio mayor → menor", "Precio menor → mayor".
- T2: generador puro de PDF `apps/web/src/ui/admin/pdf-analisis.ts` (jsPDF + jspdf-autotable).
- T3: botón "Exportar PDF" en lugar de "Imprimir", con carga diferida del generador, estado "Generando…" y error visible. ADR nueva.

## Restricciones (no negociables)

- **Revierte la restricción "cero dependencia nueva" de `analisis-precio-pdf`** por decisión explícita del usuario: se eligen `jspdf` + `jspdf-autotable`, cargadas de forma diferida (`import()` dinámico) para no pesar en el bundle inicial.
- La restricción de costo NO cambia: cero backend, cero Cloud Function, cero Firebase Storage. El PDF se genera y descarga en el navegador; no consume cuota de Blaze.
- TDD estricto (AGENTS.md §2): RED observado antes de cada implementación, GREEN después.
- `Tabla.tsx` sin cambio de comportamiento (T1 se cablea con `ordenInicial` + `key`). Única edición: su comparador se exporta como `ordenarFilas` (T2) para que el PDF no duplique el orden.
- Gramática de íconos de `Icono.tsx` si se agrega uno.

## Checklist

- [x] **T1** — Selector "Ordenar por" en `AnalisisScreen.tsx`.
  - Evidencia: RED confirmado (6 tests nuevos fallaban con `Unable to find role="combobox" and name /ordenar por/i`). Fix: constante `ORDENES_CATEGORIA` (la primera entrada reutiliza `ORDEN_INICIAL_TABLA`), `<select>` dentro del mismo wrapper `print:hidden` de "Desglose por", renderizado sólo con `dimension === "categoria"`, más `<p className="hidden print:block">Ordenado por …</p>`. `Tabla` sin cambios de comportamiento: `ordenInicial={ordenAplicado.orden}` + `key={ordenCategoria}` para remontarla (comentario `ponytail:` con el techo y la salida: prop `orden` controlada). El `key` no depende de la dimensión, así que el test existente "el orden elegido sobrevive al cambio de dimensión" sigue en verde. Cubre escritorio y móvil (`innerWidth = 400`, tarjetas sin encabezado clicable). GREEN: 41/41 `AnalisisScreen.test.tsx`.
- [x] **T2** — Generador puro `pdf-analisis.ts` + tests.
  - Evidencia: RED confirmado (`Failed to resolve import "./pdf-analisis.js"`), y RED propio para el formateador compartido `variacionConSigno` en `lib/formato.ts` (`variacionConSigno is not a function`, 3 tests): la lógica de signo del `Delta` de la pantalla se movió ahí para que pantalla y PDF no la dupliquen. El comparador de `Tabla` se extrajo a `ordenarFilas` exportado (mismo código, cubierto por los 17 tests de `Tabla.test.tsx`) para que el PDF ordene idéntico a la tabla. Fix: `filasPdfAnalisis`, `resumenPdf`, `nombreArchivoPdf`, `generarPdfAnalisis`, `descargarPdfAnalisis`. Verificado visualmente renderizando PDFs reales de 1 y 2 páginas: Helvetica/WinAnsi muestra bien tildes, ñ, "·" y U+00A0; U+2212, U+2192 y U+202F (espacio fino de "a. m." en `fecha()`) NO existen en WinAnsi y se traducen a `-`, `a` y espacio sólo en el PDF. GREEN: 10/10 `pdf-analisis.test.ts` en jsdom (no hizo falta `@vitest-environment node`), 17/17 `formato.test.ts`.
  - Stryker: `apps/web/stryker.pdf-analisis.conf.json`, acotado a las líneas 1-102 (helpers puros; el dibujo con coordenadas no se mutea: matar esos mutantes exigiría tests tautológicos sobre posiciones). Primera corrida sobre el archivo completo: 41,14 %. Sobre los helpers: 98 % → un superviviente (recorte de guiones en el slug) → test nuevo → **100 %** (44 killed, 6 timeout, 0 survived).
- [x] **T3** — Botón "Exportar PDF" + ADR + docs.
  - Evidencia: RED confirmado (3 tests con `Unable to find … role "button" and name /exportar pdf/i`; el test de esqueleto pasaba vacío, su par afirmativo es el primero). Fix: `exportarPdf` con `import("./pdf-analisis.js")` dinámico, `disabled` + "Generando…" mientras corre, `role="alert"` visible si falla (sin catch silencioso), ícono nuevo `descargar` en `Icono.tsx`. Los datos salen de lo ya calculado en pantalla, filas vía `ordenarFilas` con el orden aplicado. GREEN: 43/43 `AnalisisScreen.test.tsx` (se reemplazaron los 2 tests de `window.print`/esqueleto por 4), 236/236 en `src/ui/admin`.
  - Docs: ADR-28 en `docs/diseno/13-decisiones-adr.md`; doc 10 §8 (decía "Cloud Function → Cloud Storage") y `docs/PRODUCT.md` ("exportar a PDF: no construido") corregidos. Ningún doc mencionaba `window.print`.
- [x] **T4** — Seguimiento de los hallazgos informativos de RDD (R4-1, R4-2, R3-001, R3-002).
  - R4-1 + R4-2 — RED confirmado (2 tests: `console.error` no se llamaba con el error; sin conexión la alerta no decía que hace falta internet). Fix: el `catch` registra `console.error("Exportar PDF falló", error)` y el mensaje depende de `enLinea` (`useConexion`): sin conexión dice que la primera exportación necesita internet, porque el chunk de jsPDF no está en el precache. Par afirmativo: el test en línea sigue esperando el mensaje genérico. GREEN: 44/44 `AnalisisScreen.test.tsx`.
  - R3-001 — rango de `stryker.pdf-analisis.conf.json` ampliado a 1-109 (cubre `nombreArchivoPdf` completo). Stryker: **100 %** (44 killed, 6 timeout, 0 survived), las mismas cifras que con 1-102: Stryker ya mutaba la cadena porque la expresión arranca en la línea 102; el rango nuevo lo deja explícito.
  - R3-002 — borrado el ícono `imprimir` de `Icono.tsx` (sin usos tras T3).
- [x] **T5** — `AGENTS.md` reducido a lo esencial (a pedido del usuario): Stryker pasa a opcional, sólo para lógica grave (dinero, seguridad, pérdida de conteos); se documenta el flujo ODD; se quitan las reglas que ya cubren los hooks y las instrucciones globales (escalera ponytail completa, Engram). Las secciones que citan código y docs (§0 docs, §1 ponytail, §2 TDD, §3 RDD, §5 convenciones) conservan su número; el archivo queda con §0-§7. Comentario de `eslint.config.js` alineado.

## Progreso

- 2026-09-20: documento creado, rama `feat/analisis-pdf-orden-precio` creada desde `main` (`3097283`).
- 2026-09-20: T1, T2 y T3 implementadas con TDD (RED → GREEN por tarea), sin commits: el working tree queda para revisión adversarial y commits por unidad.
- 2026-09-20: verificación final — `npm run typecheck` limpio, `npm run lint` limpio, `npm test` en raíz: `apps/web` 62 archivos / 529 tests, más los demás workspaces (115, 264, 120, 71), todo en verde, ninguno en skip. `npm run build`: jsPDF queda en su propio chunk `pdf-analisis-*.js` (424,6 kB / 139,5 kB gzip) + chunks opcionales de jsPDF (`html2canvas`, `purify`, `index.es`); el chunk principal no contiene código de jsPDF.
- 2026-09-20: `globIgnores` en `apps/web/vite.config.ts`: jsPDF y sus chunks opcionales quedan fuera del precache del PWA (precache: 8 entradas).
- 2026-09-20: RDD (ON global) — revisión del slice completo, riesgo high (16 archivos, 1112 líneas), 4 lentes con Sonnet 5 (lineage `review-56186efb7673889c`). Resultado: **approved**, 0 bloqueantes. Acuse confirmado (authority burned, normal post-acuse). Hallazgos informativos, quedan como trabajo aparte:
  - R3-001 (WARNING): el rango de `stryker.pdf-analisis.conf.json` (1-102) deja fuera el cuerpo de `nombreArchivoPdf`.
  - R3-002 (SUGGESTION): el ícono `imprimir` de `Icono.tsx` quedó sin uso.
  - R4-1 (WARNING): sin conexión y sin el chunk en caché, "Exportar PDF" falla con un mensaje genérico; podría avisar que hace falta conexión.
  - R4-2 (WARNING): el `catch` de la exportación descarta el error sin registrarlo.
- 2026-09-20: commits por unidad: `93f0377` (refactor), `1e95318` (generador PDF), `9f71d3d` (selector + botón).
- 2026-09-20: T4 y T5 implementados (seguimiento de hallazgos + AGENTS.md). Checklist en verde (530 tests web; un timeout del emulador en `packages/functions`, paquete no tocado, pasó 264/264 al re-correr).
- 2026-09-20: RDD del seguimiento — riesgo medium (7 archivos, 303 líneas), 1 lente `review-reliability` con Sonnet 5 (lineage `review-6527e92e82da6491`). **approved**, 0 bloqueantes, acuse confirmado. Único hallazgo informativo (WARNING, redacción de T5 sobre la numeración de AGENTS.md) corregido en este registro.
- 2026-09-20: commits: `78a30c6` (aviso sin conexión + log), `c4ef2f3` (ícono + Stryker), `85a64ec` (AGENTS.md).

## Cierre

Las tres tareas quedaron implementadas con TDD estricto. Dos dependencias nuevas (`jspdf` ^4.2.1, `jspdf-autotable` ^5.0.8) cargadas de forma diferida, cero backend/Storage. Límites conocidos, documentados: el PDF sigue el orden del selector, no un orden manual por encabezado (vive dentro de `Tabla`); cambiar "Ordenar por" remonta `Tabla` y reinicia ese orden manual.

## Próximo paso

Push/PR a criterio del usuario.
