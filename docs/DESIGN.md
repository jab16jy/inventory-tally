---
name: Conteo de Inventario — Placa de bodega
description: Sistema de diseño y flujo móvil del cajero para el conteo de inventario por categoría de valor.
colors:
  fondo: "#0F1115"
  placa: "#16191F"
  placa-alta: "#1E222A"
  borde: "#2A2F38"
  senal: "oklch(0.82 0.17 78)"
  senal-hueco: "oklch(0.82 0.17 78 / 0.28)"
  tinta: "#F2EFE9"
  tenue: "#8A9099"
  riesgo: "oklch(0.62 0.21 25)"
  riesgo-placa: "oklch(0.26 0.06 25)"
typography:
  numeral:
    fontFamily: "Archivo Variable, system-ui, sans-serif"
    fontSize: "2rem"
    fontWeight: 600
    lineHeight: 1
    letterSpacing: "-0.02em"
  medio:
    fontFamily: "Archivo Variable, system-ui, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 600
    lineHeight: 1
  base:
    fontFamily: "Archivo Variable, system-ui, sans-serif"
    fontSize: "0.9375rem"
    fontWeight: 400
    lineHeight: 1.4
  micro:
    fontFamily: "Archivo Variable, system-ui, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 400
    lineHeight: 1.4
rounded:
  placa: "2px"
spacing:
  toque: "3.5rem"
components:
  placa:
    backgroundColor: "{colors.placa}"
    rounded: "{rounded.placa}"
    padding: "12px 12px 12px 16px"
  boton-paso:
    backgroundColor: "transparent"
    textColor: "{colors.tinta}"
    rounded: "{rounded.placa}"
    size: "{spacing.toque}"
  boton-primario:
    backgroundColor: "{colors.senal}"
    textColor: "{colors.fondo}"
    rounded: "{rounded.placa}"
    height: "{spacing.toque}"
---

# Design System: Conteo de Inventario — Placa de bodega

## Overview

**Creative North Star: "Placa de bodega"**

El sistema rechaza el arreglo por defecto de la categoría de valor — una lista de cards redondeadas sobre near-black, etiquetas grises de 14 px y un FAB flotante — y lo reemplaza por un rótulo físico de estantería industrial: fondo casi negro, una sola señal ámbar de alta visibilidad, numerales condensados tabulares a 32 px, bloques de borde duro con radio casi cero. Es reconocible sin una sola palabra de contenido.

La dirección la impone el escenario físico, no la preferencia: un cajero de pie en una bodega con poca luz, teléfono en una mano a unos 40 cm, a veces con guantes, durante 2 a 4 horas. Sobre `#0F1115`, el ámbar de alta visibilidad es la mayor luminancia disponible — es derivación funcional, y además el color nativo de la señalética industrial de la que sale el mundo. Por la misma razón se **elimina el verde**: si el ámbar sólido ya significa "a salvo", un verde para "sincronizado" es un tercer color haciendo un trabajo que ya está hecho.

El contrato de dirección completo — THESIS / OWN-WORLD / STORY / FIRST VIEWPORT / FORM — vive como comentario en `apps/web/src/estilos/tema.css` y en el `<head>` de `apps/web/index.html`, y está desarrollado con su razonamiento completo en [`docs/plan-diseno-visual-pwa.md`](plan-diseno-visual-pwa.md). Este documento no lo repite entero; documenta cómo quedó **implementado**.

**Alcance actual.** Sólo el sistema de diseño base y el flujo móvil del cajero (fases F0–F1 del plan): los tokens, la fuente, y tres primitivos vestidos (`Placa`, `Numeral`, `BotonPaso`) aplicados a `LoginScreen`, `ConteoScreen`, `FilaCategoria` y los dos banners de riesgo. Las fases F2–F4 del plan — cabecera, `ChipEstado`, `BarraProgreso`, búsqueda, `Deck`, `Hoja` (bottom sheet), `Icono`, y las tres rutas nuevas (`/sucursales`, `/preparar`, `/finalizar`) — están **especificadas pero no construidas todavía**; no hay código que documentar para ellas más allá de lo que ya fija `docs/plan-diseno-visual-pwa.md#5-pantallas`. El panel de administrador queda fuera de todo el esfuerzo visual: depende de callables que no existen.

**Key Characteristics:**
- Fondo casi negro (`#0F1115`), una sola señal ámbar de alta visibilidad, rojo reservado exclusivamente a riesgo real de pérdida de datos.
- Numeral condensado tabular como outlier deliberado de la escala tipográfica: todo lo demás es discreto, el numeral es el mundo.
- Bloques de borde duro, radio casi cero (2 px); nunca sombra.
- Una sola firma visual: la regla de tinta izquierda de cada fila, hueca cuando el aporte está en tránsito y sólida cuando el servidor lo confirmó.
- Escala tipográfica fija en `rem` (modo *Operate*: nunca fluida) porque el sujeto de la pantalla es una tarea a completar, no una narrativa a explorar.

## Colors

Paleta de dos colores funcionales sobre una base de superficies neutras — nunca decorativa: cada color hace un trabajo específico y ninguno se repite.

### Primary
- **Señal ámbar** (`oklch(0.82 0.17 78)`, ≈ `#FFB407`, contraste 10.60:1 sobre `#0F1115`): la única señal de alta visibilidad del sistema. Sólida = confirmado por el servidor, a salvo, acción primaria (botón "Entrar", botón "Finalizar conteo"). Hueca (`oklch(0.82 0.17 78 / 0.28)`) = pendiente o en tránsito — mismo tono, sólo relleno.

### Secondary
- **Riesgo rojo** (`oklch(0.62 0.21 25)`, ≈ `#EA3C3F`, contraste 4.69:1): reservado en exclusiva a riesgo real de pérdida de datos — el banner de pendientes sin enviar, el de persistencia degradada, el error de login. Nunca decorativo.
- **Superficie de riesgo** (`oklch(0.26 0.06 25)`): fondo opaco detrás del texto de riesgo. Token añadido durante la implementación, no estaba en el plan original: el banner de pendientes es `sticky` sobre la lista en scroll, y un rojo translúcido dejaba pasar las filas por debajo justo cuando el mensaje más importa.

### Neutral
- **Fondo** (`#0F1115`): base de toda la app; fijado también por el manifest y `<meta name="theme-color">`, no se cambia sin tocar ambos.
- **Placa** (`#16191F`): superficie de cada bloque-rótulo (fila de categoría, tarjeta de login).
- **Placa alta** (`#1E222A`): superficie elevada un nivel — estado activo de un `BotonPaso`.
- **Borde** (`#2A2F38`): el único trazo del sistema; borde duro de 1 px en placas, campos y botones.
- **Tinta** (`#F2EFE9`, contraste 16.47:1): texto principal. Hueso, no blanco puro — menos glare sobre negro durante 2–4 horas de uso.
- **Tenue** (`#8A9099`, contraste 5.88:1): texto secundario (etiquetas, "Tú:"/"Equipo:", placeholders). Pasa AA para texto normal, no sólo para texto grande.

### Named Rules
**The No-Green Rule.** El sistema no usa verde. "Sincronizado" se comunica con ámbar sólido, no con un tercer color; añadir verde duplicaría un trabajo que el ámbar ya hace.

**The Left Ink Rule (la firma).** La regla de tinta izquierda de cada fila —una sola propiedad CSS, 4 px de ancho— pasa de hueca a sólida cuando el servidor confirma el aporte. Es la única audacia visual del sistema: todo lo demás se mantiene disciplinado y callado. Implementada en `apps/web/src/ui/primitivos/Placa.tsx`, condicionada por `aporteConfirmado(linea, aporte)` en `packages/shared/src/services/sincronizacion.ts`, que compara `linea.versiones[uid] >= aporte.version`. `aporte.version` la escribe el propio dispositivo y se ve al instante desde la caché local incluso sin red; `linea.versiones[uid]` sólo la escribe el trigger del backend después de agregar en el servidor — que la segunda alcance a la primera es, literalmente, la confirmación.

## Typography

**Display / Body / Label Font:** una sola familia variable, **Archivo Variable** (con `system-ui, sans-serif` de fallback). Un solo `.woff2` de 88 KB, autoalojado en `apps/web/public/fuentes/archivo-latin-var.woff2`, subset latin, ejes `wght` 100–900 y `wdth` 62–125 — verificado en el archivo descargado, no supuesto, así que no hizo falta el plan B de dos subsets (Archivo + Archivo Narrow). Nunca se sirve desde un CDN: RNF-11 exige que la app funcione tras 30 días sin abrirse, y una fuente remota falla sin red.

**Character:** un solo trazo cumple dos roles opuestos por variación de eje: condensado (`font-stretch: 75%`) para los numerales de denominación, normal para el resto de la interfaz. Es la fusión de "rótulo de estantería industrial" con "escala del numeral de billete" que da nombre a la dirección visual.

### Hierarchy
- **Numeral** (semibold 600, `2rem` / `--text-numeral`, `line-height: 1`, `letter-spacing: -0.02em`, `font-stretch: 75%`, `font-variant-numeric: tabular-nums`): el outlier deliberado de la escala. Denominación de cada categoría (`Numeral` primitivo, variante `placa`). Medido en Playwright/Chromium sobre iPhone 390×844 @2×: 32 px reales en pantalla.
- **Medio** (semibold 600, `1.125rem` / `--text-medio`, `line-height: 1`): cantidades dentro de un control, p. ej. la cifra central entre los botones `−`/`+`.
- **Base** (regular 400, `0.9375rem` / `--text-base`, `line-height: 1.4`): texto corrido y cuerpo por defecto de `<body>`.
- **Micro** (regular 400, `0.75rem` / `--text-micro`, `line-height: 1.4`): etiquetas, "Tú: N · Equipo: N", texto de campos de formulario.

Toda cifra numérica lleva `[data-numeral]`, que engancha `font-variant-numeric: tabular-nums` globalmente vía `@layer base` en `tema.css` — sin esto las columnas bailan al incrementar, justo en el momento en que el cajero está mirando la cifra.

### Named Rules
**The Numeral-Is-The-World Rule.** El numeral de denominación es el único outlier de la escala (2 rem contra una progresión de ~1.2 entre el resto). Todo lo demás se mantiene en un rango estrecho a propósito; el numeral es lo único que grita.

**El nombre real del token, y por qué no es el del plan.** `docs/plan-diseno-visual-pwa.md` especifica `--text-placa: 2rem`. El código implementado usa **`--text-numeral`**, no `--text-placa`. Motivo verificado en navegador: Tailwind v4 deriva el nombre de la clase de utilidad del sufijo del token, así que `--text-placa` (tipografía) y `--color-placa` (color) generaban ambos la clase `text-placa`, y ganaba el color — el numeral heredaba 15 px en vez de 32 y la jerarquía se caía en silencio. Cualquier trabajo futuro debe seguir usando `--text-numeral`; no revertir a `--text-placa`.

## Layout

Modo *Operate* (el visitante completa una tarea, no explora): escala tipográfica fija en `rem`, nunca fluida con `vw`/`clamp`. Contenedor centrado `max-w-md` (`ConteoScreen`, `LoginScreen`), con padding horizontal de 3 unidades Tailwind.

**Fila de categoría** (`FilaCategoria` dentro de `Placa`): mide ~82 px de alto en dispositivo real — el stepper `−`/`+` se centra contra las dos líneas de texto en vez de colgar de la primera línea, lo que ahorra ~23 px por fila frente a colgar del tope. Medido con Playwright/Chromium en viewport iPhone 390×844 @2×: **10 filas visibles en el primer viewport**, objetivo táctil de los botones `−`/`+` a 56×56 px (`--size-toque: 3.5rem`, por encima del mínimo de 48 px que fija `docs/diseno/11-ux-y-navegacion.md`).

**Virtualización nativa, no una librería.** Cada `<li>` de fila lleva `content-visibility: auto` y `contain-intrinsic-size: auto 5rem`: el navegador se salta el layout de las filas fuera de pantalla sin añadir `@tanstack/react-virtual` ni `react-window`. Se añadirá una librería sólo si un perfil con 200 filas incumple los 20 ms/frame de RNF-05; no verificado en este documento.

**Deck fijo inferior.** Especificado por el plan como tercio inferior fijo con totales y `FINALIZAR CONTEO`, siempre bajo el pulgar — **no implementado todavía** (primitivo `Deck` pendiente de F2). Documentado aquí como invariante de layout para cuando se construya, no como estado actual.

**Safe area.** `body` lleva `padding-top: env(safe-area-inset-top)` porque `viewport-fit=cover` en `index.html` mete la UI bajo el notch; sin el padding la cabecera queda debajo de la barra de estado en un iPhone real.

## Elevation & Depth

Sistema plano, sin sombras en ningún componente. La profundidad se comunica por **capas de superficie + borde**, no por `box-shadow`: `--color-fondo` (base) → `--color-placa` (bloque-rótulo) → `--color-placa-alta` (estado activo de un botón). Cada bloque declara su elevación una sola vez, con un borde de 1 px (`--color-borde`) — deliberadamente sin sombra, porque una sombra suave debajo de un borde duro produce la "card fantasma" que el mundo de "Placa de bodega" rechaza explícitamente.

### Named Rules
**The Flat-By-Default Rule.** Ninguna superficie usa `box-shadow`. La jerarquía visual se resuelve con color de fondo y borde, nunca con elevación simulada.

## Shapes

Bloques de borde duro, radio casi cero: `--radius-placa: 2px` en todos los contenedores (placas, botones, campos). No hay pastillas, círculos decorativos ni esquinas redondeadas de cortesía — el radio de 2 px es apenas suficiente para evitar el pixelado del borde, nunca una forma "suave".

El bloque-rótulo (`Placa`) lleva `border-l-0` deliberado: sin borde izquierdo propio, porque ese canto está reservado por completo a la regla de tinta (ver **The Left Ink Rule** en Colors). Ponerle borde ahí dejaba una línea gris de 1 px por fuera de la regla que la ensuciaba y la hacía leer como parte del marco en vez de como señal de estado.

## Components

Tres primitivos existen hoy en `apps/web/src/ui/primitivos/`. El plan especifica cuatro más (`ChipEstado`, `Deck`, `Hoja`, `Icono`) para las fases F2–F3 que **no están construidas todavía**; no se documentan aquí porque no hay implementación que describir — ver `docs/plan-diseno-visual-pwa.md#4-arquitectura-de-componentes` para su contrato previsto.

### Placa (contenedor / tarjeta de fila)
- **Corner Style:** 2 px (`--radius-placa`).
- **Background:** `--color-placa` sobre `--color-fondo`.
- **Border:** 1 px `--color-borde` en los tres lados salvo el izquierdo (reservado a la firma).
- **Shadow Strategy:** ninguna — ver Elevation & Depth.
- **Internal Padding:** `py-3 pr-3 pl-4` (Tailwind), asimétrico para dejar aire al canto de la firma.
- **Prop distintiva:** `confirmado?: boolean` — controla si la regla izquierda de 4 px (`aria-hidden`) es `--color-senal` sólido o `--color-senal-hueco`, con `transition-colors duration-200 ease-out`.

### Numeral (tipografía de cifras)
- **Uso:** toda cantidad y denominación del sistema; nunca texto libre.
- **Variantes:** `placa` (2 rem, el outlier — denominación de categoría), `medio` (1.125 rem — cifra del stepper), `base` (0.9375 rem — cifras en línea con texto corrido).
- **Comportamiento fijo:** `data-numeral` engancha `tabular-nums`, `font-stretch: 75%` y `letter-spacing: -0.02em` vía `@layer base`, sin que el consumidor tenga que repetirlo.

### BotonPaso (stepper `−` / `+`)
- **Shape:** cuadrado 56×56 px (`--size-toque`), radio 2 px.
- **Estado por defecto:** borde `--color-borde`, texto `--color-tinta`.
- **Active (no hover — dispositivo táctil):** borde y texto pasan a `--color-senal`, fondo a `--color-placa-alta`, transición de color 150 ms.
- **Disabled:** texto `--color-tenue` al 40 % de opacidad — nunca ámbar a saturación plena inactivo, para no entrenar al cajero a ignorar el color de la señal.
- **Nombre accesible:** siempre `Sumar {etiqueta}` / `Restar {etiqueta}` con la etiqueta real de la categoría (p. ej. "Sumar $5.000"); es una restricción fija por los tests, no una convención libre.
- **Glifos:** signo menos real (`−`, U+2212) y más (`+`, U+002B) — nunca el guion de teclado, que se ve corto y desalineado a este tamaño.

### Botón primario (patrón, aún sin extraer a primitivo)
Usado hoy inline en `LoginScreen.tsx` ("Entrar") y previsto para "Finalizar conteo": ancho completo, alto mínimo 56 px, radio 2 px, fondo `--color-senal` / texto `--color-fondo`. Estado de envío: fondo al 40 % de opacidad, texto ámbar apagado — nunca un spinner reemplazando el texto.

### Campos de formulario (patrón, en `LoginScreen`)
- **Style:** borde `--color-borde`, fondo `--color-fondo`, radio 2 px, alto mínimo 56 px.
- **Focus:** el foco global de `:focus-visible` en `tema.css` pone `outline: 2px solid var(--color-senal)` con `outline-offset: 2px` — swap de color duro, sin glow ni ring difuso.
- **Label:** siempre un `<label>` real asociado por `htmlFor`/`id` (nunca floating label ni sólo placeholder) — restricción fija por `LoginScreen.test.tsx`, que exige los labels "Correo" y "Contraseña" y el botón "Entrar".
- **Error:** `role="alert"`, borde `--color-riesgo`, fondo `--color-riesgo-placa`, inline junto al formulario — nunca en modal, para que el cajero vea el error y los campos a la vez.

### Banners de riesgo (`BannerPendientes`, `BannerPersistenciaDegradada`)
Componente distintivo del sistema: `role="alert"` + `aria-live="assertive"`, borde y fondo `--color-riesgo`/`--color-riesgo-placa`, **sin botón de cierre, nunca** — cerrar la app con pendientes pierde conteos en silencio, así que el aviso es insistente y no descartable. Es una restricción de accesibilidad fija por los tests de la pantalla de conteo: ningún botón cuyo nombre accesible haga match con `/cerrar|descartar/i` puede existir ahí; un futuro "Cerrar sesión" en cabecera debe llamarse "Salir". Sólo puede haber un `role="alert"` visible a la vez en la pantalla de conteo.

## Do's and Don'ts

### Do:
- **Do** usar la regla de tinta izquierda (`Placa` + `confirmado`) como la única señal audaz del sistema; todo lo demás se mantiene disciplinado.
- **Do** poner `data-numeral` (vía el primitivo `Numeral`) en toda cifra, para que las columnas no bailen al incrementar.
- **Do** mantener `Tú: N` y `Equipo: N` cada uno en un solo nodo de texto — es la restricción más fuerte del markup de fila (`ConteoScreen.test.tsx` consulta `findByText(/tú: 1/i)`).
- **Do** usar nombres accesibles `Sumar {etiqueta}` / `Restar {etiqueta}` en los botones de paso, y un `aria-label` de fila con el patrón `"Valor {etiqueta}, tu aporte {N}, total del equipo {N}"`.
- **Do** duplicar el estado guardado/sin-enviar en texto `sr-only` además del color de la regla izquierda — el color no llega a un lector de pantalla.
- **Do** autoalojar cualquier fuente nueva; nunca depender de un CDN (RNF-11).

### Don't:
- **Don't** usar verde para "sincronizado" — el ámbar sólido ya significa "a salvo" (The No-Green Rule).
- **Don't** poner más de un `role="alert"` a la vez en la pantalla de conteo — rompe `findByRole("alert")` en los tests.
- **Don't** añadir un botón de cerrar/descartar en la pantalla de conteo, ni llamar "Cerrar sesión" a un botón ahí — usar "Salir"; el nombre accesible no puede matchear `/cerrar|descartar/i`.
- **Don't** volver a nombrar un token de tamaño `--text-placa` — colisiona con la utilidad generada por `--color-placa` y el numeral pierde su tamaño en silencio. Usar `--text-numeral`.
- **Don't** ponerle borde izquierdo al bloque `Placa` — competiría visualmente con la regla de tinta que ES el canto izquierdo.
- **Don't** usar `box-shadow` bajo el borde duro — produce la "card fantasma" que el mundo rechaza.
- **Don't** subir la suscripción de `useMiAporte` desde `FilaCategoria` a su padre al vestir la fila — es una decisión de rendimiento deliberada que aísla el re-render a la fila que cambió.
