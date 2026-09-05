# inventory-tally

Sistema de conteo de inventario agrupado por **valor monetario**, multi-sucursal,
colaborativo en tiempo real, con auditoría inmutable.

**Stack:** React · Vite · TypeScript · Firebase · npm workspaces
**Diseño completo:** [`docs/diseno/`](docs/diseno/README.md) — 15 documentos, léelos antes de tocar nada.

---

## El principio que sostiene todo

> El cliente **nunca escribe un total**; sólo declara _su_ aporte.
> Todo dato derivado lo produce el backend.

Eso es lo que hace el sistema correcto bajo concurrencia, correcto offline y
resistente a manipulación. Si una propuesta de cambio rompe esa regla, la
propuesta está mal, no la regla.

---

## Requisitos

| Herramienta | Versión           | Por qué                                      |
| ----------- | ----------------- | -------------------------------------------- |
| Node        | 22 (ver `.nvmrc`) | Cloud Functions v2 **no soporta runtime 24** |
| Java        | JRE 17+           | Los emuladores de Firebase lo exigen         |
| npm         | 9+                | workspaces                                   |

`firebase-tools` es dependencia del repositorio, no global: se invoca con `npx firebase`.

> **Windows:** si instalaste Java con `scoop install temurin17-jre`, puede no quedar
> en el `PATH` de tu shell aunque `JAVA_HOME` esté puesto. Compruébalo con
> `java -version` antes de levantar emuladores.

---

## Arrancar

```bash
npm install

# Una sola vez: la web sólo usa los emuladores si esta variable existe
# (doc 06 §4). Sin ella apunta al proyecto real y el login falla.
#   apps/web/.env  →  VITE_USE_EMULATORS=true
# (ver apps/web/.env.example)

# Terminal 1 — emuladores (auth, firestore, functions, hosting)
npm run emu

# Terminal 2 — siembra: 1 admin, 2 cajeros, 1 sucursal, 60 categorías
npm run seed

# Terminal 3 — la PWA (entra por /login; credenciales en tools/seed.ts)
npm run dev
```

`firebase.json` vive en `infra/`, así que **todo comando de firebase necesita
`--config infra/firebase.json`**. Los scripts de npm ya lo incluyen.

## Verificar

```bash
npm run typecheck   # los 6 workspaces
npm run lint
npm test            # unitarios + integración contra emulador
npm run test:rules  # Security Rules, cada regla afirmada y negada
npm run test:e2e    # Playwright contra emuladores (auth + firestore), siembra incluida
```

---

## Estructura

```
apps/web/          PWA React + Vite. Única interfaz del sistema.
packages/
  shared/          Dominio puro. Sin React, sin Firebase — lo impone ESLint.
  data/            Repositorios: interfaz, fake en memoria, impl Firestore.
  functions/       Cloud Functions. Node 22.
contracts/         Esquemas zod compartidos entre cliente y servidor.
infra/             firestore.rules, índices, firebase.json.
tools/             Siembra del emulador.
docs/diseno/       La autoridad. 15 documentos.
```

**Regla de dependencia:** las flechas apuntan hacia abajo. `shared` no importa nada
del proyecto; `data` importa `shared` y `contracts`; `apps/web` importa todo. Sólo
`packages/data/firebase` toca el SDK de Firebase.

---

## Tres cosas que te van a morder si no las lees

**1. El aporte admite exactamente 6 claves.** Las reglas usan
`hasOnly(['uid','nombre','cantidad','registradoEn','dispositivoId','version'])`.
Un campo extra hace fallar la escritura entera.

**2. `version` se escribe con `increment(1)` vía `update()` o `set({merge:true})`,
nunca con un `set()` de reemplazo total.** En ese caso la regla no ve el valor
calculado y falla con `evaluation error`. `version` es la única guardia de
idempotencia del trigger de agregación.

**3. El `void setDoc(...)` sin `await` de `FirestoreConteoRepository` es deliberado**
y tiene un test que lo fija. Con la red ausente esa promesa no resuelve hasta
confirmar en servidor, y la UI quedaría colgada mientras el cajero cuenta. El
listener local ya actualizó la pantalla. No lo "arregles".

---

## Qué hay implementado

Esto es un **esqueleto caminante**, no el sistema completo: demuestra la cadena
aporte → trigger → total en tiempo real, con offline, reglas reales y auditoría.

| Implementado                                                 | Pendiente |
| ------------------------------------------------------------ | --------- |
| Security Rules completas + 27 tests                          | App Check |
| `onAporteEscrito` idempotente y tolerante a reordenamiento   |           |
| `abrirSesion` transaccional con rollback de siembra          |           |
| PWA: login, conteo en tiempo real, banner de pendientes      |           |
| Detección de degradación de persistencia                     |           |
| CI por rutas afectadas, con E2E como requisito de deploy-dev |           |
| `crearCajero`, `actualizarCajero`, `desactivarCajero`        |           |
| `cerrarSesion` con verificación RF-16                        |           |
| Crons: resúmenes, reconciliación, purga                      |           |
| Panel de administrador, análisis mensual y por área          |           |
| Pantallas `/preparar` y `/finalizar`                         |           |
| Eliminar/reactivar categorías, áreas y cajeros (con guardas) |           |
| Admin puede contar sesiones abiertas de cualquier sucursal   |           |
| Control de versión mínima (bloquea clientes desactualizados) |           |
| E2E con Playwright contra el Emulator Suite                  |           |

También faltan los iconos de la PWA (`apps/web/public/icons/*.png`): el manifest
los referencia pero no existen todavía.

---

## Cómo se trabaja aquí

Los commits pasan por revisión adversarial (`gentle-ai`) antes de entrar. No es
ceremonia: en las cuatro olas de este scaffold la revisión encontró **seis defectos
con 113 tests en verde**, incluidos dos que perdían conteos en silencio y dos
snippets rotos en los propios documentos de diseño.

La lección, escrita aquí para que no se pierda: **un test negativo que también
pasaría si la regla estuviera rota no demuestra nada.** Cada regla necesita su par
afirmativo. Así se destapó que la regla de `sincronizacion/estado` del doc 09
lanzaba `evaluation error` para _toda_ escritura.
