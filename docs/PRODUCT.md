# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Dos roles, sin un tercero (`docs/diseno/01-requisitos-y-alcance.md#2-actores`):

- **Cajero** — el usuario de este documento y del alcance actual. Está de pie en una bodega con poca luz, sostiene el teléfono en una mano a unos 40 cm de la cara y a veces lleva guantes. Cuenta durante 2 a 4 horas seguidas, la misma acción repetida decenas de veces. Usa la app **una vez cada quince o treinta días**, así que no recuerda el flujo de una sesión a la siguiente. La conectividad es mixta: WiFi en algunas sucursales, datos móviles en otras, y a veces se pierde señal a mitad del conteo. El cajero puede tener varias sucursales asignadas, pero cuenta **una sucursal a la vez**. Ve el precio y el subtotal de su propia línea; nunca el consolidado de la sesión (ADR-23).
- **Administrador** — gestiona cajeros, sucursales y categorías; abre y cierra sesiones de conteo; ve el dashboard analítico con dinero y comparativo entre sucursales. También puede contar. Su panel es de escritorio (`/admin`, `docs/plan-panel-administrador.md`) y está construido: `cerrarSesion`, `crearCajero` y el resto de callables que necesita ya existen. Queda excluido de `docs/plan-diseno-visual-pwa.md`, que es sólo el flujo móvil del cajero.

> **Desambiguación:** "Salir" en el panel admin llama a `signOut` de Firebase — cierra la *sesión de autenticación* del navegador. Es un concepto distinto de la callable `cerrarSesion`, que cierra una *sesión de conteo* (una sesión abierta en `/sucursales` con verificación RF-16). Comparten la palabra "sesión" en español pero no se refieren a lo mismo.

## Product Purpose

Reemplaza el conteo de inventario producto por producto por un **conteo por categoría de valor**: el precio de venta ya agrupa el inventario de forma suficientemente útil, así que un mismo flujo cuenta `$1.000` igual que `$150.000`. Varios cajeros cuentan la misma sucursal en paralelo y sus aportes se suman en un total de equipo. Éxito = ningún aporte registrado se pierde (RF-09, RNF-03, RNF-12) y el cierre de sesión sólo ocurre cuando todos los participantes sincronizaron (RF-16).

## Positioning

La app no muestra "cuántas unidades hay", muestra **cuánto contaste tú** frente a **cuánto lleva el equipo**, siempre como dos números separados y nunca fusionados en uno solo que "salte" al sincronizar (`docs/diseno/11-ux-y-navegacion.md#4-pantalla-de-conteo`). Esa separación —y la garantía de que el aporte propio nunca se pierde aunque el dispositivo esté offline— es lo que un conteo genérico de inventario no ofrece.

## Operating Context

- **Escenario físico**: bodega, de pie, poca luz, una sola mano libre, a veces con guantes, sesión de 2 a 4 horas.
- **Cadencia de uso**: mensual o quincenal, nunca diario. Es la restricción de UX más subestimada según `docs/diseno/11-ux-y-navegacion.md#1-contexto-real-de-uso`: una app de uso mensual tiene que explicarse sola cada vez, no puede depender de memoria muscular.
- **Conectividad**: existe al inicio de la sesión (el cajero llega, inicia sesión, carga el catálogo) pero puede perderse durante el recorrido; nunca se asume ausente desde el arranque (supuesto 7, `docs/diseno/01-requisitos-y-alcance.md#5-supuestos-de-diseño`). Algunas sucursales sólo tienen datos móviles.
- **Flujo de la sesión**: `/sucursales` → `/conteo/:id/preparar` (precarga + recordatorio de los 4 pasos) → `/conteo/:id` (pantalla crítica) → bottom sheet para registrar cantidad → `/conteo/:id/finalizar` (confirma sincronización antes de salir).
- **Navegación fuera del conteo**: tres pestañas en una barra inferior — Conteos (`/sucursales`), Mis conteos (`/mis-conteos`, con el análisis de cada sesión **en unidades**) y Cuenta (`/cuenta`). La barra desaparece al entrar a contar: durante el conteo el cajero ejecuta una tarea, no navega (`docs/diseno/11-ux-y-navegacion.md#2-mapa-de-navegación`).
- **Instalación de la PWA**: parte del procedimiento de alta de todo cajero, no una sugerencia opcional — una PWA instalada tiene mejores garantías de almacenamiento que una pestaña de navegador (`docs/diseno/11-ux-y-navegacion.md#7-instalación-de-la-pwa`).

## Capabilities and Constraints

- El conteo es acumulativo por cajero: cada uno declara cuánto contó **él**, no el total del anaquel; corregir un error es editar el propio aporte, nunca el de otro (supuestos 4–5).
- El cajero nunca ve el consolidado de la sesión (`resumen`, `historicos`); esa separación se aplica en las Security Rules del backend, no sólo en la interfaz (`docs/diseno/01-requisitos-y-alcance.md#2-actores`, ADR-23). Sí ve el precio y el subtotal de su propia línea.
- La app debe funcionar 100 % offline para las operaciones de conteo (RNF-02) y seguir funcionando correctamente tras 30 días sin abrirse (RNF-11) — de ahí que la tipografía esté autoalojada y nunca dependa de un CDN.
- El cierre de una sesión de conteo verifica que todos los participantes hayan sincronizado antes de permitirlo (RF-16); es la salvaguarda que compensa la menor durabilidad del almacenamiento local en una PWA.
- Presupuestos técnicos que acotan cualquier pantalla nueva: rendimiento de UI ≥ 55 fps con hasta 200 categorías (RNF-05, < 20 ms/frame), consumo de datos < 1,5 MB por sesión tras la carga inicial (RNF-10), bundle < 500 KB comprimido, arranque < 5 s en 4G / < 3 s con service worker caliente (RNF-07).
- Accesibilidad exigida por producto: contraste mínimo AA (4.5:1), objetivos táctiles ≥ 48×48 px, escalado de texto probado hasta 200 %, `aria-label` descriptivo en cada fila de conteo, moneda en `Intl.NumberFormat('es-CO', …)` cuando aplique (sólo para el administrador).
- **Fuera de alcance explícito** (`docs/diseno/01-requisitos-y-alcance.md#33-fuera-de-alcance-explícito`): gestión de productos/SKU individuales, facturación o movimientos de inventario, multi-empresa con aislamiento por organización. También fuera del alcance visual actual: el panel de administrador completo.
- **Deseable, no construido**: exportar a Excel/PDF, comparar contra el inventario teórico del POS, escaneo de código de barras, apps nativas vía tienda de aplicaciones.

## Evidence on Hand

No hay activos de marca, capturas, testimonios ni datos de producción disponibles en el repo más allá de la documentación técnica en `docs/diseno/`. Cualquier nombre de marca, logo o tono de voz de marketing queda **sin definir**: no fabricar ninguno.

## Product Principles

1. **Ningún aporte se pierde.** Es la garantía central del producto (RF-09, RNF-03, RNF-12) y la razón de ser de la firma visual del sistema (ver `docs/DESIGN.md`).
2. **El uso mensual manda sobre la sutileza.** Cada pantalla tiene que explicarse sola, sin apoyarse en memoria muscular de una sesión anterior.
3. **El cajero ve el precio y el subtotal de su propia línea; el administrador ve el consolidado.** La separación protege el consolidado de sesión (ADR-07), no el valorUnitario de una línea.
4. **El estado de sincronización nunca bloquea, pero tampoco se esconde.** Offline es un estado normal del flujo, no un error.
5. **Corregir es un toque.** El error humano (contar dos veces, teclear de más) se corrige editando el propio aporte, sin diálogos de confirmación innecesarios salvo cuando el riesgo es real (cantidad 10× el promedio).

## Accessibility & Inclusion

Contraste mínimo AA (4.5:1), objetivos táctiles ≥ 48×48 px (ver `docs/DESIGN.md` para el valor real implementado), escalado de texto probado hasta 200 % en unidades `rem`, HTML semántico con `aria-label` descriptivo por fila, verificación con VoiceOver en iOS y un lector de pantalla en Chrome/Android (`docs/diseno/11-ux-y-navegacion.md#9-accesibilidad-y-localización`).
