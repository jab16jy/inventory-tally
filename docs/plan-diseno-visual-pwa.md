# Plan de diseño e implementación — PWA móvil del cajero

> Estado: **ejecutado (F0–F4)**.
> Alcance: sistema de diseño + flujo móvil del cajero. El panel de administrador queda fuera.
> Complementa la serie [`docs/diseno/`](diseno/README.md); no la reemplaza.

## Contexto

La app no tiene **ninguna** capa visual. Verificado, no supuesto: cero `className`, cero `style`, ningún archivo `.css` en todo el repo, ningún `.css` en el bundle compilado (`dist/assets/` emite un solo `.js`), y cero dependencias de estilo en `apps/web/package.json`. Las cinco pantallas existentes son HTML semántico crudo.

Al mismo tiempo, `docs/diseno/11-ux-y-navegacion.md` es una especificación de UX completa que el código sólo cumple a medias: faltan la barra superior, el chip de sincronización, la barra de progreso, la búsqueda, el filtro "sólo pendientes", el deck de totales, el teclado numérico en bottom sheet y tres rutas enteras (`/sucursales`, `/preparar`, `/finalizar`).

Este plan cubre el **sistema de diseño + el flujo móvil del cajero**. El panel de administrador (escritorio, 8 rutas, Recharts) queda fuera: depende de callables que aún no existen (`cerrarSesion`, `crearCajero`).

Decisiones ya confirmadas: dirección **Placa de bodega**, alcance **flujo cajero + sistema**, virtualización **nativa primero, medir después**.

---

## 1. Contrato de dirección

Va como comentario HTML al inicio de `apps/web/src/estilos/tema.css` y en el `<head>` de `index.html`, para que sobreviva al build.

> **THESIS** — Cada categoría de valor es un rótulo físico de estantería, no una tarjeta. Rechaza el arreglo por defecto de la categoría: lista de cards redondeadas sobre near-black con etiquetas grises de 14 px y un FAB flotante.
>
> **OWN-WORLD** — Fondo #0F1115. Una sola señal ámbar de alta visibilidad. Numerales condensados tabulares a 32 px. Bloques de borde duro, radio 0–2 px. Regla de tinta izquierda en cada fila. Reconocible sin una sola palabra de contenido.
>
> **STORY** — El cajero entiende de un vistazo cuánto contó él, cuánto lleva el equipo, y —lo único que de verdad le angustia— si su conteo ya está a salvo.
>
> **FIRST VIEWPORT** — Cabecera-placa con sucursal y estado. Progreso `47/60`. La pila de rótulos ocupa dos tercios. El tercio inferior es un deck fijo: totales y `FINALIZAR CONTEO`, siempre bajo el pulgar.
>
> **FORM** — Rótulo de estantería industrial fusionado con la escala del numeral de billete. Primera de siete candidatas derivadas del mundo del cajero. Seed degradado (catálogo no alcanzable): asignación propia, sin retadores.

### La firma

**La regla izquierda de la fila pasa de hueca a sólida cuando el servidor confirma.**

Es una sola propiedad CSS por fila, escala a 200 filas sin costo, y comunica exactamente lo que RNF-12 y RF-16 protegen: que tu conteo no se perdió. Todo lo demás en la pantalla se mantiene disciplinado y callado. Es la única audacia del sistema.

### Por qué ámbar, y por qué no hay verde

El escenario físico manda: *un cajero de pie en una bodega con poca luz, teléfono en una mano a unos 40 cm, a veces con guantes, durante 2 a 4 horas*. Sobre negro, el ámbar de alta visibilidad es la mayor luminancia disponible — es la derivación funcional, no una preferencia. Es además el color nativo de la señalética industrial de la que sale el mundo.

Los docs piden 🟢 para "Sincronizado", pero **eliminamos el verde**. Si el ámbar sólido ya significa "a salvo", el verde es un tercer color haciendo un trabajo que ya está hecho. El sistema queda con **un solo tono** trabajando sobre un eje de relleno:

| Tratamiento | Significado |
|---|---|
| Ámbar **sólido** | Confirmado · a salvo · acción primaria |
| Ámbar **hueco** (contorno, mismo tono) | Pendiente · en tránsito |
| **Rojo** | Riesgo real de pérdida — sólo estados, nunca decoración |

---

## 2. Tokens

Archivo nuevo: `apps/web/src/estilos/tema.css`.

```css
@import "tailwindcss";

@theme {
  /* Superficies — #0F1115 viene fijado por el manifest y por
     <meta name="theme-color"> en index.html. No cambiarlo. */
  --color-fondo:      #0F1115;
  --color-placa:      #16191F;
  --color-placa-alta: #1E222A;
  --color-borde:      #2A2F38;

  /* Señal única */
  --color-senal:      oklch(0.82 0.17 78);   /* ámbar alta visibilidad */
  --color-senal-hueco: oklch(0.82 0.17 78 / 0.28);

  /* Tinta — hueso, no blanco puro: menos glare sobre negro */
  --color-tinta:      #F2EFE9;
  --color-tenue:      #8A9099;

  /* Estado. Rojo es el único color además del ámbar. */
  --color-riesgo:     oklch(0.62 0.21 25);

  --font-placa: "Archivo Variable", system-ui, sans-serif;

  /* Escala fija en rem (modo Operate: nunca fluida), ratio ~1.2,
     más UN outlier deliberado: el numeral de denominación. */
  --text-micro: 0.75rem;
  --text-base:  0.9375rem;
  --text-medio: 1.125rem;
  --text-placa: 2rem;      /* el outlier: ESTE es el mundo */

  --radius-placa: 2px;     /* borde duro, casi cero */
  --size-toque:  3.5rem;   /* 56px — el mínimo del doc 11 es 48 */
}
```

`@theme` compila cada token a una custom property real, así que `var(--color-senal)` funciona en CSS suelto **y** genera utilidades (`bg-senal`, `text-tinta`). Esto resuelve gratis el `var(--color-primary)` que `docs/diseno/10:180` ya asume para Recharts cuando llegue el admin.

**Tipografía.** Una sola familia variable: **Archivo Variable** (ejes `wght` + `wdth`) — condensada para los numerales, normal para la UI, un solo `.woff2`.

- Autoalojada en `apps/web/public/fuentes/`, **nunca desde el CDN de Google**: RNF-11 exige que la app funcione tras 30 días sin abrirse, y una fuente remota falla sin red.
- Subset latin, `font-display: swap`, `<link rel="preload">`.
- `font-variant-numeric: tabular-nums` obligatorio en toda cantidad: sin esto las columnas bailan al incrementar.
- **Tarea de verificación:** confirmar que el `.woff2` descargado trae de verdad el eje `wdth`. Si no, plan B son dos subsets (Archivo + Archivo Narrow), ~15 KB extra.

---

## 3. Análisis de bibliotecas

### Se añaden

| Paquete | Peso | Por qué |
|---|---|---|
| `tailwindcss` + `@tailwindcss/vite` | build-time | **Verificado contra los docs actuales:** v4 sólo necesita estos dos, `@import "tailwindcss"` y una línea en `vite.config.ts`. Sin PostCSS, sin autoprefixer, sin `tailwind.config.js`. Bonus real: como las utilidades son strings en `className`, los tests **no** necesitan `css: true` en Vitest — con CSS Modules sí habría hecho falta. |
| `clsx` | ~230 B | Estados condicionales de fila (pendiente/confirmado/tiene-aporte). |

Assets, no dependencias: el `.woff2` de Archivo y los tres iconos PWA.

### Se rechazan — y por qué

| Descartado | Razón |
|---|---|
| `@tanstack/react-virtual`, `react-window` | Decidido: `content-visibility: auto` + `contain-intrinsic-size` en cada fila (una línea de CSS) más el `React.memo` que `FilaCategoria` ya tiene. A 60 categorías reales sobra. Se añade **sólo** si el perfil con 200 filas incumple los 20 ms/frame del doc 02. |
| Radix UI, Headless UI | `<dialog>` nativo cubre el bottom sheet y el modal de sesión cerrada. Soportado en iOS Safari desde 15.4 y el dispositivo objetivo es un iPhone real. Una dependencia de primitivos para dos overlays no se paga. |
| `lucide-react`, `heroicons` | Son ~12 iconos. Un `Icono.tsx` con paths inline cuesta 0 dependencias y —más importante— los dibuja en la gramática del mundo (trazo duro, sin redondeo), que es justo lo que un pack genérico no da. También reemplaza los emoji de los mocks, que en iOS renderizan los de Apple y romperían la coherencia visual. |
| Redux · Zustand · Jotai | `docs/diseno/07:202-210` los rechaza explícitamente: el estado real vive en Firestore. Se respeta. |
| `framer-motion` | El modo Operate pide 150–250 ms y "movimiento que comunica estado, nunca decoración". Transiciones CSS lo cubren. Una librería de motion contra un presupuesto de 500 KB no se justifica. |
| `tailwind-merge`, `class-variance-authority` | Sólo valen con una API de variantes por props. Con 7 primitivos, `clsx` basta. Ruta de escalamiento anotada por si el admin crece. |
| `postcss`, `autoprefixer` | Tailwind v4 no los necesita. |

`recharts` sigue comprometido por los docs pero es **exclusivo del admin** — fuera de alcance aquí. Cuando llegue, con `React.lazy` para no inflar la ruta crítica del cajero (`docs/diseno/10:184-187`).

---

## 4. Arquitectura de componentes

El repo ya hace container-presentational de facto: hooks en `state/`, componentes tontos en `ui/`. Se formaliza añadiendo **una sola carpeta nueva**:

```
apps/web/src/
  estilos/
    tema.css        @import tailwindcss + @theme + contrato de dirección
    fuentes.css     @font-face de Archivo
  ui/
    primitivos/     ← NUEVO. Sin acceso a repositorio ni a estado. Sólo props.
      Placa.tsx        bloque-rótulo base, con la regla de tinta izquierda
      Numeral.tsx      numeral condensado tabular
      BotonPaso.tsx    − / + a 56×56
      ChipEstado.tsx   estado de sincronización
      Deck.tsx         el deck fijo inferior
      Hoja.tsx         bottom sheet sobre <dialog> nativo
      Icono.tsx        ~12 paths inline
    (los .tsx existentes se quedan donde están)
```

**No se reorganizan** `ConteoScreen.tsx`, `FilaCategoria.tsx`, `LoginScreen.tsx` ni los dos banners a subcarpetas `pantallas/` y `patrones/`. Sería churn puro: toca `router.tsx` y 4 archivos de test sin ganar nada funcional. Se puede hacer después si el admin lo justifica.

**Regla que se hace cumplir con lint:** `ui/primitivos/**` no puede importar de `state/`, de `@conteo/data` ni de `firebase`. El repo ya tiene precedente exacto de esto — la regla `no-restricted-imports` en `eslint.config.js` que bloquea React y Firebase dentro de `packages/shared`. Se extiende ese mismo bloque.

**Intocable:** `FilaCategoria` se suscribe a su propio `useMiAporte` internamente y está envuelto en `memo`. Eso es una decisión de rendimiento deliberada (`docs/diseno/07:334-347`) que aísla el re-render a la fila que cambió. **Vestirla nunca debe subir esa suscripción al padre.**

---

## 5. Pantallas

### `/conteo/:sesionId` — la pantalla crítica

```
┌──────────────────────────────┐
│ CHAPINERO       ● SINCRONIZADO│  ← sucursal con color distintivo (doc 11:334)
│ 47/60  ▓▓▓▓▓▓▓▓▓▓░░░░  [Pend]│  ← progreso + filtro "sólo pendientes"
│ ⌕ Buscar valor…              │
├──────────────────────────────┤
│▌  5.000         [ − ] 12 [ + ]│  ▌ sólido = confirmado
│▌  Tú: 12 · Equipo: 45         │
│▏ 10.000         [ − ] 03 [ + ]│  ▏ hueco = pendiente
│▏  Tú: 3 · Equipo: 3           │
╞══════════════════════════════╡
│  TU APORTE 412 u  EQUIPO 1.840│  ← deck fijo, tercio inferior
│  [     FINALIZAR CONTEO     ] │
└──────────────────────────────┘
```

Nuevo: cabecera, `ChipEstado`, `BarraProgreso`, filtro pendientes, búsqueda, `Deck`, y el bottom sheet con teclado numérico al tocar la fila (los `−`/`+` son el camino alternativo, no el principal — `doc 11:158-166`).

El sheet sube **dentro** del deck, no cubriendo la pantalla: la fila que editas sigue visible arriba.

El filtro "sólo pendientes" es, según `docs/diseno/10:58-60`, "la función más útil del dashboard del cajero" — al final de la jornada convierte 60 categorías en las 13 que faltan.

### Las otras cuatro

| Ruta | Estado | Qué lleva |
|---|---|---|
| `/login` | existe, sin estilo | Vestir. Añadir error inline y estado de carga, que hoy no existen. |
| `/sucursales` | **stub** (`"Sucursales — próximamente"`) | Lista de placas de sucursal; máx. 10 por cajero. Marca de conectividad (wifi/datos) desde `sucursal.conectividad`. |
| `/conteo/:id/preparar` | **no existe** | Aviso de precarga con WiFi si la sucursal usa datos móviles. "✅ Catálogo cargado (60 categorías)". Los 4 pasos de "Cómo funciona" — el uso es mensual, nadie recuerda cómo va. `[Empezar a contar]`. |
| `/conteo/:id/finalizar` | **no existe** | Resumen, envío de pendientes, `[Confirmar y salir]` **deshabilitado hasta cero pendientes** (RF-16). |

### Estados que hay que construir

Los ocho, todos especificados en los docs y hoy inexistentes salvo dos:

1. Sincronizado · 2. **Pendientes** (banner rojo fijo no descartable — *existe*) · 3. Sin conexión, tono nunca alarmante · 4. Sesión cerrada por el admin (modal bloqueante) · 5. Persistencia degradada (*existe*) · 6. Versión nueva disponible (bloqueo al arrancar) · 7. PWA no instalada (aviso persistente con instrucciones ilustradas — difieren entre Android y iOS) · 8. Confirmación suave si una cantidad supera 10× el promedio de la categoría.

Carga: **skeleton con la forma final, nunca un spinner** (`docs/diseno/10:222-228`).
Eso es sobre carga de pantalla; el botón en vuelo de una acción que llama a una Cloud
Function lleva el primitivo `Spinner` antepuesto al texto (`docs/DESIGN.md`, “Botón primario”).

---

## 6. Restricciones que no se pueden romper

Los tests existentes son la red de regresión de todo este trabajo. Estas consultas fijan el markup:

| Restricción | Dónde |
|---|---|
| `Tú: N` y `Equipo: N` deben seguir siendo **un solo nodo de texto cada uno** | `ConteoScreen.test.tsx` — `findByText(/tú: 1/i)`. Separarlos en `<span>` etiqueta + `<span>` valor **rompe el test**. Es la restricción más fuerte del rediseño de la fila. |
| Nombres accesibles `Sumar {etiqueta}` / `Restar {etiqueta}` | `getByRole("button", { name: /sumar \$5\.000/i })` |
| **Un solo `role="alert"` a la vez** en la pantalla de conteo | `findByRole("alert")` falla con más de uno. Cualquier toast nuevo lo rompe. |
| **Ningún botón cuyo nombre accesible haga match con `/cerrar\|descartar/i`** | Ojo: un botón "Cerrar sesión" en la cabecera nueva **rompe el test**. Usar "Salir". |
| Labels "Correo" / "Contraseña" asociados, botón "Entrar" | `LoginScreen.test.tsx`. Un rediseño con floating label o sólo placeholder rompe esto salvo que quede un `<label>` real. |
| `aria-label` de fila: `"Valor 5.000, tu aporte 12, total del equipo 45"` | Ya implementado y exigido por `doc 11:315`. |

Además, de los docs: contraste mínimo AA 4.5:1 · objetivos táctiles ≥ 48 px · probado a 200 % de escala de texto (todo en `rem`) · `Intl.NumberFormat('es-CO', …)` para moneda cuando aparezca.

Presupuestos: **< 20 ms/frame** con 200 categorías · **bundle < 500 KB** comprimido · arranque < 5 s en 4G, < 3 s con service worker caliente · **< 1,5 MB de datos por sesión**.

---

## 7. Ejecución

**F0 · Cimientos.** `npm i tailwindcss @tailwindcss/vite clsx`; plugin en `vite.config.ts`; `tema.css` + `fuentes.css` con el contrato de dirección; Archivo autoalojada; extender `no-restricted-imports`. **Generar los tres iconos PWA** (`icon-192`, `icon-512`, `icon-maskable-512`): el manifest ya los referencia y `apps/web/public/` está vacío — el mundo ahora define qué son (numeral ámbar sobre placa). Import de `tema.css` en `main.tsx`.

**F1 · Primitivos y vestir lo que existe.** Los 7 primitivos. Vestir `LoginScreen`, `ConteoScreen`, `FilaCategoria` y los dos banners. `content-visibility: auto` en la fila. **Los tests deben seguir verdes sin tocarlos** — si hay que editar un test, el markup se desvió.

**F2 · Completar la pantalla crítica.** Cabecera, `ChipEstado`, `BarraProgreso`, búsqueda, filtro pendientes, `Deck`, `Hoja` con teclado numérico y avance automático a la siguiente pendiente.

**F3 · Las tres rutas nuevas.** `/sucursales`, `/preparar`, `/finalizar` + rutas en `router.tsx`.

**F4 · Estados y acabado.** Los estados degradados que faltan, skeletons, paso de accesibilidad, detector de impeccable.

> El detector de impeccable **no se construyó**: no hay código, test ni referencia en CI para él. Queda pendiente/fuera de alcance, no ejecutado.

---

## 8. Verificación

- `npm test` — los 5 archivos de test existentes verdes **sin modificarlos**. Es el criterio de aceptación de F1.
- `npm run typecheck` y `npm run lint` (el CI ya los corre por rutas).
- `npm run dev -- --host` y abrir en un **iPhone real**, que es el dispositivo objetivo declarado (`doc 06:235`). Con `npm run emu` + `npm run seed` para datos.
- **Perfil con 200 filas sembradas**: React DevTools Profiler, confirmar < 20 ms/frame. Este número decide si entra `@tanstack/react-virtual` o no.
- Zoom de texto al 200 % en Safari iOS: nada se corta ni se solapa.
- VoiceOver en iOS y lector de pantalla en Chrome/Android (`doc 11:320-323`).
- Contraste AA sobre `#0F1115` para ámbar, hueso y tenue — verificar los tres, no asumir.
- Detector de impeccable sobre `apps/web/src`, una sola vez, al terminar.
- Build: confirmar que el bundle sigue < 500 KB comprimido con la fuente incluida.
