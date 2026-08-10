# Plan de implementación — Puesta en producción

> Estado: **aprobado, pendiente de ejecutar**.
> Alcance: `docs/diseno/12-despliegue-y-entornos.md` completo — entornos,
> despliegue, observabilidad y respaldo — más el blocker de empaquetado que
> ningún documento anterior anticipó.
> Continúa [`plan-panel-administrador.md`](plan-panel-administrador.md), que
> cerró la última funcionalidad pendiente del producto.

## Contexto

El repositorio está funcionalmente terminado. 15 rutas, 14 Cloud Functions,
79 archivos de test con 451 casos, 27 tests de Security Rules, cero
`TODO`/`FIXME`. Los RF-01 a RF-16 están implementados.

Lo que no existe es **el doc 12 entero**. El sistema no se puede poner en manos
de un cajero hoy: no hay proyectos de Firebase, no hay un solo job de deploy, no
hay una sola línea de telemetría, y no hay respaldo.

### El blocker: `packages/functions` no es desplegable

Verificado en `packages/functions/package.json`, no supuesto:

- `"main": "src/index.ts"` y **no hay script `build`**. `firebase deploy`
  subiría TypeScript a un runtime Node 22 que no lo ejecuta.
- Sus dependencias son de workspace: `"@conteo/contracts": "*"` y
  `"@conteo/shared": "*"`. Firebase empaqueta **sólo** el directorio de
  `functions.source`; esos symlinks a `packages/` y `contracts/` no viajan.
- El código importa por submódulo (`@conteo/shared/services/sincronizacion.js`),
  resuelto hoy por los paths de `tsconfig.base.json` y por el alias de
  `packages/functions/vitest.config.ts`. En runtime no existe ninguno de los dos.

Los 79 archivos de test están verdes porque Vitest resuelve los alias. El deploy
no los tiene. Por eso el ticket 2 va primero: sin él, nada de lo demás importa.

### Cuatro documentos que hoy mienten

`plan-diseno-visual-pwa.md:3` y `plan-panel-administrador.md:3` siguen diciendo
"aprobado, pendiente de ejecutar" sobre trabajo terminado; `DESIGN.md:130,149`
declara `Deck`, `ChipEstado`, `Hoja` e `Icono` como no construidos cuando los
ocho primitivos existen; `PRODUCT.md:14` afirma que `cerrarSesion` y
`crearCajero` "todavía no existen" cuando ambas están exportadas. El ticket 1 lo
corrige antes de que un agente planifique trabajo ya hecho.

---

## 1. Modelo de ejecución

**Todos los subagentes de implementación corren en Sonnet 5.** Al invocar la
herramienta Agent para cualquier trabajo de estos 9 tickets, pasar
`model: "sonnet"` de forma explícita — no heredar el modelo del orquestador.
Aplica a escritura de código, exploración previa a una escritura, y ejecución de
tests o builds. La orquestación y la revisión adversarial se quedan como estén
configuradas.

Un ticket = un PR = un contexto fresco. Los tickets están dimensionados para eso.

---

## 2. Protocolo por commit

Obligatorio en los 9 tickets, sin excepción:

1. **TDD.** El test se escribe y falla antes de que exista el código. Los
   criterios de aceptación de cada ticket son el contrato, no una ilustración.
2. **ponytail** en cada commit de implementación. Todo atajo deliberado lleva su
   comentario `// ponytail:` con su techo y su salida. El repo ya tiene cinco;
   seguir ese estilo.
3. **RDD por commit.** Está activo (`gentle-ai review mode status` → `on`). La
   normalización va **antes** del congelado del candidato.
4. **Conventional commits en español**, siguiendo el estilo del historial.
   **Nunca** `Co-Authored-By` ni atribución de IA.
5. **Ningún test preexistente se modifica.** Si hay que editar un test verde para
   que pase el trabajo nuevo, el cambio se desvió — parar y revisar.

---

## 3. Los 9 tickets

Nueve rebanadas verticales, cada una verificable por sí sola. Cuatro arrancan de
inmediato: **1, 2, 3 y 4**.

| # | Ticket | Bloqueado por |
|---|---|---|
| 1 | Sincronizar los cuatro docs con el código | — |
| 2 | Bundle desplegable de Cloud Functions | — |
| 3 | Bloqueo por versión mínima | — |
| 4 | Provisión de entornos dev y prod | — |
| 5 | Deploy a dev en merge a `main` | 2, 4 |
| 6 | Canal de preview por PR | 5 |
| 7 | Deploy a prod por tag `v*` | 5 |
| 8 | Observabilidad del cliente | 4 |
| 9 | Respaldo diario a Cloud Storage | 4 |

Tres decisiones de granularidad, confirmadas:

- **La observabilidad va fusionada en el 8.** El doc 12 §4 lista Analytics,
  Performance y el error boundary por separado, pero los tres cuelgan del mismo
  `apps/web/src/lib/analitica.ts` y del mismo `measurementId`. Partirlos crea
  tres tickets que se pisan el mismo archivo.
- **El 3 no depende de ningún deploy.** Se verifica entero contra el emulador,
  aunque toque `firestore.rules`.
- **El 6 y el 7 cuelgan del 5, no del 4.** Los tres editan el mismo job compuesto
  de deploy en `ci.yml`; en paralelo garantizan conflicto.

No hay ningún refactor ancho: nada tiene un radio de impacto que impida a una
rebanada aterrizar en verde.

---

### Ticket 1 · Sincronizar los cuatro docs con el código

**Bloqueado por:** nada.

| Archivo | Línea | Corrección |
|---|---|---|
| `docs/plan-diseno-visual-pwa.md` | 3 | Estado → ejecutado (F0–F4) |
| `docs/plan-panel-administrador.md` | 3 | Estado → ejecutado (F1–F5) |
| `docs/DESIGN.md` | 70, 130, 149 | `Deck`, `ChipEstado`, `Hoja`, `Icono` existen; documentar los 8 primitivos reales de `apps/web/src/ui/primitivos/` |
| `docs/PRODUCT.md` | 14 | `cerrarSesion` y `crearCajero` existen; el panel admin está construido |

**Criterios de aceptación**

- [ ] Ningún doc afirma que algo construido está pendiente.
- [ ] `DESIGN.md` documenta los 8 primitivos que existen, con su contrato real.
- [ ] Cero cambios en código.

---

### Ticket 2 · Bundle desplegable de Cloud Functions

**Bloqueado por:** nada. **Es el blocker de todo lo demás.**

**Decisión: bundle con esbuild, no `tsc`.** `tsc` emitiría
`import "@conteo/shared/services/sincronizacion.js"` sin resolver — el mismo
problema, un paso más tarde. El bundle inlina shared y contracts en un archivo y
elimina la resolución de workspace por completo. esbuild ya está en el árbol como
dependencia transitiva de Vite; no se añade nada nuevo.

- `packages/functions/package.json` — `"main": "lib/index.js"` y script `"build"`
  con `esbuild src/index.ts --bundle --platform=node --target=node22
  --format=esm --outfile=lib/index.js --external:firebase-admin
  --external:firebase-functions`. Las dos externals se quedan en `dependencies`
  porque el runtime las instala; `zod` se inlina.
- `infra/firebase.json` — `functions.predeploy` que invoque ese build.
- `.gitignore` — añadir `packages/functions/lib/`. La entrada `build/` existente
  no lo cubre.

**Criterios de aceptación**

- [ ] Un test afirma que el bundle exporta exactamente los 14 nombres de `packages/functions/src/index.ts`. Falla si alguien añade una función y olvida reexportarla.
- [ ] `npm run build --workspace packages/functions` produce `lib/index.js` sin ningún import de workspace sin resolver.
- [ ] `firebase deploy --only functions --dry-run` contra dev pasa.
- [ ] La suite de `packages/functions` corre **dos veces seguidas** en verde — es el detector de fuga de estado entre tests que documenta `plan-panel-administrador.md:186`.

---

### Ticket 3 · Bloqueo por versión mínima

**Bloqueado por:** nada.

`docs/diseno/12:120-136` lo marca como **crítico con uso mensual**: un cajero
abre la app 30 días después con un cliente viejo y corrompe las agregaciones
escribiendo aportes con formato antiguo. Hoy no existe — `grep versionMinima|config/app`
devuelve cero en todo el repo.

`ModalActualizacionDisponible` **no** cubre esto: es el prompt del service worker
(`registerType: "prompt"`), reacciona a un bundle nuevo ya descargado, no a un
mínimo declarado por el servidor.

- `packages/shared` — predicado puro `requiereActualizacion(actual, minima)`. Va
  aquí y no en `apps/web` porque es dominio sin locale, igual que
  `aporteConfirmado` en `services/sincronizacion.ts`.
- `apps/web/vite.config.ts` — `define` que inyecte la versión del build.
- `apps/web/src/main.tsx` — lectura de `config/app` antes de montar el router.
- `infra/firestore.rules` — colección `config`: `read: if autenticado()`,
  `write: if false`. Va **antes** del `match /{document=**}` de denegación por
  defecto.

**Riesgo:** un `versionMinima` mal puesto deja a **todos** los cajeros fuera de la
app, y la única salida es editar Firestore a mano. Candidato claro para
`judgment-day`.

**Criterios de aceptación**

- [ ] Test del predicado escrito primero, cubriendo igual, mayor, menor y versión malformada.
- [ ] Con `versionMinima` por encima de la versión del build, la app bloquea; por debajo, arranca.
- [ ] `infra/test/reglas.test.ts` gana un caso: un cajero lee `config/app`, nadie escribe.
- [ ] `npm run test:rules` verde.

---

### Ticket 4 · Provisión de entornos dev y prod

**Bloqueado por:** nada.

`.firebaserc` tiene `{"dev": "", "prod": ""}` — vacío.
`apps/web/src/lib/firebase.ts:19-25` **ya lee** `VITE_FIREBASE_*` con fallback al
proyecto demo, así que la mitad del cableado existe.

- `.firebaserc` con los IDs reales de los dos proyectos.
- `apps/web/.env.dev.example` y `.env.prod.example` con las 6 claves
  `VITE_FIREBASE_*` que consume `firebase.ts`. `.gitignore:12-13` ya permite
  cualquier `.env*.example`.
- `apps/web/package.json` — el script `build` es `vite build` a secas;
  `docs/diseno/12:22` exige `--mode prod`.
  `packages/shared/src/config/entorno.ts` ya deriva `Config.esProd` de
  `import.meta.env.MODE` y su test lo cubre.

**Los proyectos Firebase los crea un humano en la consola.** Este ticket entrega
el wizard bash que guía crear ambos proyectos, habilitar Auth por correo, fijar
el plan Blaze con tope de presupuesto, generar las service accounts, cargar los
secretos en GitHub y volcar la config en los `.env`.

**Criterios de aceptación**

- [ ] El wizard corre de principio a fin y deja los dos proyectos operativos.
- [ ] `npm run build --workspace apps/web` con `--mode prod` produce `Config.esProd === true`; con `--mode dev`, `false`.
- [ ] `.firebaserc` sin cadenas vacías.
- [ ] Ninguna credencial real versionada — sólo los `.env.*.example`.

---

### Ticket 5 · Deploy a dev en merge a `main`

**Bloqueado por:** 2, 4.

`.github/workflows/ci.yml` tiene cuatro jobs de verificación y **cero de deploy**.
Este ticket añade el primero, con `needs: [web, contratos, functions, reglas]` —
la regla de oro de `docs/diseno/12:90`: las reglas no se despliegan si sus tests
fallan.

Orden obligatorio (`docs/diseno/12:96-101`), y la razón de cada paso está escrita
ahí: índices primero, porque tardan minutos y una consulta desplegada antes de su
índice falla en ejecución; hosting al final, para que la app nunca sirva una
versión que adelanta un esquema todavía no desplegado.

```
firestore:indexes → firestore:rules → functions → hosting
```

**Trampa de `dorny/paths-filter`:** los jobs de deploy **no** pueden depender de
filtros de ruta con `if:`. Un push que sólo toca `infra/` saltaría el job `web` y
dejaría los `needs` en `skipped`, que no es `success`. Usar `always()` con
comprobación explícita de resultado, o quitar el filtro en la rama `main`.

**Criterios de aceptación**

- [ ] Un merge a `main` despliega los cuatro artefactos a dev, en ese orden.
- [ ] Un fallo inyectado en `npm run test:rules` **bloquea** el deploy — verificado, no asumido.
- [ ] Un push que sólo toca `infra/` despliega igual, sin quedarse en `skipped`.

---

### Ticket 6 · Canal de preview por PR

**Bloqueado por:** 5.

Doc 12 §3: canal de preview de Hosting en cada PR, para el equipo de pruebas.
Reusa el job compuesto del ticket 5.

**Criterios de aceptación**

- [ ] Cada PR publica su URL de preview.
- [ ] El preview no despliega reglas, índices ni functions — sólo hosting.

---

### Ticket 7 · Deploy a prod por tag `v*`

**Bloqueado por:** 5.

Mismo orden de despliegue, proyecto prod, disparado por tag. Deploy irreversible:
candidato a `judgment-day`.

**Criterios de aceptación**

- [ ] Un tag `v0.1.0` despliega a producción con el orden índices → reglas → functions → hosting.
- [ ] Los mismos `needs` de verificación que el ticket 5.

---

### Ticket 8 · Observabilidad del cliente

**Bloqueado por:** 4 (necesita el `measurementId` de los `.env`).

`grep logEvent|getAnalytics|getPerformance|ErrorBoundary` devuelve **cero
resultados** en todo `apps/`. `docs/diseno/12:176-182` llama a dos de estos
eventos "las dos métricas que responden las preguntas abiertas del diseño": si
`pendientes_al_finalizar` es alto de forma sostenida, el riesgo de la PWA es
real; si `offline == 1` es casi siempre cero, buena parte de la complejidad del
sistema sobra y conviene saberlo.

- `apps/web/src/lib/analitica.ts` — módulo nuevo, espejo de `funciones.ts`.
  Inicializa Analytics **sólo si hay `measurementId`**, para que el emulador y
  los tests no emitan nada.
- `logEvent("aporte_registrado", {sucursal_id, offline})` donde hoy se llama
  `registrarAporte`.
- `logEvent("sesion_finalizada", {pendientes_al_finalizar, segundos_esperando_sync})`
  en `FinalizarScreen.tsx`.
- Error boundary de React + `window.onerror` → `logEvent("excepcion_cliente")`.
- `getPerformance(app)` — una línea.

Ponytail: sin abstracción de "proveedor de telemetría". Hay un proveedor y no va
a haber dos.

**Criterios de aceptación**

- [ ] DebugView recibe `aporte_registrado` con `offline: 1` tras contar con la red cortada.
- [ ] DebugView recibe `sesion_finalizada` al confirmar el cierre del cajero.
- [ ] Una excepción no capturada emite `excepcion_cliente` y no deja la app en blanco.
- [ ] Sin `measurementId`, no se inicializa nada y ningún test emite eventos.

---

### Ticket 9 · Respaldo diario a Cloud Storage

**Bloqueado por:** 4.

`docs/diseno/12:193` pide exportación diaria a Cloud Storage, RPO 24 h. Esto **no
es código**: es `gcloud firestore export` disparado por Cloud Scheduler, más un
bucket con política de retención. Al repo entra el wizard y la documentación del
procedimiento, nada más.

`infra/storage.rules` niega todo hoy, y está bien: el bucket de respaldos no se
toca desde el cliente.

**Criterios de aceptación**

- [ ] El job de export disparado a mano deja el objeto en el bucket.
- [ ] El schedule diario queda creado y documentado.
- [ ] `infra/storage.rules` sin cambios.

---

## 4. Skills, por ticket

| Skill | Dónde | Por qué |
|---|---|---|
| `ponytail` | Todos | Ya activo. Cada atajo deliberado con su `// ponytail:` y su techo |
| `tdd` | 2, 3, 8 | Hay predicados puros y contratos de export que se prueban antes de existir |
| `wizard` | 4, 9 | Consola de Firebase, service accounts, secretos de GitHub, Cloud Scheduler. Pasos que sólo un humano puede dar |
| `firebase-basics` | 4 | `firebase login`, creación de proyectos, `firebase use`, descarga de config |
| `find-docs` (ctx7) | 2, 5 | Flags de esbuild para Functions Gen 2 y las actions de deploy de Firebase. No confiar en memoria para APIs de despliegue |
| `firebase-security-rules-auditor` | 3 | Es el único cambio a `firestore.rules` de todo el plan |
| `judgment-day` | 3, 7 | Un bloqueo que puede dejar fuera a todo el personal, y un deploy irreversible |
| `work-unit-commits` | Al abrir cada ticket | Test + fuente + doc en la misma unidad |
| `branch-pr` | Al abrir cada PR | Uno por ticket |
| `chained-pr` | Si un ticket pasa de ~400 líneas | El 5 es la candidata |
| `code-review` | Cierre de cada ticket | Los dos ejes, Standards y Spec |
| `systematic-debugging` | Reactivo | Si el bundle del ticket 2 rompe un test de functions hoy verde |

**No** hacen falta `to-spec`, `wayfinder` ni `grill-me`: el diseño está decidido
en `docs/diseno/12` y no queda ambigüedad que resolver.

---

## 5. Verificación final

Cuando los 9 estén cerrados, correr el checklist de
`plan-panel-administrador.md:222-235` que nunca se ejecutó:

- `npm test`, `npm run test:rules`, `npm run typecheck`, `npm run lint`.
- Recorrido manual con emulador (`npm run emu` + `npm run seed`): crear sucursal
  → crear categoría → abrir sesión → contar con dos cajeros → ver el análisis →
  cierre bloqueado → forzar → histórico en el comparativo. Es el único camino que
  toca las 15 rutas y las 10 callables.
- Ciclo completo de un cajero: crear → desactivar → reactivar → confirmar que
  vuelve a contar.
- Perfil con 200 filas sembradas: < 20 ms/frame (RNF-05). Este número decide si
  entra una librería de virtualización.
- Bundle < 500 KB comprimido, con la fuente y con Analytics incluidos.
- Contraste AA sobre `#0F1115` en las gráficas del análisis — verificar, no
  asumir.
- A 1024 px y a 1920 px: nada se corta ni se solapa.

---

## 6. Fuera de este plan

La deuda anotada en `plan-panel-administrador.md:239` sigue fuera: export
CSV/PDF, reset de contraseña, `ejecutadoPor` en `SESION_CERRADA` y
`CIERRE_BLOQUEADO`, reapertura de sesiones (`sesionCorregidaId` está en
`mappers.ts:67` y nunca se escribe), filtros combinables de auditoría, y
breakpoints de móvil y tablet del panel admin.
