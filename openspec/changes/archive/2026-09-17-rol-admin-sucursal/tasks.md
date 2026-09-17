# Tasks: Rol admin_sucursal (branch-scoped admin)

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~3,200 authored (14 mandatory slices) + ~100 optional (S7) |
| 400-line budget risk | Medium (per-slice; two slices land 300–380) |
| Chained PRs recommended | Yes |
| Suggested split | 15 sequential slices, S1 → S6 (S7 optional) — see table below |
| Delivery strategy | auto-chain |
| Chain strategy | stacked-to-main — every slice is independently mergeable and fails closed on its own (design's Migration/Rollout table guarantees this); no tracker branch is needed to hold partial work safe |

Decision needed before apply: No
Chained PRs recommended: Yes
Chain strategy: stacked-to-main
400-line budget risk: Medium

Design's own S4 estimate (~285) was flagged in validation as realistically 550–700; recounting against the actual callable/test files confirmed the same underestimation risk in S2, S3 and S5. All five were split below using real signals: existing call-site counts (`cerrarSesionImpl` × 11, categoría write Impls × 19 — the "~32 one-line edits" for D4's required `alcance` param), existing test-file line density, and one causal invariant per slice (RDD).

### Suggested Work Units

| # | Slice | Goal | Branch (base: previous slice's merge point on `main`) | Est. lines | Focused test command | Runtime harness | Rollback boundary |
|---|-------|------|---|---|---|---|---|
| 1 | S1 | Rules read scope | `feat/rol-admin-sucursal-reglas` | ~305 | `npm run test:rules` | Firestore emulator security rules (same as focused cmd) | `infra/firestore.rules` + `infra/test/reglas.test.ts` diff; revert leaves `esAdmin()`-only rules |
| 2 | S2a | `exigirAdminDeSucursal`/`exigirExclusivaDeSucursal` helpers + `abrirSesion` | `feat/rol-admin-sucursal-alcance-helpers` | ~250 | `(cd packages/functions && firebase emulators:exec --project demo-conteo-eficiente --only firestore,auth "vitest run test/lib/exigir-admin.test.ts test/callables/abrir-sesion.test.ts")` | Same (Firestore+Auth emulator) | `exigir-admin.ts` new exports + `abrir-sesion.ts` wrapper line; revert = `abrirSesion` back to `exigirAdmin` |
| 3 | S2b | `cerrarSesion` two-stage gate (D4) + `exigirAdminOCajeroDeSesion` regression test | `feat/rol-admin-sucursal-cierre-sesion` | ~200 | `(cd packages/functions && firebase emulators:exec --project demo-conteo-eficiente --only firestore,auth "vitest run test/callables/cerrar-sesion.test.ts test/lib/exigir-cajero-de-sesion.test.ts")` | Same | `cerrar-sesion.ts` Impl signature + wrapper; revert restores `exigirAdmin(req)` before the read |
| 4 | S3a | `crearCategoria` + `actualizarCategoria` exclusive-write gate | `feat/rol-admin-sucursal-categoria-crear-actualizar` | ~215 | `(cd packages/functions && firebase emulators:exec --project demo-conteo-eficiente --only firestore,auth "vitest run test/callables/crear-categoria.test.ts test/callables/actualizar-categoria.test.ts")` | Same | 2 callable files; revert = both back to unconditional `exigirAdmin` |
| 5 | S3b | `desactivar`/`reactivar`/`eliminarCategoria` exclusive-write gate (incl. pre-read-before-`count()` reorder) | `feat/rol-admin-sucursal-categoria-desactivar-eliminar` | ~320 | `(cd packages/functions && firebase emulators:exec --project demo-conteo-eficiente --only firestore,auth "vitest run test/callables/desactivar-categoria.test.ts test/callables/reactivar-categoria.test.ts test/callables/eliminar-categoria.test.ts")` | Same | 3 callable files; revert restores `exigirAdmin` and the original count-then-read order |
| 6 | S4-foundation | `RolUsuario` widen + `crearCajeroSchema`/`actualizarCajeroSchema` cardinality `.refine` + 2 new helpers (`exigirCajeroDeAlcance`, `exigirCajeroObjetivo`) | `feat/rol-admin-sucursal-cajero-contratos` | ~310 | `(cd contracts && npx vitest run schemas/crear-cajero.schema.test.ts schemas/actualizar-cajero.schema.test.ts)` + `(cd packages/functions && firebase emulators:exec --project demo-conteo-eficiente --only firestore,auth "vitest run test/lib/exigir-admin.test.ts")` | Firestore+Auth emulator (helper #2 reads Auth claims) | Additive type/schema/helper only, unused until S4-crear+; revert is a no-op for running callables |
| 7 | S4-crear | `crearCajero` anti-escalation wiring | `feat/rol-admin-sucursal-crear-cajero` | ~180 | `(cd packages/functions && firebase emulators:exec --project demo-conteo-eficiente --only firestore,auth "vitest run test/callables/crear-cajero.test.ts")` | Same | `crear-cajero.ts` wrapper line; revert to `exigirAdmin` |
| 8 | S4-actualizar | `actualizarCajero` anti-escalation + target-claim wiring | `feat/rol-admin-sucursal-actualizar-cajero` | ~220 | `(cd packages/functions && firebase emulators:exec --project demo-conteo-eficiente --only firestore,auth "vitest run test/callables/actualizar-cajero.test.ts")` | Same | `actualizar-cajero.ts` wrapper lines; revert to `exigirAdmin` |
| 9 | S4-desactivar-reactivar | `desactivarCajero` + `reactivarCajero` target-claim wiring | `feat/rol-admin-sucursal-desactivar-reactivar-cajero` | ~280 | `(cd packages/functions && firebase emulators:exec --project demo-conteo-eficiente --only firestore,auth "vitest run test/callables/desactivar-cajero.test.ts test/callables/reactivar-cajero.test.ts")` | Same | 2 callable wrapper lines; revert to `exigirAdmin` |
| 10 | S4-eliminar | `eliminarCajero` target-claim wiring, decided before participaciones count / any side effect | `feat/rol-admin-sucursal-eliminar-cajero` | ~220 | `(cd packages/functions && firebase emulators:exec --project demo-conteo-eficiente --only firestore,auth "vitest run test/callables/eliminar-cajero.test.ts")` | Same | `eliminar-cajero.ts` wrapper line; revert to `exigirAdmin`, orphan-path stays Gerente-only either way |
| 11 | S5a | `useAuthState` raw `rol` + `guardas.ts` `/admin/comparativo` redirect | `feat/rol-admin-sucursal-auth-state-guarda` | ~200 | `(cd apps/web && npx vitest run src/state/useAuthState.test.ts src/lib/guardas-comparativo.test.ts)` | N/A — web layer is mocked-SDK per design's testing strategy; real authorization is already proven by S1–S4 | `useAuthState.ts` field + new `guardas-comparativo.test.ts` (guardas.ts itself gets one redirect branch); `guardas.test.ts` untouched |
| 12 | S5b | `FirestoreAdminRepository` scope constructor + 6 scoped methods | `feat/rol-admin-sucursal-repo-admin` | ~180 | `(cd packages/data && npx vitest run src/firebase/firestore-admin-repository.test.ts)` | N/A — mocked Firebase SDK per design | Constructor param + 6 method bodies; default `alcance = null` keeps Gerente behavior, so reverting the param is a type-only rollback |
| 13 | S5c | `AdminLayout` scope filter + `router.tsx` `PanelAdmin` wiring + `CajerosScreen` rol-option restriction | `feat/rol-admin-sucursal-panel-admin` | ~200 | `(cd apps/web && npx vitest run src/ui/admin/AdminLayout.test.tsx src/ui/admin/CajerosScreen.test.tsx)` | N/A — mocked SDK; manual PWA smoke check recommended, not automated in this slice | `AdminLayout.tsx`, `router.tsx`, `CajerosScreen.tsx` option list; revert = admin_sucursal falls back to full nav (still denied server-side) |
| 14 | S6 | Labels (`etiqueta-rol.ts`) + `CuentaScreen`/`CajerosScreen`/`auditoria-helpers` wiring | `feat/rol-admin-sucursal-etiquetas` | ~120 | `(cd apps/web && npx vitest run src/lib/etiqueta-rol.test.ts src/ui/CuentaScreen.test.tsx)` | N/A — presentational only | New `etiqueta-rol.ts` + 3 call sites; revert is cosmetic only |
| 15 (opt.) | S7 | Hide Gerente-only affordances for admin_sucursal (`SucursalesAdmin`/`Catalogo`/`Categorias`) | `feat/rol-admin-sucursal-ocultar-gerente` | ~100 | `(cd apps/web && npx vitest run src/ui/admin/SucursalesAdminScreen.test.tsx src/ui/admin/CatalogoScreen.test.tsx src/ui/admin/CategoriasScreen.test.tsx)` | N/A — presentational; server-side alert already blocks the action per D10 | UI-only hide; revert restores the visible-but-blocked affordance |

Ordering is sequential per design's Migration/Rollout table: S1 before S5* (client can't send scoped queries until rules accept them); S2a before S2b/S3*/S4-foundation (shared `exigir-admin.ts`); S4-foundation before every S4-* callable slice (helpers + widened `RolUsuario`); S4-eliminar before S6 (label option list depends on the widened enum already compiling everywhere). `S7` is optional and out of the mandatory chain (D10).

## Phase 1: Rules read scope

- [x] 1.1 **S1** — `puedeVerSucursal`/`veUsuario` rules + provable-query docs
  - Invariant: `historicos`, `resumen`, `auditoria` and `usuarios` reads for `admin_sucursal` are allowed only when the resource's `sucursalId`/`sucursalesAsignadas` matches the caller's single-sucursal claim, exactly mirroring `esAdmin()` for `admin` and leaving `cajero` untouched (D6).
  - Files: `infra/firestore.rules`, `infra/test/reglas.test.ts`, `docs/diseno/09-seguridad-y-auditoria.md` (§2 claims, §3 rules), `docs/diseno/01-requisitos-y-alcance.md` (roles + matrix), `docs/diseno/13-decisiones-adr.md` (new ADR-27), `docs/diseno/03-modelo-de-dominio.md` (rol enum).
  - RED tests first (`infra/test/reglas.test.ts`): unfiltered `usuarios` list denied for `admin_sucursal` (highest-leak scenario, write this one first); filtered list on own sucursal succeeds; get own-sucursal usuario succeeds / foreign-only usuario denied; `historicos`/`resumen` own-sucursal affirmative + foreign negative; `auditoria` own-sucursal affirmative + foreign negative; Gerente and cajero regressions unchanged for all four collections.
  - Closing: `npm run typecheck && npm run lint && npm test && npm run test:rules`.
  - Commit(s): `feat(reglas): agregar puedeVerSucursal y alcance de admin_sucursal`, `docs(diseno): documentar rol admin_sucursal (01, 09, ADR-27, 03)`.

## Phase 2: Sesión gate

- [x] 2.1 **S2a** — `exigirAdminDeSucursal`/`exigirExclusivaDeSucursal` + `abrirSesion`
  - Invariant: a 0- or 2+-sucursal `admin_sucursal` token is rejected before any resource read, and a well-formed one may only `abrirSesion` for its own sucursal.
  - Files: `packages/functions/src/lib/exigir-admin.ts` (D1/D2), `packages/functions/test/lib/exigir-admin.test.ts`, `packages/functions/src/callables/abrir-sesion.ts`, `packages/functions/test/callables/abrir-sesion.test.ts`.
  - RED tests: `exigirAdminDeSucursal` throws on `[]`/2-sucursal claims, returns `null` for admin, returns the sucursal for a valid claim; `exigirExclusivaDeSucursal` passes on exact match, throws on `undefined`/mismatch; `abrirSesion` own-sucursal affirmative / foreign negative / malformed-claim negative / Gerente regression.
  - Closing: `npm run typecheck && npm run lint && npm test`.
  - Commit(s): `feat(functions): agregar exigirAdminDeSucursal y exigirExclusivaDeSucursal`, `feat(functions): acotar abrirSesion a la sucursal del admin_sucursal`.

- [x] 2.2 **S2b** — `cerrarSesion` two-stage gate
  - Invariant: the sucursal gate runs after the sesión read but strictly before RF-16's sync check, the `CIERRE_BLOQUEADO` audit write, and the freeze transaction — a foreign-sucursal caller produces zero side effects.
  - Files: `packages/functions/src/callables/cerrar-sesion.ts` (Impl gains required trailing `alcance: AlcanceAdmin`), `packages/functions/test/callables/cerrar-sesion.test.ts` (11 existing call sites pass `null`), `packages/functions/src/lib/exigir-cajero-de-sesion.ts` test-only regression, `docs/diseno/08-contratos-y-cloud-functions.md` (§5).
  - RED tests: own-sucursal affirmative; foreign-sucursal negative with `sinConfirmar` non-empty proving no `CIERRE_BLOQUEADO` audit write and RF-16 never ran; malformed-claim negative before any read; Gerente regression; `exigirAdminOCajeroDeSesion` admin_sucursal-membership pair (new coverage only, no code change).
  - Closing: `npm run typecheck && npm run lint && npm test`.
  - Commit(s): `feat(functions): agregar alcance requerido a cerrarSesionImpl (D4)`, `test(functions): cubrir admin_sucursal en exigirAdminOCajeroDeSesion`.

## Phase 3: Categoría exclusive writes

- [x] 3.1 **S3a** — `crearCategoria` + `actualizarCategoria`
  - Invariant: `admin_sucursal` may create or update only a categoría whose `sucursalesAsignadas` is exactly `[ownSucursal]`; global/shared input or stored state is rejected unchanged.
  - Files: `packages/functions/src/callables/crear-categoria.ts`, `actualizar-categoria.ts` (Impl gains required `alcance`), both `.test.ts` (5 existing call sites in `actualizar-categoria.test.ts`), `docs/diseno/08-contratos-y-cloud-functions.md`.
  - RED tests: create with `sucursalesAsignadas` omitted/multi rejected; create exactly `[own]` affirmative; update exclusively-owned affirmative; update global/shared rejected unchanged; Gerente regression on both.
  - Closing: `npm run typecheck && npm run lint && npm test`.
  - Commit(s): `feat(functions): acotar crearCategoria y actualizarCategoria a la sucursal exclusiva`.

- [x] 3.2 **S3b** — `desactivarCategoria` + `reactivarCategoria` + `eliminarCategoria`
  - Invariant: same exclusive-ownership rule as S3a for the two toggle callables; `eliminarCategoria` additionally moves its ownership check before `count()` so a denied caller never learns usage counts.
  - Files: the 3 callables (Impl gains required `alcance`; `eliminar-categoria.ts` also reorders pre-read before `count()`), their `.test.ts` (4+6+4 existing call sites), `docs/diseno/08-contratos-y-cloud-functions.md`.
  - RED tests: exclusively-owned affirmative / global+shared rejected for each of the 3; `eliminarCategoria` foreign-sucursal caller gets `permission-denied` with no usage count read; Gerente regression on all 3.
  - Closing: `npm run typecheck && npm run lint && npm test`.
  - Commit(s): `feat(functions): acotar desactivar/reactivar/eliminarCategoria a la sucursal exclusiva`.

## Phase 4: Cajero anti-escalation

- [x] 4.1 **S4-foundation** — contracts + helpers
  - Invariant: `admin_sucursal` cardinality (exactly 1 sucursal) is enforced at the schema layer wherever `rol`+`sucursalesAsignadas` travel together, and the two new helpers give every cajero callable one shared anti-escalation/target-claim check.
  - Files: `packages/shared/src/models/usuario.ts` (`RolUsuario` widen), `contracts/schemas/crear-cajero.schema.ts` + `.test.ts`, `actualizar-cajero.schema.ts` + `.test.ts`, `packages/functions/src/lib/exigir-admin.ts` (`exigirCajeroDeAlcance`, `exigirCajeroObjetivo`), `packages/functions/test/lib/exigir-admin.test.ts`, `docs/diseno/03-modelo-de-dominio.md` (rol enum).
  - RED tests: schema cardinality pass/fail for both schemas (admin_sucursal + 1 vs 0/2 sucursales); `exigirCajeroDeAlcance` rejects non-`cajero` rol / foreign or extra sucursal, passes on exact match, no-ops for Gerente (`null`); `exigirCajeroObjetivo` no-ops on `null` without reading Auth, rejects target rol ≠ cajero or sucursales ≠ `[own]`, passes on match.
  - Closing: `npm run typecheck && npm run lint && npm test`.
  - Commit(s): `feat(shared): ampliar RolUsuario con admin_sucursal`, `feat(contracts): validar cardinalidad de sucursal para admin_sucursal`, `feat(functions): agregar exigirCajeroDeAlcance y exigirCajeroObjetivo`.

- [x] 4.2 **S4-crear** — `crearCajero`
  - Invariant: `admin_sucursal` may create only a `cajero` assigned exactly to its own sucursal; any other `rol` or sucursal set is denied before any Auth/Firestore write.
  - Files: `packages/functions/src/callables/crear-cajero.ts`, `packages/functions/test/callables/crear-cajero.test.ts`.
  - RED tests: own-sucursal `cajero` affirmative; escalation (`rol: "admin"`/`"admin_sucursal"`) rejected pre-write; foreign/extra sucursal rejected pre-write; malformed claim rejected; Gerente regression.
  - Closing: `npm run typecheck && npm run lint && npm test`.
  - Commit(s): `feat(functions): acotar crearCajero al alcance de admin_sucursal`.

- [x] 4.3 **S4-actualizar** — `actualizarCajero`
  - Invariant: same input-level anti-escalation as S4-crear, plus the target's CURRENT Auth claims must show `cajero` assigned exactly to the caller's sucursal.
  - Files: `packages/functions/src/callables/actualizar-cajero.ts`, `packages/functions/test/callables/actualizar-cajero.test.ts`.
  - RED tests: own-sucursal target affirmative; input escalation rejected; shared-sucursal target rejected unchanged; foreign target rejected; malformed claim rejected; Gerente regression.
  - Closing: `npm run typecheck && npm run lint && npm test`.
  - Commit(s): `feat(functions): acotar actualizarCajero al alcance de admin_sucursal`.

- [x] 4.4 **S4-desactivar-reactivar** — `desactivarCajero` + `reactivarCajero`
  - Invariant: both decide on the target's current Auth claims before any write/`auth.updateUser` call; a shared, foreign, or admin/admin_sucursal target is out of reach.
  - Files: both callables, both `.test.ts`.
  - RED tests (per callable): own-sucursal target affirmative; shared-sucursal rejected, no write; escalation target (`admin`/`admin_sucursal`) rejected, no side effect; foreign target rejected; malformed claim rejected; Gerente regression.
  - Closing: `npm run typecheck && npm run lint && npm test`.
  - Commit(s): `feat(functions): acotar desactivarCajero y reactivarCajero al alcance de admin_sucursal`.

- [x] 4.5 **S4-eliminar** — `eliminarCajero`
  - Invariant: the authorization decision (on target Auth claims) completes before the participaciones count, `auth.deleteUser`, and the Firestore delete transaction; the orphan-profile fallback path stays Gerente-only.
  - Files: `packages/functions/src/callables/eliminar-cajero.ts`, `packages/functions/test/callables/eliminar-cajero.test.ts`.
  - RED tests: own-sucursal target affirmative; shared-sucursal rejected before any deletion; escalation target rejected before any side effect; foreign target rejected; Gerente regression (existing business guards untouched).
  - Closing: `npm run typecheck && npm run lint && npm test`.
  - Commit(s): `feat(functions): acotar eliminarCajero al alcance de admin_sucursal, decidido antes de cualquier efecto`.

## Phase 5: Scoped admin panel

- [x] 5.1 **S5a** — auth state + comparativo guard
  - Invariant: raw `rol` drives `/admin/comparativo` access (`rol === "admin_sucursal"` redirects, D9); `guardas.test.ts` stays untouched.
  - Files: `apps/web/src/state/useAuthState.ts` + `.test.ts`, `apps/web/src/lib/guardas.ts` (new redirect branch only), NEW `apps/web/src/lib/guardas-comparativo.test.ts`.
  - RED tests: admin_sucursal navigating `/admin/comparativo` redirected + nav has no link; Gerente unaffected (renders, link present).
  - Closing: `npm run typecheck && npm run lint && npm test` (run `cd apps/web && npx vitest run` if root vitest doesn't resolve the jsdom environment for these files).
  - Commit(s): `feat(web): exponer rol crudo en useAuthState`, `feat(web): bloquear /admin/comparativo para admin_sucursal`.

- [x] 5.2 **S5b** — `FirestoreAdminRepository` scope
  - Invariant: every method sends a provably-scoped query (`where` clause matching the rules in S1) when constructed with a non-null `alcance`, and is unchanged (`null`) for Gerente.
  - Files: `packages/data/src/firebase/firestore-admin-repository.ts` + its test file.
  - RED tests: one pair (scoped query shape / unscoped Gerente query shape) per method — `observarSesionesAbiertas`, `listarSesiones`, `observarUsuarios`, `observarSucursales`, `observarCategorias`, `listarAuditoria`.
  - Closing: `npm run typecheck && npm run lint && npm test`.
  - Commit(s): `feat(data): acotar FirestoreAdminRepository a la sucursal del admin_sucursal`.

- [x] 5.3 **S5c** — `AdminLayout` + router + `CajerosScreen` rol option
  - Invariant: an admin_sucursal never sees the comparativo nav entry or a rol-assignment option beyond "Cajero"; router only mounts `FirestoreAdminRepository` once `useAuthState` resolves.
  - Files: `apps/web/src/ui/admin/AdminLayout.tsx` + `.test.tsx`, `apps/web/src/lib/router.tsx`, `apps/web/src/ui/admin/CajerosScreen.tsx` + `.test.tsx`, `docs/diseno/11-ux-y-navegacion.md` (§2/§8).
  - RED tests: `AdminLayout` filters `DESTINOS` for admin_sucursal / keeps full list for Gerente; `CajerosScreen` offers only "Cajero" via `useOutletContext` for admin_sucursal.
  - Closing: `npm run typecheck && npm run lint && npm test`.
  - Commit(s): `feat(web): agregar PanelAdmin acotado y filtrar nav para admin_sucursal`.

## Phase 6: Labels + role option

- [x] 6.1 **S6** — `etiqueta-rol.ts` + call sites
  - Invariant: `rol` renders as "Gerente"/"Admin de sucursal"/"Cajero" everywhere it's shown, without mutating the stored/claim value.
  - Files: NEW `apps/web/src/lib/etiqueta-rol.ts` + `.test.ts`, `apps/web/src/ui/CuentaScreen.tsx:87`, `apps/web/src/ui/admin/CajerosScreen.tsx:26,168`, `apps/web/src/lib/auditoria-helpers.ts:22,31,42` (3 assertion updates).
  - RED tests: each of the 3 rol values maps to its label (table-driven).
  - Closing: `npm run typecheck && npm run lint && npm test`.
  - Commit(s): `feat(web): agregar etiquetaRol y aplicarla en cuenta, cajeros y auditoria`.

## Phase 7 (optional): Hide Gerente-only affordances

- [ ] 7.1 **S7** — hide sucursal/áreas/non-exclusive categoría actions for admin_sucursal in `SucursalesAdminScreen`, `CatalogoScreen`, `CategoriasScreen`. Not required for MVP (D10); server-side alert already blocks the action if skipped.
  - Closing: `npm run typecheck && npm run lint && npm test`.
  - Commit(s): `feat(web): ocultar acciones exclusivas de Gerente para admin_sucursal`.
