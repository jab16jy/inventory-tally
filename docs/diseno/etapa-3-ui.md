# Etapa 3 — UI de áreas como división de trabajo (#82, #84, #85)

> Especificación de diseño. No es código: fija decisiones, copy, roles y nombres
> accesibles exactos para que la implementación no tenga que inventar ninguno.
> Autoridad: [ADR-23](13-decisiones-adr.md#adr-23), [`docs/DESIGN.md`](../DESIGN.md)
> ("Placa de bodega"), [`docs/PRODUCT.md`](../PRODUCT.md), AGENTS.md §0–§2.
>
> **Supuesto declarado.** La fase de entrevista de `shape` se omitió: el encargo
> llegó con los tres tickets completos, el estado verificado y las restricciones
> duras ya fijadas. Cada decisión que rellena un hueco del ticket queda marcada
> abajo como **decisión propia** con su alternativa descartada.

---

## 1. Diagnóstico

Verificado leyendo el código, no inferido.

### 1.1 El filtro de área de la pantalla de conteo mide lo que no es

`ConteoScreen.tsx:209` construye las opciones del selector así:

```tsx
const areas = [...new Set(lineas.flatMap((l) => Object.keys(l.porArea ?? {})))].sort();
```

y `ConteoScreen.tsx:214` filtra con ellas:

```tsx
if (areaFiltro && !(linea.porArea && linea.porArea[areaFiltro])) return false;
```

`porArea` es **el desglose de lo ya contado** ([`linea-conteo.ts:15`](../../packages/shared/src/models/linea-conteo.ts)),
mantenido por `onAporteEscrito`. O sea que el selector responde a la pregunta
*"¿en qué áreas ya contó alguien esta categoría?"*, no *"¿qué categorías me tocan
a mí en mi área?"*.

Las consecuencias son las tres que hacen que la pantalla se sienta poco
inmersiva:

1. **Un área recién empezada no existe.** Hasta que alguien aporte, `porArea`
   está vacío y el área no aparece en el selector. El contador que llega
   primero a "Bodega" no puede filtrar por "Bodega".
2. **El filtro esconde exactamente lo que falta contar.** Filtrar por un área
   muestra sólo las líneas que YA tienen unidades ahí — lo contrario de lo que
   el contador necesita, que es su lista de pendientes.
3. **El área activa no filtra nada.** `areaActiva` decide con qué clave se
   escribe el aporte (`ConteoScreen.tsx:178,356`) y cómo se cuenta el progreso
   (`:195`), pero **no** decide qué filas se ven. La elección obligatoria de
   `PrepararScreen` no tiene ninguna consecuencia visible en la pantalla de
   conteo.

### 1.2 La línea no lleva la asignación del catálogo

Éste es el hallazgo que condiciona todo #84. La asignación N:M vive en
`CategoriaValor.areaIds` ([`categoria-valor.ts:25`](../../packages/shared/src/models/categoria-valor.ts)),
colección `categoriasValor`. `LineaConteo` **no la lleva**: sus únicos campos de
área son `porArea` y `aplicados`.

Y `ConteoRepository` ([`conteo-repository.ts`](../../packages/data/src/repositories/conteo-repository.ts))
no expone ningún observador de `categoriasValor`. La pantalla de conteo, hoy, no
tiene forma de saber qué categorías pertenecen al área activa. El filtrado que
pide #84(b) no es un cambio de expresión booleana: **le falta la fuente de
datos**. Se resuelve en la decisión D-1.

### 1.3 El área activa está elegida pero escondida

`PrepararScreen` obliga a elegir área y valida contra `areasActivas`
(`PrepararScreen.tsx:63,183`, ya corregido por JD-002). Pero al entrar a
`/conteo/:sesionId` el área desaparece de la vista: no está en la cabecera, no
está en el deck, no está en ningún sitio. El contador no puede confirmar en qué
zona cree el sistema que está parado — y si `localStorage` traía un valor de una
sesión anterior, tampoco puede detectarlo.

### 1.4 Áreas es un CRUD sin el dato que la define

`AreasScreen.tsx` (350 líneas) no menciona la palabra "categoría" ni una vez:
sus columnas son `Nombre`, `Activa`, `Acciones` (`:134-224`) y su formulario
tiene un único campo, `Nombre` (`:305-316`). La relación N:M se administra
**sólo** desde el lado de Categorías, con checkboxes por categoría
(`CategoriasScreen.tsx:455-472`).

Asignar 30 categorías a un área nueva son hoy 30 ediciones de categoría, una por
una, cada una abriendo y cerrando un formulario.

### 1.5 El cajero ya lee el precio, pero el código dice que no

Tres afirmaciones del código que ADR-23 declara falsas:

- `Deck.tsx:3-4` — *"totales de unidades, nunca dinero (I-9 — la separación de
  datos ni siquiera le da al cliente el `valorUnitario` agregado)"*.
- `ConteoScreen.tsx:2` — *"sin importes, sólo unidades (I-9)"*.
- `PRODUCT.md` §Users — *"No ve valores monetarios: sólo unidades"* y §Product
  Principles 3 — *"El cajero ve unidades, el administrador ve dinero"*.

Pero `LineaConteo.valorUnitario` viaja en cada línea y se usa hoy mismo para
buscar (`ConteoScreen.tsx:219`), y la etiqueta **es** el importe formateado
(`"$5.000"`). El texto de [ADR-07](13-decisiones-adr.md#adr-07) dice
literalmente: *"El cajero conoce valor y unidades: la separación no oculta lo
deducible, impide entregar el consolidado"*. Lo que ADR-07 protege es `resumen`
e `historicos`, no el valor unitario.

`HojaNuevoProducto.tsx` tiene dos campos, Nombre y Área (`:44,55,175`); el
servidor fuerza `valor: 0` (`crear-categoria-en-sesion.ts:60`).

---

## 2. Decisiones de diseño

### #84 — Área activa y vista de conteo filtrada

#### D-1. `LineaConteo` gana `areaIds`, denormalizado al sembrar

**Decisión.** La línea copia las `areaIds` de la categoría en el momento en que
se siembra, igual que ya copia `valorUnitario` y `etiqueta`.

**Por qué.** Es la única forma de que el filtro por área asignada funcione sin
añadir una segunda suscripción en la pantalla más crítica del sistema, y sale
casi gratis: `sembrarLineas` **ya lee los documentos completos** de
`categoriasValor` —

```ts
// abrir-sesion.ts:35
const categorias = await db.collection("categoriasValor").where("activa", "==", true).get();
```

— y ya extrae dos campos de cada uno (`:54-55`). `categoria.get("areaIds")` está
ahí, sin una lectura más. Además `lineaSembrada()`
([`lib/linea-sembrada.ts`](../../packages/functions/src/lib/linea-sembrada.ts))
es, por diseño de ADR-23, el único sitio que da forma al documento: el campo se
añade en un solo lugar.

**Alternativa descartada: suscribir `categoriasValor` desde `ConteoScreen`.**
Añade un listener nuevo a la pantalla con presupuesto más apretado del sistema
(RNF-05: 55 fps con 200 categorías; RNF-10: < 1,5 MB por sesión), duplica en el
cliente unos datos que la línea ya podría llevar, y crea dos fuentes de verdad
que pueden discrepar a mitad de conteo. `ConteoRepository` tendría que crecer un
método, con su Fake y su implementación Firestore. Mucho más código y peor
comportamiento offline.

**Compensación aceptada.** Si el admin reasigna áreas con la sesión abierta, la
sesión en curso no se entera. Es coherente con ADR-23 — el área es la división
del trabajo *de esa sesión*, y congelarla al abrir es el mismo criterio que I-7
aplica a `valorUnitario` — y el interruptor "ver todo" es la válvula de escape.
Se marca con un comentario `ponytail:` que nombre el techo y la ruta de salida
(recalcular en `reconciliarLineas`, que ya reescribe `porArea` entero).

**Alcance real.** #84 deja de ser "sólo UI": toca
`packages/shared/src/models/linea-conteo.ts`, `lib/linea-sembrada.ts`,
`abrir-sesion.ts`, `crear-categoria-en-sesion.ts` y el mapper de
`firestore-conteo-repository.ts`. Es un campo opcional en cada uno.

`readonly areaIds?: readonly string[]` — **opcional**, igual que en
`CategoriaValor`: ausente o vacío significa "sin área", y las líneas ya sembradas
por sesiones abiertas antes de este cambio se comportan como tales sin migración.

#### D-2. El filtro por defecto es "mi área + las que no tienen área"

**Decisión.** Sin interruptor, la lista muestra las líneas cuyo `areaIds`
contiene `areaActiva`, **más** las que no tienen `areaIds`.

**Por qué.** Las dos mitades vienen de decisiones ya cerradas: la primera es el
filtrado por área activa de ADR-23; la segunda es la regla *"«Sin área» avisa,
nunca bloquea"* (grilling Q, ADR-23). Una categoría sin asignar no es de nadie, y
esconderla la volvería invisible para todos los contadores a la vez — el peor
modo de fallo posible, porque nadie la contaría y nadie sabría que existe.

#### D-3. Interruptor "ver todo", no un selector

**Decisión.** El `<select>` de `ConteoScreen.tsx:288-304` se retira. Lo
reemplaza un botón de alternancia con `aria-pressed`, gemelo del filtro
"Pendientes" que ya vive dos líneas más arriba (`:256-267`).

**Por qué.** Con el área activa obligatoria ya no hay una dimensión libre que
elegir: sólo hay dos vistas, "lo mío" y "todo". Un `<select>` para un booleano es
un control de más, y `aria-pressed` ya es el patrón del repositorio para
exactamente esto (escalón 2 de la escalera: reutilizar lo que hay).

**Guarda de visibilidad.** El interruptor se pinta sólo cuando de verdad hay algo
que ocultar: `lineasDeMiArea.length < lineas.length`. Conserva el espíritu del
test que hoy protege `areas.length > 1` — no gastar una fila entera de la
pantalla más apretada en un control que no filtraría nada — pero con la
condición correcta.

#### D-4. Una fila por categoría, no una por par (categoría, área)

**Ésta es una desviación deliberada de la letra del ticket.** #84 pide "una fila
por par (categoría, área) leyendo `porArea`". Se implementa el *propósito* — que
el contador vea el desglose por área — sin multiplicar las filas.

**Por qué.** Tres razones verificadas en el código:

1. **Las filas extra registrarían un dato falso.** `FilaCategoria` lee y escribe
   con `useMiAporte(sesionId, categoriaId, areaId)` contra la clave
   `{uid}__{areaId}` (`FilaCategoria.tsx:46,58`). Ojo: `infra/firestore.rules:73-80`
   **no** impide escribir en otra área — sólo exige coherencia entre la clave y el
   payload (`claveAporte == miUid() + '__' + areaId`, con `areaId` string no
   vacío). La fila de otra área sería perfectamente escribible; el problema no es
   técnico sino de dominio: declarar unidades de una zona en la que no estás
   parado es exactamente el dato que ADR-23 quiere evitar. Un control que
   funciona pero miente es peor que uno que no funciona.
2. **Rompe el diseño de rendimiento.** Cada fila abre su propia suscripción,
   aislada por `memo` — una decisión explícita y protegida por escrito
   (`FilaCategoria.tsx:9-10`, y `DESIGN.md` §Don'ts: *"Don't subir la suscripción
   de `useMiAporte` desde `FilaCategoria` a su padre"*). N áreas multiplicarían
   las suscripciones por N contra el presupuesto de RNF-05.
3. **Multiplica el scroll.** La pantalla mide 10 filas por viewport con 60
   categorías (`DESIGN.md` §Layout). Con cuatro áreas serían 40 pantallazos.

**Qué se hace en su lugar.** Una tercera línea de texto en la fila, **sólo en
modo "ver todo" y sólo cuando hay unidades en áreas distintas de la activa**, que
resume el desglose: `Otras áreas: 12`. Es la información que el par
(categoría, área) traía, en un nodo de texto y sin controles muertos.

**Alternativa descartada: filas agrupadas por área con encabezado.** Duplica el
scroll igual y obliga a una lista anidada que rompe la virtualización nativa por
`content-visibility` (`FilaCategoria.tsx:71`).

#### D-5. El área activa vive en la cabecera, siempre

**Decisión.** Chip de texto permanente con el **nombre** del área (no el id),
resuelto contra `useAreasActivas`, que la pantalla ya consume
(`ConteoScreen.tsx:122`).

**Por qué.** Es el contexto que decide dónde se escribe cada aporte; esconderlo
en un dropdown fue justo lo que hizo que dos personas pudieran contar la misma
zona sin enterarse. Cero lecturas nuevas.

### #85 — Precio unitario y subtotal de la línea propia

#### D-6. El subtotal es lo nuevo; el precio unitario sólo cuando no es ya la etiqueta

**Decisión.** La fila muestra `Subtotal $X` (con `X = miCantidad ×
linea.valorUnitario`, vía `subtotal()` de
[`calculadora.ts:22`](../../packages/shared/src/services/calculadora.ts)). El
precio unitario se muestra **sólo** cuando la etiqueta no lo es ya, comparando
exacto: `moneda(linea.valorUnitario) !== linea.etiqueta`.

**Por qué.** Para una categoría de valor, la etiqueta **es** el precio
formateado — el numeral de 2 rem que domina la fila dice `$5.000`. Repetir
"Precio: $5.000" tres milímetros debajo es ruido puro en la pantalla más
apretada del sistema. Pero un "producto nombrado" (ticket #39, D1) tiene por
etiqueta un nombre propio y un `valorUnitario` real que hoy no se ve en ninguna
parte: ahí el precio unitario sí es información. Una comparación de igualdad
exacta contra el formateador que ya existe distingue los dos casos sin parsear
nada ni añadir un campo.

**Alternativa descartada: mostrar siempre precio y subtotal.** Tres cifras
monetarias por fila en una pantalla que se lee de pie, con guantes y poca luz,
compitiendo con el numeral que es "el mundo" del sistema (`DESIGN.md`
§Typography).

#### D-7. El Deck no cambia; su comentario sí

**Decisión.** `Deck.tsx` sigue mostrando sólo unidades. Se corrige la
justificación escrita: no muestra dinero porque el total de la sesión **es el
consolidado que ADR-07 sí protege**, no porque I-9 prohíba el `valorUnitario`.

**Por qué.** El ticket dice "decidir qué muestra" y "el total de sesión sigue
fuera". La decisión es: nada cambia en pantalla, cambia el motivo — que es
justamente lo que impide que el próximo lector vuelva a deducir la regla
equivocada. Diff de un comentario.

#### D-8. `PRODUCT.md` está desactualizado y se corrige en la misma unidad

**Decisión.** Se corrigen §Users (*"No ve valores monetarios: sólo unidades"*),
§Capabilities (*"El cajero nunca ve dinero"*) y §Product Principles 3 para
reflejar ADR-23: el cajero ve el precio y el subtotal **de su propia línea**;
nunca el consolidado de la sesión (`resumen`, `historicos`), que sigue siendo
admin-only en `firestore.rules` sin cambios.

**Por qué.** AGENTS.md §0: *"Si el código contradice un documento, el documento
gana. Si el documento está mal, se corrige el documento en el mismo commit — no
se deja la divergencia viva."* Aquí el documento está mal.

#### D-9. Precio opcional al crear producto

**Decisión.** `HojaNuevoProducto` gana un tercer campo, `Precio (opcional)`,
`inputmode="numeric"`. Vacío ⇒ no se envía ⇒ el servidor sigue escribiendo `0`.

**Por qué.** En este dominio el precio ES la etiqueta. Pedirle el nombre y no el
precio a quien tiene el producto en la mano es pedirle la mitad del dato. Que sea
opcional preserva exactamente el comportamiento actual para quien no lo sepa.

### #82 — Áreas como superficie de asignación

#### D-10. Sigue siendo una pestaña de `/admin/categorias`, con un motivo nuevo

**Decisión.** No se añade una octava entrada de navegación. Se corrige el
comentario de `AdminLayout.tsx:33-35`, que hoy justifica la fusión con *"no
merecía su propia entrada de nav por ser casi idéntica a Categorías"*.

**Por qué.** Ese motivo caduca con este ticket: tras #82 las dos pantallas dejan
de parecerse. Pero la conclusión sigue siendo correcta por una razón mejor —
**son los dos sentidos de una misma relación N:M**, y separarlas obligaría al
admin a saber de antemano desde qué lado quiere asignar. Juntas, cambiar de
sentido es un clic. El `role="tablist"` completo ya está construido
(`CatalogoScreen.tsx:36-60`).

**Alternativa descartada: ruta propia `/admin/areas`.** Octava entrada en una
barra que ya se comprime a sólo iconos en tablet y a barra inferior en móvil
(`AdminLayout.tsx`, `useDisenoAdaptativo`), a cambio de un clic.

#### D-11. La asignación en bloque son N llamadas, no una

**Decisión.** Guardar una asignación de N categorías emite N
`actualizarCategoria`, secuenciales, con el estado parcial visible.

**Por qué.** Es lo que el contrato existente permite hoy sin tocar backend:
`ActualizarCategoriaPayload` ([`admin-repository.ts:121-129`](../../packages/data/src/repositories/admin-repository.ts))
exige `etiqueta`, `valor` y `orden` — es reemplazo completo, no parche. Todos
esos campos ya están en el cliente vía `observarCategorias`. Cero cambios de
contrato, cero callables nuevas, cero reglas.

**Dos riesgos reales que la interfaz debe asumir, no esconder:**

1. **Fallo parcial.** Si la llamada 18 de 30 falla, 17 quedaron guardadas. El
   error debe decir cuántas se guardaron y cuáles faltaron, y **no** cerrar el
   formulario ni perder la selección.
2. **Pisado por concurrencia.** Reemplazo completo significa que si otro admin
   editó la etiqueta de una categoría entre el snapshot y el guardado, se
   revierte. Se acota mostrando siempre datos vivos de `observarCategorias` y se
   marca con `ponytail:` nombrando la ruta de salida (una callable
   `asignarCategoriasAArea` que escriba sólo `areaIds` en un `WriteBatch`), a
   construir si el uso real lo pide.

**Alternativa descartada: callable nueva de asignación en bloque.** Es la
solución correcta a escala, pero hoy sería contrato + schema + callable + reglas
+ Fake + tests para un formulario que un admin usa unas pocas veces al mes.

---

## 3. Especificación por pantalla

Tokens citados por su nombre de `docs/DESIGN.md`. Copy en español neutro, listo
para pegar.

### 3.1 `ConteoScreen` — cabecera

**Jerarquía.** Fila 1 `BarraProgreso` + datos + `ChipEstado` (sin cambios).
Fila 2 búsqueda + Pendientes + Salir (sin cambios). **Fila 3** — reemplaza el
bloque `:286-316`: chip de área activa · interruptor "Ver todo" · "+ Producto".

**Chip de área activa.** No es un control: es un `<span>` con el nombre resuelto.

- Copy: `Área: {nombre}` — p. ej. `Área: Bodega`.
- Tokens: `text-micro`, color `tenue` para la palabra "Área", `tinta` para el
  nombre; sin borde ni fondo propios (no compite con `ChipEstado`).
- Fallback: si `areaActiva` no resuelve a un nombre en `areasActivas`, se pinta
  el id crudo. No se pinta un aviso: `ConteoScreen.tsx:131-135` ya redirige a
  `/preparar` cuando falta área, y `PrepararScreen` es quien explica.
- Accesibilidad: texto plano, sin `role`, sin `aria-live`. El área no cambia
  dentro de esta pantalla.

**Interruptor "Ver todo".**

- Elemento: `<button type="button" aria-pressed={verTodo}>`.
- **Nombre accesible exacto: `Ver todo`** (estable en ambos estados; el estado lo
  comunica `aria-pressed`, que es el contrato ARIA correcto para un toggle y el
  que ya usa "Pendientes").
- Icono: `<Icono nombre="filtro" />`, gemelo de "Pendientes".
- Estilos, idénticos al botón "Pendientes" (`ConteoScreen.tsx:260-263`):
  activo `border-senal text-senal`, inactivo `border-borde text-tenue`;
  `min-h-[var(--size-toque)]`, `rounded-placa`, `text-micro font-semibold`.
- Visibilidad: sólo si `lineasDeMiArea.length < lineas.length`.

**Estados de la lista.**

| Estado | Condición | Qué se pinta |
| --- | --- | --- |
| Cargando | `cargandoLineas` | Esqueleto actual, sin cambios |
| Normal | hay líneas visibles | Lista |
| **Mi área está vacía** | `!verTodo` y `lineasVisibles.length === 0` y `lineas.length > 0` | Aviso pasivo (abajo) |
| Sesión cerrada | `sesionCerrada` | Lista vacía + modal, sin cambios |

**Aviso de área vacía** — el modo de fallo que #84 nombra: si el admin llenó mal
`areaIds`, hay producto físicamente presente que no aparece.

- Copy exacto: `No hay categorías asignadas a tu área. Usa "Ver todo" para ver el catálogo completo.`
- **`role="status"`, nunca `role="alert"`.** `DESIGN.md` §Don'ts: sólo puede
  haber un `role="alert"` a la vez en esta pantalla, y ese lo tiene
  `BannerPendientes`.
- Tokens: `text-base`, color `tenue`, sin borde ni fondo de riesgo — no es un
  error, es una vista vacía recuperable.

### 3.2 `FilaCategoria`

Sin cambios estructurales. La segunda línea de texto (`FilaCategoria.tsx:98-107`)
gana uno o dos `<span>` hermanos.

**Restricción heredada, intocable:** `Tú: {n}` y `Equipo: {n}` siguen cada uno en
**un solo nodo de texto** — `ConteoScreen.test.tsx` consulta `findByText(/tú: 1/i)`.
Los nuevos `<span>` son hermanos, nunca envuelven a los existentes.

Orden final de la segunda línea:

1. `Tú: {miCantidad}` (o `—`) — sin cambios
2. `Equipo: {linea.cantidadTotal}` — sin cambios
3. `{moneda(valorUnitario)} c/u` — **sólo si** `moneda(valorUnitario) !== etiqueta`
4. `Subtotal {moneda(subtotal)}` — **sólo si** `miCantidad > 0`
5. `Otras áreas: {n}` — **sólo si** `verTodo` y hay unidades fuera del área activa
6. `<span className="sr-only">{confirmado ? "Guardado" : "Sin enviar"}</span>` — sin cambios

- Tokens: los cinco visibles comparten `text-micro text-tenue`; el subtotal lleva
  `text-tinta` para separarse (es la cifra nueva que importa). Ninguno usa
  `senal`: el ámbar está reservado a la firma de sincronización.
- `Numeral` no se usa aquí: `moneda()` ya emite un importe formateado y estos
  valores viven en línea con texto corrido.
- **`aria-label` de la fila** (`:65`) se extiende con el subtotal sólo cuando se
  pinta, para que el lector de pantalla reciba lo mismo que la vista:
  `Valor {etiqueta}, tu aporte {n}, total del equipo {n}, subtotal {moneda}`.
- `verTodo` llega como prop nueva `readonly mostrarOtrasAreas?: boolean`. No se
  suscribe nada nuevo: `porArea` ya viaja en la línea.

### 3.3 `Deck`

Sin cambios de markup. Sólo el comentario de cabecera (`:3-5`), reescrito para
citar el consolidado de ADR-07 en vez de I-9. Ver D-7.

### 3.4 `HojaNuevoProducto`

Tercer campo, entre Nombre y Área.

- `<label>` real asociado por `htmlFor`/`id` (`DESIGN.md` §Campos: nunca sólo
  placeholder). **Texto exacto: `Precio (opcional)`.**
- `<input inputmode="numeric" />`. Teclado numérico en móvil sin perder el
  borrado ni el pegado que `type="number"` complica.
- Placeholder: `Ej. 5000`.
- Nota bajo el campo, `text-micro text-tenue`:
  `Si no lo sabes, déjalo vacío y el administrador lo completa después.`
- Estilos: constante `CAMPO` ya existente en la pantalla; alto mínimo
  `--size-toque`.
- Comportamiento: vacío o no numérico ⇒ el payload **omite** `valor` (no envía
  `0`), para que el default siga viviendo en un solo sitio, el servidor.
- Validación de frontera (no se simplifica): entero ≥ 0. Un valor negativo o con
  decimales no se envía; el schema lo rechazaría igual
  (`valor?: z.number().int().min(0)`).

### 3.5 `AreasScreen` — superficie de asignación

Se conserva todo el CRUD actual. Se añade una columna y un formulario.

**Columna nueva, entre `Nombre` y `Activa`:**

- `etiqueta: "Categorías"`.
- `render`: número de categorías activas cuyo `areaIds` incluye ese `areaId`.
- `valorOrden`: el mismo número, para ordenar por volumen.
- Cero categorías ⇒ `0` en color `tenue`, nunca un guion: es un número real.

**Botón por fila, en la celda de acciones, primero:**

- Copy: `Asignar`.
- **Nombre accesible exacto: `Asignar categorías a {nombre}`** vía `aria-label` —
  con N filas, `Asignar` a secas se repite N veces y deja de identificar nada.
- Estilos: los del botón `Editar` (`AreasScreen.tsx:155`).

**Formulario de asignación** (mismo sitio y forma que `FormularioArea`, encima de
la tabla, no un modal — coherente con el CRUD existente):

- Título: `Categorías de {nombre}`.
- `<fieldset>` + `<legend>`: `Categorías activas`. Mismo patrón de checkbox
  múltiple que `CategoriasScreen.tsx:455-472` (escalón 2: reutilizar).
- Cada checkbox: `<label>` con el `<input type="checkbox">` dentro y la etiqueta
  de la categoría como texto. Nombre accesible = la etiqueta de la categoría.
- Dos atajos sobre la lista, `text-micro`: `Marcar todas` / `Desmarcar todas`.
  Con 200 categorías, marcar una por una haría el formulario inútil.
- Buscador sobre la lista si hay más de 20 categorías: `<input type="search">`
  con `<span className="sr-only">Buscar categoría</span>`, gemelo del de
  `ConteoScreen`.
- Botones: `Guardar asignación` (primario, `bg-senal`) y `Cancelar`.

**Estados del formulario:**

| Estado | Qué se pinta |
| --- | --- |
| Cargando categorías | `Spinner` + `Cargando categorías…` |
| Sin categorías activas | `No hay categorías activas todavía.` en `tenue` |
| Guardando | `Spinner` dentro del botón, sin ocultar su texto (`DESIGN.md` §Botón primario); checkboxes deshabilitados |
| Éxito | Se cierra el formulario; la columna y el aviso se actualizan solos por el listener |
| **Fallo parcial** | `role="alert"`, borde `riesgo`, fondo `riesgo-placa`. Copy: `Se guardaron {n} de {total} categorías. Vuelve a intentar con las que faltaron.` El formulario **no se cierra** y conserva la selección |
| Fallo total | Mismo bloque. Copy: `No se pudo guardar la asignación. Intenta de nuevo.` |

**Aviso pasivo de categorías sin área**, sobre la tabla:

- Sólo si el número es > 0.
- Copy exacto: `{n} categorías sin área. Se ven en todas las áreas mientras tanto.`
- La segunda frase es la que evita que el admin lo lea como un error: es
  exactamente el comportamiento que D-2 fija en la pantalla de conteo.
- **`role="status"`, no `role="alert"`** — decisión de grilling: "Sin área" avisa,
  nunca bloquea. Tokens `text-micro text-tenue`, sin fondo de riesgo.
- Enlace a la pestaña de Categorías: como esa pestaña vive en el estado local de
  `CatalogoScreen`, no hay ruta a la que enlazar. Se pinta como `<button>` con
  copy `Ver categorías`, y `CatalogoScreen` pasa a `AreasScreen` un
  `onIrACategorias?: () => void` que hace `setPestana("categorias")`. Opcional:
  si no llega la prop, el aviso se pinta sin botón.

---

## 4. Impacto en tests existentes

Los tests de `apps/web/src` fijan el markup a propósito (AGENTS.md §2): son la
red de regresión del rediseño. Cada rotura de abajo es correcta y la unidad que
la causa debe actualizarla en el mismo commit.

**Recordatorio de ejecución:** los tests de `apps/web` se corren **desde
`apps/web/`** — el vitest de la raíz no tiene jsdom.

### Unidad 1 (#84)

| Test | Qué rompe | Por qué es correcto |
| --- | --- | --- |
| `ConteoScreen.test.tsx:93` *"el selector de área filtra las categorías visibles…"* | Consulta `getByRole("combobox", { name: /área/i })`, que deja de existir | El `<select>` es justo lo que D-3 retira. Se reescribe contra el botón `Ver todo` |
| `ConteoScreen.test.tsx:161` *"no pinta el selector de área cuando sólo hay un área"* | Misma consulta; y la guarda pasa a ser `lineasDeMiArea.length < lineas.length` | La guarda vieja (`areas.length > 1`) mide el desglose contado, no lo asignado. Se reescribe conservando su intención |
| `ConteoScreen.test.tsx:100,111,169` — `porArea: { Aseo: 1 }` | Usan **nombres legibles como claves de área**, no ids | Sólo era viable mientras el `<select>` pintaba las claves crudas como etiquetas. `AnalisisConteoScreen.test.tsx:131` y `FinalizarScreen.test.tsx:79` ya documentan por escrito que las claves deben ser ids opacos. Se migran a `area_aseo` / `area_bebidas` y se siembran `areaIds` |
| Todas las factorías `crearLinea` de `apps/web/src/ui/*.test.tsx` | `LineaConteo` gana `areaIds` | Campo **opcional**: sólo las factorías de los tests de filtrado necesitan tocarse. Sin migración de datos |
| `packages/functions/test/lib/linea-sembrada.test.ts` | `lineaSembrada()` gana un campo | Es el test de la forma del documento sembrado; debe fijar el campo nuevo |
| `packages/functions/test/callables/abrir-sesion.test.ts` y `crear-categoria-en-sesion.test.ts` | Las líneas sembradas llevan `areaIds` | Par afirmativo obligatorio: una categoría con áreas siembra la línea con ellas, una sin áreas la siembra sin el campo |
| `apps/web/e2e/flujo-conteo.spec.ts` | El ticket ya lo anticipa: el flujo cambia | Necesita el emulador de Functions |

**Test nuevo imprescindible** (par afirmativo, AGENTS.md §2): con `areaActiva =
"area_bodega"`, una categoría de "bodega", una de "anaqueles" y una sin área, la
lista por defecto muestra **la de bodega y la sin área**, y `Ver todo` muestra las
tres. Un test que sólo comprobara la ocultación pasaría también con el filtro
roto.

### Unidad 2 (#85)

| Test | Qué rompe | Por qué es correcto |
| --- | --- | --- |
| `FilaCategoria.test.tsx` | El `aria-label` de la fila gana `, subtotal …` cuando `miCantidad > 0` | El lector de pantalla debe recibir lo mismo que la vista |
| `AnalisisConteoScreen.test.tsx:33-38` | **Sólo el comentario.** La aserción de la invariante monetaria **se mantiene** | Esa pantalla es el análisis agregado de la sesión — el consolidado que ADR-07 sí protege. Lo que estaba mal era el motivo escrito ("I-9"), no la regla |
| `Deck.test.tsx` | Nada | El markup no cambia (D-7) |
| `HojaNuevoProducto.test.tsx:52` *"«Sí, crear» llama a onCrear con la etiqueta y el área elegida"* | `onCrear` gana un tercer argumento | Firma nueva; el caso "sin precio" debe seguir llamando sin `valor` |
| `packages/contracts` + `crear-categoria-en-sesion.test.ts` | El schema acepta `valor` opcional | Necesita su par: con `valor` se usa; sin él, `0` |

**Cuidado con el falso positivo:** un test que sólo verifique "no aparece `$` en
el Deck" seguiría pasando con la regla rota. El par afirmativo es: **la fila SÍ
muestra el subtotal** y **el Deck NO muestra dinero**, ambos en la misma unidad.

### Unidad 3 (#82)

| Test | Qué rompe | Por qué es correcto |
| --- | --- | --- |
| `AreasScreen.test.tsx:28` *"lista las áreas sembradas"* | La tabla gana una columna | Cambio de contrato visible de la pantalla |
| `AreasScreen.test.tsx:73` *"ofrece desactivar y eliminar sólo a las áreas activas…"* | La celda de acciones gana `Asignar` | Debe seguir verificando que el resto de acciones no cambió |
| Resto de `AreasScreen.test.tsx` | Nada si las consultas son por nombre accesible | El CRUD no se toca |
| `CatalogoScreen.test.tsx` | Sólo si se implementa `onIrACategorias` | La prop es opcional |

**Tests nuevos imprescindibles:** (a) la columna cuenta sólo categorías
**activas** cuyo `areaIds` incluye el área; (b) guardar N categorías emite N
`actualizarCategoria` con `areaIds` correcto **y conservando `etiqueta`, `valor` y
`orden`** — es la regresión que protege del pisado por reemplazo completo; (c) un
fallo parcial deja el formulario abierto, con la selección intacta y el mensaje
con el conteo real.

---

## 5. Orden de implementación

Tres unidades de trabajo, una por commit (AGENTS.md §5, skill `work-unit-commits`).

### Unidad 1 — #84 · área activa manda en la vista · **~230 líneas**

Primera porque es la que arregla el flujo roto y la única con cambio de modelo;
las otras dos construyen sobre la fila y la pantalla que ésta deja estables.

Orden interno, de dentro hacia fuera:

1. `packages/shared/src/models/linea-conteo.ts` — `areaIds?`
2. `packages/functions/src/lib/linea-sembrada.ts` — el campo, con su `ponytail:`
3. `abrir-sesion.ts` (`categoria.get("areaIds")`) y `crear-categoria-en-sesion.ts`
4. Mapper de `firestore-conteo-repository.ts` y siembra del Fake
5. `ConteoScreen.tsx` — filtro D-2, interruptor D-3, chip D-5, aviso vacío
6. `FilaCategoria.tsx` — prop `mostrarOtrasAreas` y la línea de desglose (D-4)
7. Tests de `apps/web` (desde `apps/web/`) y de `packages/functions`
8. `apps/web/e2e/flujo-conteo.spec.ts` (requiere emulador de Functions)

### Unidad 2 — #85 · dinero de la línea propia · **~170 líneas**

**Depende de la Unidad 1**: toca la misma segunda línea de `FilaCategoria` que
D-4 modifica. Hacerlas a la vez garantiza conflicto en el mismo bloque.

1. `packages/contracts/schemas/crear-categoria-en-sesion.schema.ts` — `valor?`
2. `packages/functions/src/callables/crear-categoria-en-sesion.ts` — usarlo, default `0`
3. `FilaCategoria.tsx` — subtotal y precio condicional (D-6)
4. `HojaNuevoProducto.tsx` + `CrearCategoriaEnSesionPayload` — campo de precio
5. `Deck.tsx` y `ConteoScreen.tsx:2` — comentarios (D-7)
6. `docs/PRODUCT.md` — las tres frases de D-8
7. `AnalisisConteoScreen.test.tsx:33-38` — comentario; la aserción se queda
8. Tests

### Unidad 3 — #82 · Áreas como superficie de asignación · **~330 líneas**

**Independiente**: sólo toca `apps/web/src/ui/admin/`. Podría ir primera si
conviene entregar antes el lado admin; se pone al final porque es la más grande y
la que menos desbloquea al usuario final.

1. `AreasScreen.tsx` — columna, botón `Asignar`, `FormularioAsignacion`, aviso
2. `CatalogoScreen.tsx` — `onIrACategorias` (opcional)
3. `AdminLayout.tsx` — comentario de D-10
4. Tests

### Cierre de cada unidad

Antes de pedir revisión, en verde y en este orden (AGENTS.md §2 y §3):

```bash
npm run typecheck && npm run lint && npm test
# y, para la UI, desde apps/web/:
cd apps/web && npx vitest run
```

Los normalizadores que escriben (`format`, `lint --fix`) corren **antes** del
START de RDD; después sólo comprobaciones que no escriben. `npm run format` toca
todo el repositorio, así que se corre antes de congelar el candidato.

Detector mecánico de impeccable sobre la UI cambiada, una sola vez, al terminar
cada unidad:

```bash
node "C:\Users\PC RYZEN\.agents\skills\impeccable\scripts\detect.mjs" --json <archivos>
```

---

## 6. Resumen de riesgos abiertos

| Riesgo | Unidad | Mitigación |
| --- | --- | --- |
| Reasignar áreas con la sesión abierta no llega a la sesión | 1 | Aceptado (D-1) + interruptor "Ver todo" + `ponytail:` con ruta a `reconciliarLineas` |
| Sesiones ya abiertas no tienen `areaIds` en sus líneas | 1 | Campo opcional: se comportan como "sin área" y se ven siempre. Sin migración |
| Asignación en bloque pisa ediciones concurrentes | 3 | Datos vivos de `observarCategorias` + `ponytail:` con ruta a callable con `WriteBatch` |
| Fallo parcial de N llamadas | 3 | Estado explícito con conteo real; el formulario no se cierra ni pierde la selección |
| `moneda(valorUnitario) !== etiqueta` es una heurística | 2 | Comparación exacta contra el formateador único del repo (`formato.ts`); si falla, muestra de más, nunca de menos |
