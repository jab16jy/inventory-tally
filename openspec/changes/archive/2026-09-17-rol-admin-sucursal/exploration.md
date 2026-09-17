# Exploration: rol admin_sucursal (admin acotado a una sucursal)

> Materialized from Engram `sdd/rol-admin-sucursal/explore` (obs #1256). The explore
> executor had no Write tool; content is reproduced as recorded.

### Current State

- `RolUsuario = "admin" | "cajero"` — `packages/shared/src/models/usuario.ts:8`. `Usuario.sucursalesAsignadas: readonly string[]` (línea 15) y `CategoriaValor.sucursalesAsignadas?: readonly string[]` (`packages/shared/src/models/categoria-valor.ts:22`) ya soportan N:M; lo usa "cajero" hoy. `CategoriaValor` sin `sucursalesAsignadas` = global (comentario línea 11-13).
- Custom claims `{rol, sucursales}` se setean en 3 lugares: `crear-cajero.ts:45-48`, `actualizar-cajero.ts:40` (sólo si `rol`/`sucursalesAsignadas` cambian, seguido de `revokeRefreshTokens`), y `tools/crear-admin.ts:56` (script standalone de bootstrap del primer admin, en la raíz del repo, fuera de `packages/functions`).
- `exigirAdmin(req)` (`packages/functions/src/lib/exigir-admin.ts:9-16`) es binario, usado en exactamente 20 callables (confirmado por grep) bajo `packages/functions/src/callables/`.
- Patrón real de los 20 usos confirmado con 4 lecturas puntuales: `crear-cajero.ts`/`actualizar-cajero.ts`/`cerrar-sesion.ts`/`actualizar-categoria.ts` — TODOS llaman `exigirAdmin(req)` en el wrapper `onCall`, ANTES de `validar()` y antes de que `impl()` haga cualquier lookup del recurso. Esto es la forma general del "Patrón C", no una peculiaridad exclusiva de `cerrar-sesion`: `actualizar-categoria.ts` tiene exactamente la misma estructura (auth en el wrapper, luego `tx.get(categoriaRef)` recién dentro de la transacción). Lo que sí distingue a `cerrar-sesion` es su complejidad estructural: dos fases (fuera de tx: `verificarSincronizacion`; dentro de tx: lectura+congelado), con un branch de auditoría (`CIERRE_BLOQUEADO`) que hoy corre ANTES de saber si el llamante tiene permiso sobre esa sucursal — el chequeo de sucursal debe insertarse justo después de `sesionAntes.get()` (línea 42, `sucursalId` disponible en línea 49) y antes de la fase A, para no ejecutar side effects (auditoría, `verificarSincronizacion`) para un llamante no autorizado.
- Schemas confirmados: `contracts/schemas/crear-cajero.schema.ts:8` y `actualizar-cajero.schema.ts:9` → `rol: z.enum(["admin", "cajero"])`, sin `.refine()` de cardinalidad hoy.
- Firestore rules (`infra/firestore.rules`): `esAdmin()` línea 11, `tieneSucursal()` líneas 15-17 (bypass total si `esAdmin()`, si no `sucursalId in token.sucursales`). Bypass binario de `esAdmin()` confirmado en: `usuarios` get/list (líneas 27-28), `historicos` (línea 40), `resumen` (línea 112), `auditoria` (línea 151, en disyunción con `esCajero() && tieneSucursal(...)`).
- Frontend: `useAuthState.ts:35` expone sólo `esAdmin: token.claims.rol === "admin"` (booleano), normaliza `sucursales` (línea 17-20) pero NO expone `rol` crudo todavía. `guardas.ts` — `UsuarioAutenticado` (líneas 5-15) sólo tiene `esAdmin: boolean` + `sucursales?`; `calcularRedireccion` (línea 21-26) sólo compara `pathname.startsWith("/admin")`, sin caso especial para `/admin/comparativo`. `AdminLayout.tsx` — `AdminLayoutProps` (línea 48-50) HOY sólo tiene `onSalir`, sin prop `rol`; `DESTINOS` (línea 38-46) es un array estático de 7 items incluyendo `/admin/comparativo`, sin filtro por rol. `router.tsx:32,181` monta `ComparativoScreen` en `/admin/comparativo` sin guarda propia.
- `apps/web/src/lib/guardas.test.ts` está marcado como "protegido" (comentario en `guardas.ts:9-12` y en `useAuthState.test.ts:2`) — construye literales `UsuarioAutenticado` a mano sin campo `rol`. Agregar un campo `rol` opcional a `UsuarioAutenticado`/`EstadoAuth` y una rama nueva en `calcularRedireccion` para `/admin/comparativo` NO rompe `guardas.test.ts` (TypeScript estructural, campo opcional, tests actuales no tocan la rama nueva) — pero cualquier propuesta debe declarar explícitamente "no tocar guardas.test.ts".
- **Discrepancia real**: `CuentaScreen.tsx:87` usa `{estadoAuth?.esAdmin ? "Administrador" : "Cajero"}` — un ternario booleano. Una vez que `esAdmin` se redefine como `rol === "admin" || rol === "admin_sucursal"`, esta línea etiquetaría a un admin_sucursal como "Gerente". Necesita el `rol` crudo para un switch de 3 vías (Gerente / Admin de sucursal / Cajero): es un cambio de LÓGICA, no sólo de texto.
- `CajerosScreen.tsx` — opciones de rol en el select en líneas 25-26, render de tabla en línea 168 (`u.rol === "admin" ? "Administrador" : "Cajero"`). Ambos necesitan: relabel "Administrador"→"Gerente", tercera opción `admin_sucursal`, y switch de 3 vías en la tabla.
- `firestore-admin-repository.ts` confirma los mecanismos de filtro: `listarSesiones` (línea 201-203) ya acepta `filtro.sucursalId` opcional, `historicosRecientesPorSucursal(sucursalId, limite)` en línea 251-256, y una agregación (línea 232-243) que ya opera por `sucursalIds: readonly string[]` — el mecanismo N:M para acotar por sucursal ya existe end-to-end.

### Affected Areas

- `packages/shared/src/models/usuario.ts` — ampliar `RolUsuario`.
- `contracts/schemas/crear-cajero.schema.ts`, `contracts/schemas/actualizar-cajero.schema.ts` — enum + `.refine()` de cardinalidad 1.
- `packages/functions/src/lib/exigir-admin.ts` — nueva función `exigirAdminDeSucursal`, sin tocar `exigirAdmin`.
- 20 callables en `packages/functions/src/callables/` bajo 3 patrones — A: 7 sin cambios; B: 4 con `sucursalId` directo en el input (`abrir-sesion.ts`, `crear-cajero.ts`, `crear-categoria.ts`, `crear-categoria-en-sesion.ts`) más guard anti-escalada en `crear-cajero`/`crear-categoria`; C: 9 que requieren el chequeo tras el lookup del recurso (`actualizar/desactivar/reactivar/eliminar-cajero.ts`, `actualizar/desactivar/reactivar/eliminar-categoria.ts`, `cerrar-sesion.ts`).
- `infra/firestore.rules` — nueva función `puedeVerSucursal`, reemplaza `esAdmin()` en `historicos` (línea 40), `resumen` (línea 112), `auditoria` (línea 151); `usuarios` list/get (líneas 27-28) necesita `sucursalesAsignadas.hasAny(...)` porque `Usuario` no tiene `sucursalId` singular — mayor riesgo, sin test hoy.
- `infra/test/reglas.test.ts` — casos nuevos para los 4 puntos, especialmente `usuarios` list (rojo antes, verde después).
- `apps/web/src/state/useAuthState.ts` — exponer `rol` crudo, redefinir `esAdmin` como "entra a /admin".
- `apps/web/src/lib/guardas.ts` — nueva rama para `/admin/comparativo`; NO tocar `guardas.test.ts`.
- `apps/web/src/ui/admin/AdminLayout.tsx` — nueva prop `rol`, filtrar `DESTINOS`.
- `apps/web/src/ui/CuentaScreen.tsx:85-88` — switch de 3 vías por `rol` crudo.
- `apps/web/src/ui/admin/CajerosScreen.tsx:25-26,168` — tercera opción de rol + switch de 3 vías.
- `PanelScreen`, `SesionesScreen`, `AuditoriaScreen`, `SucursalesAdminScreen`, `CatalogoScreen`/`CategoriasScreen` — acotar por la sucursal propia reusando `filtro.sucursalId` / `historicosRecientesPorSucursal`.
- `ComparativoScreen.tsx` — no se toca, queda inalcanzable por la guarda nueva.

### Approaches

1. **Segunda función de autorización por sucursal (`exigirAdminDeSucursal`) + `puedeVerSucursal` en rules, reusando el campo N:M existente.**
   - Pros: reusa el modelo de datos y filtros existentes; cambios localizados; fail-closed por defecto; sin migración.
   - Cons: alto conteo de archivos (diffs chicos); disciplina para no romper `exigirAdmin` ni `guardas.test.ts`; reordenamiento repetitivo en Patrón C con riesgo de side effects previos a la autorización.
   - Effort: High (~25-28 archivos, ~400-620 líneas).
2. **Middleware/wrapper único que decora `onCall` con el nivel de autorización.**
   - Pros: un solo punto de verdad.
   - Cons: refactor de las 20 callables (mayor blast radius); Patrón C igual necesita un lookup por callable; YAGNI.
   - Effort: High, mayor riesgo sin beneficio claro.

### Recommendation

Approach 1. Reusa el 100% del modelo N:M existente, no introduce indirección nueva y mantiene cada callable auditable. El bloque de mayor riesgo es `usuarios` (list/get) en rules, a implementar con test rojo→verde antes que el resto.

### Risks

- Fuga de datos en `usuarios` list/get si se omite `hasAny` — sin cobertura de test hoy.
- Auth-después-de-lookup en las 9 callables de Patrón C: si el chequeo va después de un side effect (ej. auditoría `CIERRE_BLOQUEADO` en `cerrar-sesion`), un llamante no autorizado dispararía efectos antes del rechazo.
- Anti-escalada: un `admin_sucursal` no debe crear otro admin/admin_sucursal, asignar una sucursal ajena, ni crear una categoría global — vive en las callables (rules ya bloquean escritura directa con `allow write: if false`).
- `esAdmin` se re-significa ("entra a /admin") en varios consumidores; los que asumen "es Gerente" (como `CuentaScreen.tsx:87`) deben leer el `rol` crudo.
- `guardas.test.ts` protegido: verificar `guardas.ts` contra él sin editarlo.
- `tools/crear-admin.ts` sigue fijando `rol: "admin"` — correcto (sólo Gerente raíz); confirma que no hay un tercer camino de creación de usuarios.

### Ready for Proposal

Yes — Approach 1, sumando `CuentaScreen.tsx` al bloque frontend y aplicando el reordenamiento auth-después-de-lookup a las 9 callables de Patrón C por igual.
