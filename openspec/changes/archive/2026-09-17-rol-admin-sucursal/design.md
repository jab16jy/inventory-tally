# Design: Rol admin_sucursal (branch-scoped admin)

## Technical Approach

Exploration Approach 1. There is no middleware. The role gate returns a **scope** (`AlcanceAdmin`). Every scoped check reduces to one predicate: "the resource's sucursales are exactly `[own]`". Rules gain `esAdminSucursal()` / `puedeVerSucursal()`. The web client gets scoped queries from ONE module, `FirestoreAdminRepository`, which is constructed with the scope. Specs: `specs/admin-sucursal`, `specs/gestion-cajeros`, `specs/cierre-sesion`.

## Architecture Decisions

| # | Choice | Rejected | Rationale |
|---|---|---|---|
| D1 | `exigirAdminDeSucursal(req): AlcanceAdmin` (`null` = Gerente, `string` = own sucursal). It throws on 0 or >1 claim sucursales | Boolean gate + separate claim parsing per callable | One call gives both the role gate and the scope. It reuses `autorizacionDe` (claim normalization already exists) |
| D2 | Ownership = `exigirExclusivaDeSucursal(alcance, sucursales)`. The value must be exactly `[alcance]`; `undefined` (global) is denied | Per-resource rules | Decisions 1/2 are the same invariant. Sesiones pass `[sesion.sucursalId]` |
| D3 | **Cajero target = Auth custom claims** (`auth.getUser(uid).customClaims.{rol,sucursales}`) for actualizar/desactivar/reactivar/eliminar | Reading `usuarios/{uid}` (spec draft) | Doc 09 §2 says claims are the authority, and `eliminar-cajero.ts:60` already states it. Claims mirror `sucursalesAsignadas` by construction: crear/actualizar set claims before the profile, and desactivar never clears them. The profile stays only in eliminar's existing orphan fallback, which is reachable for the Gerente only. For admin_sucursal, a missing Auth user returns `not-found` |
| D4 | Input-only and Auth-lookup checks run in the `onCall` wrapper, before `Impl`. Lookup checks (cerrar + 4 categoría callables) run inside `Impl` right after the read, through a REQUIRED trailing `alcance: AlcanceAdmin` parameter (no default). Existing tests pass `null` explicitly (Gerente scope) | Optional `alcance = null` default (zero test churn, but a forgotten wire silently grants Gerente scope — fails open); pre-read outside tx (TOCTOU) | Orchestrator override after design validation: AGENTS.md §1 never simplifies security. A required param makes TypeScript enforce the wiring, so a missing scope is a compile error, not an authorization bypass. Cost ≈32 one-line test call-site edits, spread over S2/S3. D5 `.run(req)` tests still prove the wrapper wiring |
| D5 | Test wrappers through `callable.run(req)`. `CallableFunction.run` exists in firebase-functions v5 (`lib/v2/providers/https.d.ts:157`) | Impl-only tests | A forgotten wire is the real risk, and Impl tests can't see it |
| D6 | `puedeVerSucursal` **excludes cajero** | The spec sentence that includes cajero | Including cajero would open `historicos`/`resumen` money to cajeros (A-10/I-9). The spec's own regression scenario requires cajero to be unchanged |
| D7 | Client scope lives in the `FirestoreAdminRepository` constructor. The `AdminRepository` interface is unchanged | Per-method params from screens | 11 test fakes stay untouched and screens barely change. Client scope is convenience; the rules are the real gate, so a default of `null` fails closed there (the query is denied, nothing leaks) |
| D8 | `esAdmin` = "may enter /admin": `admin`, or `admin_sucursal` with exactly 1 sucursal. The raw `rol` drives labels and the comparativo | New boolean flags | A malformed admin_sucursal falls back to the cajero UI (fail-closed) |
| D9 | The comparativo guard tests `rol === "admin_sucursal"` | `rol !== "admin"` | The protected `guardas.test.ts` literals have no `rol`, and the allowlist form would redirect them |
| D10 | Gerente-only affordances (sucursal create/edit, áreas CRUD, non-exclusive categoría actions) stay visible and fail server-side with the existing alert | Hiding them now | Keeps the budget. Optional S7 |

## Interfaces (`packages/functions/src/lib/exigir-admin.ts`, next to `exigirAdmin`)

```ts
/** null = Gerente (sin restricción); string = la única sucursal del admin_sucursal. */
export type AlcanceAdmin = string | null;
export function exigirAdminDeSucursal(req: CallableRequest): AlcanceAdmin;
export function exigirExclusivaDeSucursal(alcance: AlcanceAdmin, sucursales: unknown): void;
/** Anti-escalada: rol "cajero" y sucursales exactamente [alcance]. */
export function exigirCajeroDeAlcance(alcance: AlcanceAdmin, rol: unknown, sucursales: unknown): void;
/** Claims del objetivo (doc 09 §2); null → no-op sin leer. */
export async function exigirCajeroObjetivo(auth: Auth, alcance: AlcanceAdmin, uid: string): Promise<void>;
```

`exigirAdminOCajeroDeSesion` (`exigir-cajero-de-sesion.ts:56`) already admits admin_sucursal through claim membership. It needs a test only.

| Callable | Check placement |
|---|---|
| abrirSesion | wrapper: `exclusiva(alcance, [datos.sucursalId])` |
| cerrarSesion | Impl: right after the `exists` check, BEFORE the estado check, `verificarSincronizacion` and `CIERRE_BLOQUEADO` |
| crearCategoria | wrapper: `exclusiva(alcance, datos.sucursalesAsignadas)` |
| actualizarCategoria | wrapper: the same check on the input, plus Impl inside tx after `tx.get` on the stored value |
| desactivar/reactivarCategoria | Impl inside tx after `tx.get` |
| eliminarCategoria | Impl: when `alcance !== null`, pre-read + check BEFORE `count()` (the count message leaks usage) |
| crearCajero | wrapper: `exigirCajeroDeAlcance(alcance, datos.rol, datos.sucursalesAsignadas)` |
| actualizarCajero | wrapper: the input check + `await exigirCajeroObjetivo(getAuth(), alcance, datos.uid)` |
| desactivar/reactivar/eliminarCajero | wrapper: `await exigirCajeroObjetivo(...)`. This runs before every side effect and before eliminar's participaciones count |
| crearCategoriaEnSesion | unchanged (test only) |
| 7 áreas/sucursal callables | stay on `exigirAdmin` (Gerente-only) |

## Rules diff (`infra/firestore.rules`, mirrored in doc 09 §3)

```
function esAdminSucursal() { return autenticado() && request.auth.token.rol == 'admin_sucursal'
                               && request.auth.token.sucursales.size() == 1; }
function puedeVerSucursal(s) { return esAdmin() || (esAdminSucursal() && s in request.auth.token.sucursales); }
function veUsuario() { return esAdminSucursal()
                         && request.auth.token.sucursales[0] in resource.data.sucursalesAsignadas; }
usuarios   get:  autenticado() && (uid == miUid() || esAdmin() || veUsuario())
usuarios   list: esAdmin() || veUsuario()
historicos read: puedeVerSucursal(sucursalId)
resumen    read: puedeVerSucursal(sesion(sesionId).sucursalId)   // esAdmin() short-circuits the get()
auditoria  read: puedeVerSucursal(resource.data.sucursalId) || (esCajero() && tieneSucursal(resource.data.sucursalId))
```

Provable queries: the `usuarios` list must send `where("sucursalesAsignadas","array-contains", own)`, and `auditoria` must send `where("sucursalId","==", own)`. The Gerente's existing unfiltered queries keep passing through `esAdmin()`. RED test first: if the emulator can't prove `x in list` from `array-contains`, fall back to `resource.data.sucursalesAsignadas.hasAny(request.auth.token.sucursales)`.

## Client scope (`packages/data/src/firebase/firestore-admin-repository.ts`)

`constructor(db, functions, private readonly alcance: string | null = null)`:

| Method | admin_sucursal behavior | Index |
|---|---|---|
| observarSesionesAbiertas | `+ where("sucursalId","==",A)` | exists (sucursalId, estado, abiertaEn) |
| listarSesiones | forces `sucursalId = A` | exists |
| observarUsuarios | `array-contains A`, no `orderBy`, sorted by `nombre` in memory | none |
| observarSucursales | single doc listener `sucursales/A` | n/a |
| observarCategorias | in-memory filter: global or includes A | n/a |
| listarAuditoria | `+ where("sucursalId","==",A)`; a `sucursalId` filtro is dropped | index merging of the existing (campo, ocurridoEn) pairs |

Web wiring: `router.tsx` gains `PanelAdmin`. It runs its own `useAuthState`, returns `null` until resolved, then `useMemo(() => new FirestoreAdminRepository(db, functions, alcance), [alcance])` → `<AdminLayout rol>`. `AdminLayout` filters `DESTINOS` (no comparativo) and renders `<Outlet context={{ rol }} />`. `CajerosScreen` reads `useOutletContext()` and offers only "Cajero" to an admin_sucursal. `guardas.ts` gets `rol?: string` plus the redirect `/admin/comparativo` → `/admin`. One `etiquetaRol(rol)` (`apps/web/src/lib/etiqueta-rol.ts`) maps Gerente / Admin de sucursal / Cajero for `CuentaScreen.tsx:87`, `CajerosScreen.tsx:26,168` and `auditoria-helpers.ts:22,31,42`.

## Data Flow

    token{rol,sucursales} ─→ exigirAdminDeSucursal ─→ alcance ─→ [lookup] ─→ exclusiva? ─→ side effects
    token ─→ useAuthState{rol,esAdmin} ─→ PanelAdmin ─→ FirestoreAdminRepository(alcance) ─→ provable queries ─→ rules

## Testing Strategy

| Layer | What | How |
|---|---|---|
| Rules | usuarios get/list, historicos, resumen, auditoria: own/foreign pairs, >1-sucursal token, Gerente and cajero regressions | `infra/test/reglas.test.ts`, `npm run test:rules` |
| Unit | 4 helpers; `exigirAdminOCajeroDeSesion` admin_sucursal pair; schema cardinality | vitest |
| Integration | every scoped callable through `.run`: own passes, foreign/shared/global denied. Cerrar: no `CIERRE_BLOQUEADO` on a foreign sesión. Cajeros: no Auth/Firestore write on denial | functions emulator |
| Web | repo clauses (mocked SDK), useAuthState, nav filter, comparativo redirect (NEW file, `guardas.test.ts` untouched), labels | vitest from `apps/web/` |

## Threat Matrix

N/A: no shell, subprocess, VCS/PR automation, executable-file classification or process integration. The web route guard is a UI convenience; authorization lives in rules and callables.

## Migration / Rollout (auto-chain, each slice ≤400, green on `typecheck && lint && test`)

| # | Invariant | Files | Est. |
|---|---|---|---|
| S1 | Rules read scope | firestore.rules, reglas.test.ts, docs 09 §2 claims/§3/§4, 01 §2 roles + matrix, 13 ADR-27 | ~250 |
| S2 | Sesión gate | exigir-admin.ts (D1/D2) + tests, exigir-cajero-de-sesion.test, abrir/cerrar-sesion + tests, doc 08 §5 | ~230 |
| S3 | Exclusive categoría writes | 5 categoría callables + tests, doc 08 | ~215 |
| S4 | Cajero anti-escalation | usuario.ts RolUsuario, 2 schemas `.refine` + tests, 2 helpers + tests, 5 cajero callables + tests, doc 08 | ~285 |
| S5 | Scoped admin panel | useAuthState, guardas.ts, AdminLayout, router, admin repo + tests, doc 11 §2/§8 | ~280 |
| S6 | Labels + role option | etiqueta-rol.ts, CuentaScreen, CajerosScreen, auditoria-helpers + 3 assertion updates | ~90 |
| S7 (opt.) | Hide Gerente-only affordances | SucursalesAdmin/Catalogo/Categorias | ~100 |

Ordering: S1 must precede S5, because the client may only send scoped queries once the rule accepts them. S1 alone does not affect the Gerente. S2 precedes S3/S4 (helpers). `RolUsuario` widens in S4 together with the schemas; widening it earlier breaks the `CajerosScreen` payload types. S4 precedes S6. Every intermediate state fails closed: before S5, an admin_sucursal gets the cajero UI. Rollback = revert in reverse order. No migration.

## Open Questions

- [ ] Spec reconciliation: admin-sucursal's `puedeVerSucursal` sentence must drop cajero (D6). gestion-cajeros must say "target's custom claims", not "stored profile", for actualizar/desactivar/reactivar/eliminar (D3).
- [ ] Production check: auditoria index merging (the emulator doesn't validate indexes).
- [ ] Known ceilings: USUARIO_*/CATEGORIA_* audit events carry no `sucursalId`, so admin_sucursal can't see them. `observarSincronizacion` degrades (fail-closed) when a participant's profile is outside the sucursal (e.g. the Gerente counted in it).
- [ ] Doc 01/ADR-27 land in S1, ahead of S2–S4 code, inside the chain.
