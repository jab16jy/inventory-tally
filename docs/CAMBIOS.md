# CAMBIOS.md

Registro de cambios aplicados al repositorio, documento por documento. Se añade
una entrada por sesión de trabajo, no por commit.

---

## 2026-08-09 — Guía de ejecución local: el arranque que funciona

### Qué pasó

Dos síntomas consecutivos al intentar ver la app en local, ambos **de
entorno**, no de código:

1. **"Correo o contraseña incorrectos" al iniciar sesión.** `LoginScreen` muestra
   ese mensaje genérico para **cualquier** fallo de autenticación (doc 09:
   deliberado, para no filtrar correos registrados). La causa real: la web
   apuntaba al proyecto **real** de Firebase porque no existía
   `VITE_USE_EMULATORS=true`. `apps/web/src/lib/firebase.ts:49` sólo conecta a
   los emuladores si esa variable está puesta.
2. **Login exitoso pero "no pasa nada".** Con los emuladores arriba y el seed
   corrido, el login autentica (token con claims) pero la ruta `/login` no
   redirigía a ningún lado: `LoginScreen` no navega tras el éxito y la ruta no
   tenía guarda. Faltaba el paso `SPLASH → LOGIN → HOME{rol}` del doc 11 §2.

### Cambios aplicados

| Archivo                                     | Cambio                                                                                       |
| ------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `apps/web/.env`                             | Nuevo: `VITE_USE_EMULATORS=true` (ignorado por git; `apps/web/.env.example` documenta el paso). |
| `apps/web/.env.example`                     | Nuevo: plantilla con el comentario explicando por qué va "true" en local.                     |
| `README.md` (sección Arrancar)              | Documenta el paso de crear el `.env` antes de `npm run dev`.                                  |
| `apps/web/src/lib/guardas.ts`               | Nueva función `homePorRol(auth)` (admin → `/admin`, cajero → `/sucursales`).                  |
| `apps/web/src/lib/guardas.test.ts`          | Test afirmativo de `homePorRol`.                                                             |
| `apps/web/src/lib/router.tsx`               | `RequireAnonimo` para `/login` (con sesión → salta al home del rol) y ruta `/` → `HomeSegunSesion`. |

### Cómo ejecutar el proyecto correctamente

Requisitos: Node 22, Java 17+, npm 9+. En **tres terminales**:

```bash
# Terminal 1 — emuladores (auth, firestore, functions, hosting)
npm run emu

# Terminal 2 — siembra: 1 admin, 2 cajeros, 1 sucursal, 60 categorías
npm run seed

# Terminal 3 — la PWA
npm run dev
```

Pasos que no están en los scripts y hay que hacer a mano:

1. **Crear `apps/web/.env`** (una sola vez, la primera):
   ```
   VITE_USE_EMULATORS=true
   ```
2. **Entrar por `/login`**, no por la raíz: http://localhost:5173/login
   (aunque ahora la raíz `/` ya redirige sola, es el camino documentado).
3. **Credenciales** (ver `tools/seed.ts:27,82-84`):
   - `admin@negocio.com` / `Temp2026#` → va a `/admin`
   - `ana@negocio.com` / `Temp2026#` → va a `/sucursales`
4. **Si reinicias los emuladores, re-ejecuta `npm run seed`.** El emulador de
   Auth **no persiste** los usuarios entre reinicios y el seed **no es
   idempotente** (`seed.ts:10-12`). Síntoma de olvidarlo: login vuelve a fallar
   con el mensaje genérico.
5. **El dev server debe reiniciarse tras crear el `.env`**: Vite lee las
   variables `VITE_*` al arrancar. Si ya estaba abierto, reinícialo.

### Verificación

- `npm run typecheck` y `npm run lint` verdes.
- `npm test` — 429 tests: web 187, data 59, functions 79 (contra emulador), shared 65, contracts 39.
- Login comprobado contra el emulador vía REST (`signInWithPassword` →
  `registered:true`, token con `rol:admin`).

