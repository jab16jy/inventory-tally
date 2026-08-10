# Plan de implementación — Panel de administrador

> Estado: **ejecutado (F1–F5)**.
> Alcance: las 9 pantallas de `/admin` en escritorio, más las 5 callables que faltan para operarlas.
> Continúa [`plan-diseno-visual-pwa.md`](plan-diseno-visual-pwa.md), que dejó el admin explícitamente fuera.

## Contexto

El plan visual de la PWA excluyó el panel de administrador con una razón concreta (`plan-diseno-visual-pwa.md:13`): dependía de callables que no existían. **Esa razón ya no aplica.** `crearCajero`, `actualizarCajero`, `desactivarCajero`, `abrirSesion`, `cerrarSesion` y los tres jobs programados están implementados y con tests verdes.

Lo que queda es el hueco inverso: hay un backend admin casi completo y **cero interfaz**. Hoy `/admin/*` cae en la ruta comodín y muestra "Próximamente" (`apps/web/src/lib/router.tsx:86`). Un administrador no puede abrir un conteo, no puede cerrarlo, y no puede ver un solo peso del inventario sin entrar a la consola de Firebase.

Este plan cubre las 9 pantallas, las 5 callables que faltan, y nada más.

---

## 1. Decisiones confirmadas

| Decisión | Elegido | Consecuencia |
|---|---|---|
| Alcance | **9 rutas completas**, con CRUD de sucursales y categorías | 5 callables nuevas |
| Gráficas | **CSS puro**, sin Recharts | 0 KB de dependencia; barras con `div` y `width:%`, dona con un `<svg>` y `stroke-dasharray` |
| Responsive | **Sólo escritorio > 1024 px** | Sidebar fijo. Sin nav inferior ni tablas-tarjeta |
| Dirección visual | **"Placa de bodega · escritorio"** | Mismos tokens de color, cero nuevos. Numeral de 32 px sólo en los 3 KPI; tablas en `text-base`; regla de tinta reservada al bloque de sincronización |
| Capa de datos | **`AdminRepository` aparte** | No se toca `ConteoRepository` ni `FakeConteoRepository` |
| Dinero | **Calculado en cliente** desde `lineas` | `totalMonetarioSesion()` de `packages/shared` estrena consumidor; el problema de `dirty:true` desaparece |
| Huecos backend | **`reactivarCajero`** | Se descartan reset de contraseña y `ejecutadoPor` en `SESION_CERRADA` (anotados como deuda) |
| Entrega | **5 fases, 5 PRs encadenados** | Cada PR < 400 líneas y deja la app funcionando |

### Por qué CSS y no Recharts

Los docs comprometen Recharts (`docs/diseno/10:175-182`) pero sólo escriben **un** snippet, de barras, y nunca detallan la tarta ni las líneas. Recharts pesa ~100 KB gzip contra un presupuesto total de 400–500 KB, y sus defaults (`radius={[4,4,0,0]}`, curvas suaves) hay que pelearlos uno a uno para que no rompan una dirección visual cuyo `--radius-placa` es **2 px**. Una barra es un `div` con `width` en porcentaje. Se añade Recharts con `React.lazy` el día que una gráfica concreta no salga en CSS — no antes.

> Nota: el snippet de los docs usa `var(--color-primary)`, un token que **no existe** en `tema.css`. El correcto es `var(--color-senal)`.

---

## 2. Tres correcciones a los docs, verificadas en código

Estas tres cambian el plan y están comprobadas, no supuestas.

**1. `firestore.rules` no necesita ni un cambio.** El panel es todo lecturas directas y `tieneSucursal()` corta en `esAdmin()` (`infra/firestore.rules:16`), así que el admin pasa en `sucursales`, `sesiones` y `lineas`. `categoriasValor` es `read: if autenticado()` (`:46`), `usuarios` es `list: if esAdmin()` (`:28`), y `historicos`, `resumen` y `auditoria` ya son `esAdmin()`. Las escrituras siguen en `if false`: las 5 callables nuevas usan el Admin SDK, que no pasa por reglas.

**2. `TipoEventoAuditoria` no tiene eventos de sucursal.** Son 12 miembros (`packages/functions/src/lib/auditoria.ts:7-19`) e incluyen `CATEGORIA_CREADA` y `CATEGORIA_DESACTIVADA` **sin ningún emisor** — el diseño ya anticipaba estas callables. Faltan `SUCURSAL_CREADA` y `SUCURSAL_ACTUALIZADA`: el enum crece a **14**, y la pantalla de auditoría debe derivar su lista de filtros del tipo exportado, nunca de un array literal.

**3. Un solo índice nuevo.** `auditoria(tipo, ocurridoEn)`. Los otros tres filtros de auditoría, las dos consultas de sesiones y el fan-out de históricos ya están cubiertos por los 5 índices existentes o por el autoindexado de campo único.

---

## 3. Las 5 callables nuevas

Las cinco copian el cuerpo de 3 líneas que ya comparten las existentes — `exigirAdmin(req)` → `validar(req.data, schema)` → `*Impl(...)` — con `{ region: "us-central1" }`. Heredan `unauthenticated`, `permission-denied` e `invalid-argument` sin escribirlos.

| Callable | Entrada | Salida | Errores propios | Auditoría |
|---|---|---|---|---|
| `crearSucursal` | `{nombre, direccion, conectividad: "wifi"\|"datos"}` | `{sucursalId, creada:true}` | — | `SUCURSAL_CREADA` |
| `actualizarSucursal` | `{sucursalId, nombre, direccion, conectividad, activa}` | `{sucursalId, actualizada:true}` | `not-found`; `failed-precondition` si se desactiva con sesión abierta | `SUCURSAL_ACTUALIZADA` |
| `crearCategoria` | `{etiqueta, valor:int≥0, orden:int≥0}` | `{categoriaId, creada:true}` | — | `CATEGORIA_CREADA` |
| `desactivarCategoria` | `{categoriaId}` | `{categoriaId, desactivada:true}` | `not-found` | `CATEGORIA_DESACTIVADA` |
| `reactivarCajero` | `{uid}` | `{uid, reactivado:true}` | `not-found` | `USUARIO_ACTUALIZADO` |

**`actualizarSucursal` es reemplazo total**, igual que `actualizarCajero`. `sesionAbiertaId` está deliberadamente ausente del esquema: ese campo pertenece a `abrirSesion`/`cerrarSesion` (invariante I-1).

**`reactivarCajero` no necesita esquema nuevo.** `desactivarCajeroSchema` ya es `{uid}`. Se reexporta con alias en `contracts/schemas/index.ts`, con un `// ponytail: mismo shape; separar cuando diverjan`.

### El orden de escritura de `reactivarCajero` no es simétrico por accidente

`desactivarCajero` escribe Auth primero y Firestore último a propósito (`desactivar-cajero.ts:10-14`): un corte entre ambos deja al cajero deshabilitado pero **aún contado** por RF-16.

La inversa **debe escribir Firestore primero**:

1. `db.runTransaction` → `usuarios/{uid}.activo = true` + auditoría.
2. `auth.updateUser(uid, { disabled: false })`.

Si se hiciera al revés y el proceso muere en medio, queda un cajero con `disabled:false` y `activo:false`: **puede iniciar sesión y contar**, pero `verificarSincronizacion:72-76` lo clasifica en `excluidosPorInactivo`, la puerta de cierre lo ignora, y sus conteos sin sincronizar se pierden en silencio. Con el orden correcto el peor caso es un cajero que no puede entrar pero sí bloquea un cierre — molesto, reversible, sin pérdida.

Sin `revokeRefreshTokens` (ya estaban revocados) y sin reescribir claims (`desactivarCajero` nunca los limpió).

### Invariante I-7 en las categorías

`abrirSesion` copia y congela `valorUnitario` en cada línea. Ninguna de las dos callables de categorías puede tocar `sesiones/*/lineas`: crear una categoría a media sesión simplemente no la añade a esa sesión, y desactivarla no borra ni edita nada de lo ya abierto. **Esto se prueba, no se comenta.**

---

## 4. `AdminRepository`

Archivo nuevo `packages/data/src/repositories/admin-repository.ts`, espejo de `ConteoRepository` — mismo patrón, segundo archivo. Con su `FakeAdminRepository` y su `FirestoreAdminRepository`.

```ts
export interface AdminRepository {
  // ── lecturas en vivo ──
  observarSesionesAbiertas(cb): Unsubscribe;      // sesiones where estado=='abierta'
  observarSesion(sesionId, cb): Unsubscribe;
  observarLineasSesion(sesionId, cb): Unsubscribe; // el dinero se calcula aquí, no en resumen/actual
  observarSincronizacion(sesionId, cb): Unsubscribe; // frescura < 3 s
  observarUsuarios(cb): Unsubscribe;
  observarSucursales(cb): Unsubscribe;             // TODAS: el admin las ve todas
  observarCategorias(cb): Unsubscribe;             // orderBy orden

  // ── paginadas ──
  listarSesiones(filtro, cursor?): Promise<Pagina<SesionConteo>>;
  listarAuditoria(filtro, cursor?): Promise<Pagina<EventoAuditoria>>;

  // ── fan-out N+1 del comparativo ──
  ultimoHistoricoPorSucursal(ids): Promise<Map<string, Historico | null>>;

  // ── escrituras: TODAS vía httpsCallable, ninguna directa ──
  abrirSesion / cerrarSesion / crearCajero / actualizarCajero /
  desactivarCajero / reactivarCajero / crearSucursal /
  actualizarSucursal / crearCategoria / desactivarCategoria
}
```

**El fan-out es deliberado, no un descuido.** No hay ninguna regla `match /{path=**}/historicos/{id}` ni un solo índice `COLLECTION_GROUP`, así que `collectionGroup("historicos")` cae en la denegación por defecto. Una consulta por sucursal (`orderBy cerradaEn desc limit 1`) es la única forma que existe. Con 5 sucursales son 6 lecturas, constantes en el tiempo. Va comentado en el código para que nadie lo "optimice" a un `collectionGroup` que fallaría sólo en producción.

`siguienteCursor` es **opaco**: el llamador sólo lo devuelve. La implementación de Firestore guarda un `QueryDocumentSnapshot`, el fake guarda un índice. Así `QueryDocumentSnapshot` no se filtra a `apps/web` y no hay que inventar un esquema de codificación de cursores.

**`apps/web` no gana `@conteo/contracts` como dependencia.** Obligaría a un alias nuevo en `vite.config.ts` (Vite ignora los `paths` de tsconfig) y metería zod en el bundle del cliente para revalidar lo que la callable ya valida. Los 5 tipos de payload se declaran en `admin-repository.ts`; los tests de esquema en `contracts/` y los de callables en `packages/functions` son la guardia real del contrato.

---

## 5. Las 5 fases

Cada fase es un PR. Cada commit dentro sigue el protocolo de la §7.

### F1 · Armazón y tablero — *sin backend nuevo*

Lo que fija el patrón que copian las cuatro fases siguientes.

| Commit | Test primero | Después |
|---|---|---|
| `feat(data): interfaz AdminRepository y su doble en memoria` | `fake-admin-repository.test.ts` — *"emite las sesiones abiertas sembradas"*, *"devuelve unsubscribe que corta las notificaciones"* | interfaz + fake |
| `feat(web): formateo de moneda es-CO y reúso en Deck` | `formato.test.ts` — *"formatea 1234500 como $ 1.234.500 sin decimales"* | `lib/formato.ts`, y **se mueve** el `Intl.NumberFormat` de `Deck.tsx:14` (es el único del repo) |
| `feat(web): armazón del panel de administración y ruta /admin` | `AdminLayout.test.tsx` — *"marca como actual el enlace de la ruta activa"* | layout con sidebar fijo, `Icono` +5 paths, ruta anidada en `router.tsx` |
| `feat(web): tablero de sesiones abiertas por sucursal` | `PanelScreen.test.tsx` — *"muestra un esqueleto con la forma final mientras carga"*, *"muestra el valor total en pesos calculado desde las líneas"* | `PanelScreen.tsx` |
| `feat(data): lectura Firestore del panel admin` | `firestore-admin-repository.test.ts`, con `vi.mock("firebase/firestore")` — el patrón que ya usa `firestore-conteo-repository.test.ts` (320 líneas, 15 tests) | `firestore-admin-repository.ts` + `lib/funciones.ts` (`getFunctions` + `connectFunctionsEmulator`; **hoy no existe ninguno en el repo**) |

**Cierra cuando:** `/admin` muestra sesiones reales con dinero; un cajero sigue siendo redirigido a `/sucursales` con `guardas.test.ts` intacto.

### F2 · Cajeros y sucursales — *3 callables*

`reactivarCajero`, `crearSucursal`, `actualizarSucursal`, más R1 y R2.

Tests de callable primero, siempre: *"habilita al cajero en Auth y marca activo:true"*, *"es idempotente sobre un cajero ya activo"*, *"rechaza desactivar una sucursal con sesión abierta"*, *"emite SUCURSAL_CREADA en la misma transacción"*.

Después las pantallas: *"muestra pwaInstalada y ultimoAccesoEn por cajero"*, *"ofrece reactivar sólo a los inactivos"*, *"muestra el mensaje del servidor cuando el correo ya existe"*, *"deshabilita desactivar si hay sesión abierta"*.

Aquí nace `ui/admin/Tabla.tsx`, el shell de tabla que reusan F3, F4 y F5.

> Esta fase es la candidata más probable a pasar de 400 líneas. Corte natural si ocurre: `contracts + functions` / `web`.

### F3 · Categorías, histórico y auditoría — *2 callables, 1 índice*

`crearCategoria`, `desactivarCategoria`, más R3, R4 y R6.

Las dos aserciones que importan de verdad, ambas sobre I-7:
- *"no agrega líneas a una sesión ya abierta"*
- *"no altera valorUnitario ni borra la línea de una sesión abierta"*

Los filtros de auditoría van **de uno en uno** (`tipo` | `sucursalId` | `usuarioId` | `sesionId`), porque cada combinación exigiría su propio índice compuesto. Se marca con `// ponytail: un filtro a la vez; añadir índices si el negocio pide combinarlos.` Los docs dicen "combinables" pero nunca enumeran cuáles.

### F4 · Cierre y comparativo

R5 —la única pantalla del admin con wireframe (`docs/diseno/11:277-291`)— y R8.

Primero la matemática pura en `packages/shared/src/services/calculadora-analisis.ts`: *"los porcentajes repartidos suman exactamente 100.0"*, *"asigna el sobrante al mayor resto"*, *"participación devuelve 0 cuando el total es 0"*.

Después un refactor pequeño con buen rédito: extraer el predicado RF-16 a `packages/shared` y hacer que `functions/src/lib/sincronizacion.ts` lo llame en vez de tenerlo inline. Un predicado, dos consumidores; `test/lib/sincronizacion.test.ts` es la red de regresión y no se toca.

Luego la pantalla de cierre: *"deshabilita 'Cerrar conteo' si hay alguien sin confirmar"*, *"oculta el forzado tras una divulgación"*, *"advierte que se perderán los conteos sin sincronizar antes de forzar"*, *"muestra los nombres devueltos en details.sinConfirmar cuando el servidor rechaza el cierre"*, *"reserva la regla de tinta al bloque de sincronización"*.

Y el comparativo: *"consulta el último histórico de cada sucursal por separado"* — esa aserción es lo que garantiza que nadie sustituya el fan-out por un `collectionGroup` que sólo fallaría en producción.

### F5 · Análisis de sesión

R7, en el orden exacto que fija `docs/diseno/10:120-142`: cabecera → 3 KPI → **bloque de sincronización** → barras → dona → extremos → tabla ordenable → comparativo.

El bloque de sincronización va arriba de las gráficas a propósito, y eso se prueba: *"presenta las secciones en el orden: cabecera, KPIs, sincronización, barras, dona, extremos, detalle, comparativo"* sobre el orden del DOM.

Y las dos que fijan la dirección visual: *"usa el numeral de 32px sólo en las tres tarjetas KPI"*, *"la tabla de detalle usa text-base"*.

---

## 6. Riesgos, por orden de gravedad

1. **Fuga de `categoriasValor` en F3.** Es una colección global y `abrirSesionImpl` siembra una línea por cada doc con `activa == true` de **toda** la colección. Con `fileParallelism:false` pero aislamiento por sufijo `randomUUID` (no `clearFirestore`), una categoría activa olvidada cambia en silencio lo que observan `abrir-sesion.test.ts` y `cerrar-sesion.test.ts` — **y sólo en la siguiente corrida**. Mitigación: borrado en `afterEach` en ambos tests de categoría y **dos corridas seguidas** de la suite de functions antes de fusionar.
2. **Orden de escritura de `reactivarCajero`.** Detallado en §3. Firestore primero.
3. **El enum de auditoría pasa de 12 a 14.** Si la pantalla de auditoría lista tipos literales, los dos eventos de sucursal quedan invisibles. Derivar del tipo exportado.
4. **`router.tsx` no es un riesgo.** `AppRouter` sólo lo importa `main.tsx`, cada test web monta su propio `<MemoryRouter><Routes>`, y `guardas.test.ts` prueba la función pura. Añadir la ruta anidada no puede poner en rojo ninguno de los archivos verdes.
5. **El formateador de moneda va en `apps/web/src/lib/formato.ts`, no en `packages/shared`.** `shared` es dominio puro y sin locale; formatear es presentación. Y como `Deck.tsx:14` ya tiene el único `Intl.NumberFormat` del repo, se **mueve** en vez de duplicarse — `Deck.test.tsx` sale gratis como regresión.
6. **Una sucursal recién creada es invisible para todo cajero** hasta que alguien edite sus asignaciones (`actualizarCajero` reescribe el claim `sucursales`). No es un bug nuevo, pero el mensaje de éxito debe decirlo o se reportará como uno.
7. **Trampa de nombres de `tema.css:68-73`.** No se planean tokens nuevos, así que el riesgo es cero salvo que alguien añada un `--text-<nombre>` que colisione con un `--color-<nombre>`.

---

## 7. Protocolo por commit

Obligatorio en los cinco PRs, sin excepción:

1. **TDD.** El test se escribe y falla antes de que exista el código. Los nombres de test de la §5 no son ilustrativos: son el contrato.
2. **ponytail** en cada commit de implementación. Es la razón de que el filtro de auditoría sea uno a la vez, de que `reactivarCajero` reúse el esquema de `desactivarCajero`, y de que el formateador de `Deck` se mueva en lugar de duplicarse. Todo atajo deliberado lleva su comentario `// ponytail:` con el techo y la salida.
3. **RDD** por commit. Está activo (`gentle-ai review mode status` → `on`). El ciclo se ejecuta con la normalización **antes** del congelado del candidato.
4. **Conventional commits en español**, siguiendo el estilo del historial. **Nunca** `Co-Authored-By` ni atribución de IA.

### Skills por fase

| Skill | Cuándo |
|---|---|
| `ponytail` | Todos los commits de implementación, las 5 fases |
| `work-unit-commits` | Al abrir cada fase, para armar las unidades reales (test + fuente + doc juntos) |
| `impeccable` | **F1** (sidebar, grid, shell de tabla — fija el patrón), **F4** (la pantalla con wireframe: divulgación, copy de advertencia, semántica de deshabilitado), **F5** (jerarquía de KPI, legibilidad, esqueletos). Se salta en F2 y F3, que reúsan la tabla de F1 |
| `dataviz` | Antes de la primera línea de gráfica: F4 (barras) y F5 (dona). Restricción: paleta de `tema.css`, ≤ 8 series |
| `firebase-security-rules-auditor` | Una vez en F1, sólo lectura, para certificar que el delta cero de reglas es correcto |
| `systematic-debugging` | Ante cualquier test preexistente en rojo — sobre todo la fuga de F3, que se manifiesta como un fallo *aparentemente no relacionado* en `abrir-sesion` |
| `judgment-day` | Tras F4 y tras F5: cierre irreversible, y matemática de dinero y redondeo |
| `branch-pr` | Al abrir cada uno de los 5 PRs |
| `chained-pr` | Si una fase pasa de ~400 líneas (F2 es la candidata) |

---

## 8. Verificación final

Después de F5, y sólo entonces:

- `npm test` — los 25 archivos de test web y los 13 de functions verdes, **más los nuevos**. Ningún test preexistente modificado. (El "5" que citaba `plan-diseno-visual-pwa.md` quedó obsoleto: era cierto antes de que esa fase añadiera veinte.)
- `npm run test:rules` — aparte, no entra en `npm test`.
- Suite de `packages/functions` **dos veces seguidas**: es el detector de la fuga de categorías.
- `npm run typecheck` y `npm run lint`.
- `firebase deploy --only firestore:indexes` en seco: el índice nuevo válido.
- **Recorrido manual con emulador** (`npm run emu` + `npm run seed`): crear sucursal → crear categoría → abrir sesión → contar desde la PWA con dos cajeros → ver el análisis → intentar cerrar bloqueado → forzar → ver el histórico en el comparativo. Es el único camino que toca las 9 pantallas y las 10 callables.
- Ciclo completo de un cajero: crear → desactivar → **reactivar** → confirmar que vuelve a contar.
- A 1024 px y a 1920 px: nada se corta ni se solapa.
- Contraste AA sobre `#0F1115` en las gráficas nuevas — verificar, no asumir.
- `sdd-verify` contra los requisitos R0–R8 y las invariantes I-1, I-7 y RF-16.
- Bundle: confirmar que sigue por debajo de 500 KB comprimido. Sin Recharts debería moverse poco.

### Deuda anotada, deliberadamente fuera

Exportación CSV/PDF (los docs ya la declaran fuera de v1), reset de contraseña, `ejecutadoPor` en `SESION_CERRADA` y `CIERRE_BLOQUEADO`, reapertura de sesiones (`sesionCorregidaId` está modelado y nunca se escribe), filtros combinables de auditoría, y breakpoints de móvil y tablet.
