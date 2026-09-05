# Tasks — migracion-firebase-a-supabase

Phase: `sdd-tasks` · Store: `hybrid` · Engram: `sdd/migracion-firebase-a-supabase/tasks`
Depends on: `proposal.md`, `specs/*/spec.md` (10 files), `design.md` (D-1..D-9).

> **Size note.** Exceeds the skill's 530-word default. The launch prompt requires a
> named RED test (or an explicit `#33`-blocked reason) per unit, a per-slice
> 400-line forecast across a change whose own deletion floor is ~3050 lines
> (`packages/functions` 1292, `infra/firestore.rules`+test 503,
> `packages/data/src/firebase` 853, `contracts/schemas` ~400), and explicit
> `feature-branch-chain` boundaries for ~20 slices. Explicitly requested detail is
> not debt (`design.md`'s own precedent).

> **Scope discipline.** Every unit below cites the spec requirement or design
> decision it implements. Nothing here scaffolds "for later" — 3 sucursales,
> ~6 sesiones/month; no abstraction is added beyond what `design.md` already chose.

> **`#33` gate (binding).** `esquema-postgres`, `autorizacion-supabase`,
> `operaciones-servidor`'s RLS/RPC/trigger/`pg_cron` units, and the Edge Function's
> Deno-test path have **no closeable RED test** — #33 (OPEN) has not picked pgTAP vs.
> local-Postgres integration (D-9), and no `supabase/**` entry exists in
> `openspec/config.yaml testing.commands`. Every such unit below is marked
> **`RED: blocked on #33`** — authoring proceeds, strict-TDD closure does not.
> `packages/shared`, `packages/data`, `apps/web`, `contracts` units are NOT blocked —
> they run under existing `vitest` commands.

---

## Review Workload Forecast

| Field                   | Value                                                                       |
| ----------------------- | --------------------------------------------------------------------------- |
| Estimated changed lines | ≈6,800 total (additions+deletions across 20 slices; see per-slice table)    |
| 400-line budget risk    | High — 8 of 20 slices are at/over 400 (deletion floor is 3,050 lines alone) |
| Chained PRs recommended | Yes                                                                         |
| Suggested split         | Tracker → PR1 → PR2 → … → PR20 (linear feature-branch-chain, see below)     |
| Delivery strategy       | auto-chain                                                                  |
| Chain strategy          | feature-branch-chain (user-decided)                                         |

```text
Decision needed before apply: No
Chained PRs recommended: Yes
Chain strategy: feature-branch-chain
400-line budget risk: High
```

`Decision needed before apply: No` — `auto-chain` + cached `feature-branch-chain`
means `sdd-apply` proceeds slice-by-slice without re-asking.

### Suggested Work Units (chain order — each PR targets the immediately-previous branch; PR1 targets the tracker; only the tracker merges to `main`)

| #   | PR    | Goal                                                                                                                                                  | Est. lines                                          | Focused test command                                                                | Runtime harness                                                                      | Rollback boundary                                                                                                                                                                 |
| --- | ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | PR1   | `supabase/migrations`: 10 tables, indexes, CHECKs                                                                                                     | ~220                                                | N/A — RED: blocked on #33                                                           | N/A, reason: no `supabase/**` test command exists yet (#33)                          | Drop the migration file; nothing depends on it yet                                                                                                                                |
| 2   | PR2   | `private.*` helpers + default-deny + RLS                                                                                                              | ~280                                                | N/A — RED: blocked on #33                                                           | N/A, reason: same                                                                    | Drop the migration file; RLS additive over PR1's tables                                                                                                                           |
| 3   | PR3   | `lineas` trigger, audit trigger, `sincronizado` column, views, realtime publication                                                                   | ~180                                                | N/A — RED: blocked on #33                                                           | N/A, reason: same                                                                    | Drop the migration file                                                                                                                                                           |
| 4   | PR4   | RPCs (`abrir_sesion`,`cerrar_sesion`,`actualizar_cajero`) + `pg_cron` purge                                                                           | ~200                                                | N/A — RED: blocked on #33                                                           | N/A, reason: same                                                                    | Drop the migration file                                                                                                                                                           |
| 5   | PR5   | Edge Function `gestion-cajeros` (3 ops)                                                                                                               | ~260                                                | N/A — RED: blocked on #33/#30 (no Deno test command in config.yaml)                 | N/A, reason: same                                                                    | Delete `supabase/functions/gestion-cajeros/`                                                                                                                                      |
| 6   | PR6   | `packages/shared` carve-out A (`contadaPorMi`,`pendiente`,`progreso.ts`,`sincronizacion.ts`)                                                          | ~200                                                | `cd packages/shared && npm test`                                                    | Same vitest run                                                                      | Revert removes the 2 model field renames + 2 service rewrites; no other package depends on the new shape yet                                                                      |
| 7   | PR7   | `packages/data/src/supabase`: queue + mappers + `SupabaseConteoRepository`                                                                            | ~420 (High — mechanical file-level split available) | `cd packages/data && npm test`                                                      | Same vitest run (`vi.mock` supabase-js)                                              | Delete `packages/data/src/supabase/{queue,mappers,supabase-conteo-repository}.ts` + tests; `packages/data/src/firebase/**` still active, nothing else imports the new adapter yet |
| 8   | PR8   | `packages/data/src/supabase/supabase-admin-repository.ts`                                                                                             | ~400 (High)                                         | `cd packages/data && npm test`                                                      | Same vitest run                                                                      | Delete the file + test; unused by `apps/web` until PR9                                                                                                                            |
| 9   | PR9   | `apps/web/src/{lib,state}`: client init, `version-minima.ts`, `useAuthState.ts`, `router.tsx`, `useVersionMinima.ts` rewire                           | ~230                                                | `cd apps/web && npm test`                                                           | Same vitest run                                                                      | Revert restores Firebase client wiring; `packages/data/src/firebase` adapters still present until Phase 6                                                                         |
| 10  | PR10  | `apps/web/src/ui/admin` error-shape mapping (3 screens) + type-only import (1 file)                                                                   | ~160                                                | `cd apps/web && npm test`                                                           | Same vitest run                                                                      | Revert restores `FirebaseError` branching                                                                                                                                         |
| 11  | PR11  | ESLint SDK fence (D-8) + `AGENTS.md`/`config.yaml` doc correction + `tools/seed.ts` Supabase-admin swap                                               | ~90                                                 | `npm run lint` (root)                                                               | N/A — `tools` has no test script (config.yaml)                                       | Revert the `eslint.config.js` block + doc lines + `seed.ts`                                                                                                                       |
| 12a | PR12a | Delete `packages/data/src/firebase/{firestore-conteo-repository,dispositivo}.ts`+tests, `apps/web/src/lib/persistencia-monitor.ts`+canary             | ~500 (High)                                         | `cd packages/data && npm test`; `cd apps/web && npm test`                           | Full vitest suites green post-deletion                                               | Restore from git history; PR7/PR9 already provide the replacement                                                                                                                 |
| 12b | PR12b | Delete `packages/data/src/firebase/{firestore-admin-repository,mappers}.ts`+tests                                                                     | ~430 (High)                                         | `cd packages/data && npm test`                                                      | Same                                                                                 | Restore from git history; PR8 provides the replacement                                                                                                                            |
| 13  | PR13  | Delete 7 of 9 `contracts/schemas/*` (+tests) — keep `crear-cajero`,`desactivar-cajero`                                                                | ~400                                                | `cd contracts && npm test`                                                          | Same                                                                                 | Restore from git history; PR4/PR5 already validate via RPC params/CHECK                                                                                                           |
| 14a | PR14a | Delete `infra/test/reglas.test.ts` (359 lines, 29 `it()`)                                                                                             | 359                                                 | N/A                                                                                 | `npm run test:rules` run as baseline **before** this unit (rules file still present) | Restore from git history; PR2's RLS is the superseding surface                                                                                                                    |
| 14b | PR14b | Delete `infra/firestore.rules` (144 lines)                                                                                                            | 144                                                 | N/A — no rules file left to test                                                    | `npm run test:rules` is moot after 14a; do not re-run                                | Restore from git history                                                                                                                                                          |
| 15  | PR15  | Delete `packages/functions` session-flow callables (`abrir-sesion`,`cerrar-sesion`,`triggers/on-aporte-escrito`)+3 tests                              | ~500 (High)                                         | N/A (package being removed)                                                         | N/A                                                                                  | Restore from git history; PR1-PR4 provide the Postgres equivalents                                                                                                                |
| 16  | PR16  | Delete `packages/functions` cajero-mgmt callables (`crear-cajero`,`actualizar-cajero`,`desactivar-cajero`,`reactivar-cajero`)+4 tests                 | ~500 (High)                                         | N/A                                                                                 | N/A                                                                                  | Restore; PR5/PR4 equivalents exist                                                                                                                                                |
| 17  | PR17  | Delete `packages/functions` catálogo callables (`crear-sucursal`,`actualizar-sucursal`,`crear-categoria`,`desactivar-categoria`)+4 tests              | ~350                                                | N/A                                                                                 | N/A                                                                                  | Restore; direct PostgREST+RLS (PR2) equivalent exists                                                                                                                             |
| 18  | PR18  | Delete `packages/functions` scheduled+lib (`recalcular-resumenes`,`reconciliar-lineas`,`purgar-auditoria`,`lib/resumen`,`lib/sincronizacion`)+5 tests | ~450 (High)                                         | N/A                                                                                 | N/A                                                                                  | Restore; PR3 (views/trigger) + PR4 (`pg_cron`) equivalents exist                                                                                                                  |
| 19  | PR19  | Delete `packages/functions` remainder (`lib/exigir-admin`,`lib/validar`,`lib/auditoria`,`index.ts`)+2 misc tests+package config+workspace removal     | ~500 (High)                                         | `npm run test --workspaces --if-present` (root, confirms no dangling workspace ref) | Root test suite                                                                      | Restore; final removal, nothing left importing it                                                                                                                                 |
| 20  | PR20  | `docs/diseno/09-seguridad-y-auditoria.md` §2/§3 correction                                                                                            | ~40                                                 | N/A (docs)                                                                          | Manual read-through                                                                  | Revert the 3 line ranges                                                                                                                                                          |

**Total ≈ 6,800 lines.** Slices flagged **High** are mechanical (deletions or
`vi.mock`-pattern adapters) and can be split further file-by-file at `sdd-apply`
time without changing this plan's boundaries if a reviewer wants strict `<400`.

```
tracker/migracion-firebase-a-supabase (draft, no-merge until all children land)
  └─ PR1 (schema) 📍 → PR2 (auth) → PR3 (triggers/views) → PR4 (RPCs/cron)
       → PR5 (edge fn) → PR6 (shared) → PR7 (conteo adapter) → PR8 (admin adapter)
       → PR9 (web core) → PR10 (web admin) → PR11 (seam/tooling)
       → PR12a → PR12b (data/firebase) → PR13 (contracts) → PR14a → PR14b (rules)
       → PR15 → PR16 → PR17 → PR18 → PR19 (packages/functions)
       → PR20 (docs)
main ← tracker merges once (only merge into main)
```

---

## Phase 1: Postgres Schema & Authorization Foundation (PR1–PR4)

- [ ] 1.1 PR1 — `supabase/migrations/0001_schema.sql`: 10 tables (`perfiles`, `perfil_sucursales`, `sucursales`, `categorias`, `sesiones`, `lineas`, `aportes`, `sesion_participantes`, `auditoria`, `config`), partial unique index `sesiones(sucursal_id) WHERE estado='abierta'`, `auditoria(ocurrido_en desc)`, all CHECKs (`esquema-postgres` D-3, I-1, I-7, A-7). **RED: blocked on #33.**
- [ ] 1.2 Pre-close: `npm run typecheck && npm run lint` (SQL has no vitest target); manual `supabase db reset` smoke.
- [ ] 1.3 Commit (`feat(supabase): crea esquema de 10 tablas con índice parcial de sesión abierta`).
- [ ] 1.4 PR2 — `supabase/migrations/0002_auth_rls.sql`: `private.es_admin()`, `private.tiene_sucursal()`, `private.puede_ver_sesion()`, `private.sesion_abierta()` (`SECURITY DEFINER`, `search_path=''`); `revoke all` + `alter default privileges`; `enable row level security` on every `public` table; per-table `GRANT`+RLS per D-5's table (`autorizacion-supabase` Req. "GRANT decides the verb"); `pg_class.relrowsecurity` assertion (D-5 piece 3). **RED: blocked on #33.**
- [ ] 1.5 Commit (`feat(supabase): agrega helpers privados y RLS por defecto-deniega`).
- [ ] 1.6 PR3 — `supabase/migrations/0003_triggers_views.sql`: `AFTER INSERT OR UPDATE ON aportes` re-aggregate trigger (D-1); generic `private.auditar()` + 5 `create trigger` (D-6); `sesion_participantes.sincronizado` generated column (`cierre-sesion` delta); `vista_resumen`/`vista_historicos` (`security_invoker=true` + `WHERE private.es_admin()`, D-5 monetary views; `resumen-sesion` delta); `alter publication supabase_realtime add table lineas, sesiones, sesion_participantes, perfiles, sucursales, categorias, aportes` (`esquema-postgres` Req. "Realtime publication includes only UI-observed tables"). **RED: blocked on #33.**
- [ ] 1.7 Commit (`feat(supabase): trigger de reagregación, auditoría genérica, vistas monetarias y publicación realtime`).
- [ ] 1.8 PR4 — `supabase/migrations/0004_rpcs_cron.sql`: `abrir_sesion` (seed `lineas` in the same tx, no compensation, D-6/D-4 `operaciones-servidor`); `cerrar_sesion` (`private.es_admin()` gate, `sinConfirmar` from `sincronizado`, block/`forzar` per `cierre-sesion` delta, single-statement close, no snapshot write); `actualizar_cajero` (4 required params, no revocation, `gestion-cajeros` delta); `pg_cron` purge job (`delete from auditoria where ocurrido_en < now() - interval '12 months'`, `operaciones-servidor` Req. "purgarAuditoria"). **RED: blocked on #33.**
- [ ] 1.9 Pre-close: `npm run typecheck && npm run lint`.
- [ ] 1.10 Commit (`feat(supabase): agrega RPCs abrir_sesion, cerrar_sesion, actualizar_cajero y purga programada`).

## Phase 2: Server Operations (PR5)

- [ ] 2.1 PR5 — `supabase/functions/gestion-cajeros/index.ts`: own-row `select rol from perfiles where id = auth.uid()` gate before any `service_role` use (`operaciones-servidor` Req. "verifies the caller's role via their own row"); 3 ops (`crearCajero`→`auth.admin.createUser`+2 inserts, no claims; `desactivarCajero`→ban-then-`activo:false` order; `reactivarCajero`→reverse); each op's table writes go through `rpc('registrar_cajero'|'desactivar_cajero'|'reactivar_cajero')` on the caller's connection, never `service_role` (D-6, so `auth.uid()` in the audit trigger is the admin, not null); compensation `auth.admin.deleteUser` on post-create failure (`gestion-cajeros` ADDED "reactivarCajero", MODIFIED "crearCajero"). **RED: blocked on #33/#30** (no `supabase/functions` test command in `config.yaml`; Deno-test path is plausible per D-9 but untooled).
- [ ] 2.2 Companion RPCs `registrar_cajero`/`desactivar_cajero`/`reactivar_cajero` (`SECURITY DEFINER`, table writes only) land in this same migration file, `supabase/migrations/0005_gestion_cajeros_rpcs.sql`.
- [ ] 2.3 Pre-close: `npm run typecheck && npm run lint`.
- [ ] 2.4 Commit (`feat(supabase): edge function gestion-cajeros con verificación de rol propio y compensación`).

## Phase 3: Domain & Client Adapters (PR6–PR8)

- [ ] 3.1 PR6 — RED: `packages/shared/src/services/progreso.test.ts` — rewrite for `estaPendiente(linea: LineaConteo)` (uid param dropped): asserts `contadaPorMi:false → true` (pending) and `contadaPorMi:true → false`; fails first against the current `versiones[uid]`-keyed signature (`esquema-postgres` Req. "Per-participant pending signal survives", D-2).
- [ ] 3.2 GREEN: rewrite `packages/shared/src/services/progreso.ts` + `siguientePendiente` to use `contadaPorMi` (D-2).
- [ ] 3.3 RED: `packages/shared/src/services/sincronizacion.test.ts` — rewrite for `aporteConfirmado(aporte: Aporte | null)`: asserts `pendiente:false → true`, `null → false`, `pendiente:true → false`; fails first against the `version`-comparison signature.
- [ ] 3.4 GREEN: rewrite `packages/shared/src/services/sincronizacion.ts` (D-2).
- [ ] 3.5 Modify `packages/shared/src/models/linea-conteo.ts` (`versiones`→`contadaPorMi: boolean`) and `packages/shared/src/models/aporte.ts` (`version`→`pendiente: boolean`) — trivial field renames, covered by 3.1/3.3's type-checked call sites (AGENTS §2, no dedicated test).
- [ ] 3.6 Pre-close: `cd packages/shared && npm test && npm run typecheck`.
- [ ] 3.7 Commit (`refactor(shared): reemplaza versiones[uid] por contadaPorMi y pendiente`).
- [ ] 3.8 PR7 — RED: `packages/data/src/supabase/queue.test.ts` — two writes to the same `(sesionId,categoriaId)` before flush collapse to one entry with the latest `cantidad` (`cola-pendientes-offline` Req. "single indexedDB object store"); fails first, module doesn't exist.
- [ ] 3.9 GREEN: create `packages/data/src/supabase/queue.ts` (D-1/H1 `cola-pendientes-offline`).
- [ ] 3.10 RED: `packages/data/src/supabase/mappers.test.ts` — snake_case row → camelCase domain model, mirrors `firebase/mappers.test.ts`'s shape.
- [ ] 3.11 GREEN: create `packages/data/src/supabase/mappers.ts`.
- [ ] 3.12 RED: `packages/data/src/supabase/supabase-conteo-repository.test.ts` (`vi.mock('@supabase/supabase-js')`, D-9 pattern) — `observarLineas` merges the `lineas` stream with the own-aporte set seeded via `select categoria_id from aportes where sesion_id=eq.X` → `contadaPorMi` (`esquema-postgres` carve-out A scenarios); `observarMiAporte` prioritizes queue over Realtime value (`cola-pendientes-offline` Req. "Only the own-aporte view reflects the local queue"); network failure retries in place vs. 403 removes+marks rejected (negative/affirmative pair); retry on `online` + 10-15s poll. Fails first — file doesn't exist.
- [ ] 3.13 GREEN: create `packages/data/src/supabase/supabase-conteo-repository.ts` implementing `ConteoRepository` (9 members unchanged, D-7).
- [ ] 3.14 Pre-close: `cd packages/data && npm test && npm run typecheck`.
- [ ] 3.15 Commit (`feat(data): agrega cola indexedDB, mappers y SupabaseConteoRepository`).
- [ ] 3.16 PR8 — RED: `packages/data/src/supabase/supabase-admin-repository.test.ts` (`vi.mock`) — three call shapes (`functions.invoke('gestion-cajeros',...)` for 3 ops, `rpc(name,args)` for 3 ops, `from(t).insert/update()` for 4 direct writes); `listarAuditoria` keyset on `id` (`order('id',{ascending:false}).lt('id',cursor)`); `listarSesiones` offset `range()`; `ultimoHistoricoPorSucursal` via `select distinct on (sucursal_id) ... from vista_historicos` (no N+1). Fails first — file doesn't exist.
- [ ] 3.17 GREEN: create `packages/data/src/supabase/supabase-admin-repository.ts` implementing `AdminRepository` (20 members unchanged, D-7).
- [ ] 3.18 Pre-close: `cd packages/data && npm test && npm run typecheck`.
- [ ] 3.19 Commit (`feat(data): agrega SupabaseAdminRepository con las tres formas de llamada`).

## Phase 4: apps/web Wiring (PR9–PR10)

- [ ] 4.1 PR9 — RED: `apps/web/src/lib/version-minima.test.ts` — `leerVersionMinima()` calls `supabase.from('config').select('version_minima').eq('id','app').maybeSingle()`; fails first, module doesn't exist (`frontera-paquete-datos` Req. "version-check module lives in apps/web/src/lib").
- [ ] 4.2 GREEN: create `apps/web/src/lib/version-minima.ts` (D-7 chosen option).
- [ ] 4.3 RED: `apps/web/src/state/useAuthState.test.ts` (rewritten) — one nested `select` (`perfiles(nombre,rol,perfil_sucursales(sucursal_id))`) populates `rol`/`sucursales`; no `normalizarSucursales` call exists; fails first against the current claims-based implementation.
- [ ] 4.4 GREEN: rewrite `apps/web/src/state/useAuthState.ts` (D-7; `normalizarSucursales` deleted).
- [ ] 4.5 Modify `apps/web/src/lib/firebase.ts` → one `createClient()`; delete `apps/web/src/lib/funciones.ts` (14 lines, `httpsCallable` gone); modify `apps/web/src/lib/router.tsx:8` (`signInWithPassword`/`signOut`, 1:1) — existing router/auth-flow tests must stay green (regression net, `config.yaml` testing notes).
- [ ] 4.6 Modify `apps/web/src/state/useVersionMinima.ts:8,10,53` — import `leerVersionMinima()`; existing `useVersionMinima.test.ts` re-points its mock target, behavior assertions (5s timeout, fail-open, R4-001/D8) unchanged.
- [ ] 4.7 Pre-close: `cd apps/web && npm test && npm run typecheck`.
- [ ] 4.8 Commit (`feat(web): conecta cliente Supabase, useAuthState y leerVersionMinima`).
- [ ] 4.9 PR10 — RED: extend `CajerosScreen.test.tsx`, `CierreScreen.test.tsx`, `SucursalesAdminScreen.test.tsx` — `PostgrestError`/`AuthError`/`FunctionsHttpError` branches produce the same user-facing copy as today's `FirebaseError` branches; fails first, current code branches on `FirebaseError`.
- [ ] 4.10 GREEN: modify the 3 screens' error-code branching (D-7).
- [ ] 4.11 Modify `apps/web/src/ui/SucursalesScreen.tsx:28` — type-only `Auth` import swap, no behavior change (trivial, no new test).
- [ ] 4.12 Pre-close: `cd apps/web && npm test && npm run typecheck`.
- [ ] 4.13 Commit (`feat(web): mapea errores Postgrest/Auth/Functions en pantallas admin`).

## Phase 5: Seam Enforcement & Tooling (PR11)

- [ ] 5.1 PR11 — RED: temporarily add a fixture import of `@supabase/supabase-js` under `apps/web/src/state/**`; run `npm run lint` (root) and confirm it currently PASSES (the check that should fail incorrectly succeeds) — captures `frontera-paquete-datos` Req. "ESLint enforces the Supabase SDK boundary" affirmative scenario.
- [ ] 5.2 GREEN: extend `eslint.config.js` `no-restricted-imports` blocks — ban broadly (`apps/web/src/**`, `packages/shared/**`, `contracts/**`, `tools/**`), re-open narrowly (`packages/data/src/**`, `apps/web/src/lib/**`), `allowTypeImports` (D-8); re-run `npm run lint` on the fixture, confirm it now fails; remove the fixture.
- [ ] 5.3 Doc correction: `AGENTS.md:111` and `openspec/config.yaml:23` — correct the false "enforced by ESLint" claim to match reality (`frontera-paquete-datos` Req. "Docs stop claiming enforcement they don't have").
- [ ] 5.4 Modify `tools/seed.ts:14-16` — Supabase-admin equivalent of the firebase-admin seeding calls; no test (config.yaml: `tools` has no test script).
- [ ] 5.5 Pre-close: `npm run lint && npm run typecheck --workspaces --if-present`.
- [ ] 5.6 Commit (`feat(config): cierra la fuga de frontera del SDK y corrige documentación de enforcement`).

## Phase 6: Deletion — Firebase surface retired from the codebase (Firebase project stays live, ruling 1)

> Precondition for every unit below: the Postgres/Edge-Function/adapter equivalent
> named in its "Rollback boundary" (forecast table) has already merged in this chain.

- [ ] 6.1 PR12a — delete `packages/data/src/firebase/{firestore-conteo-repository,dispositivo}.ts`+tests, `apps/web/src/lib/persistencia-monitor.ts`+canary test (`cola-pendientes-offline` Req. "persistencia-monitor.ts is deleted, not ported"). Pre-close: `cd packages/data && npm test`; `cd apps/web && npm test`. Commit (`chore(data): elimina adaptador Firestore de conteo y monitor de persistencia`).
- [ ] 6.2 PR12b — delete `packages/data/src/firebase/{firestore-admin-repository,mappers}.ts`+tests. Pre-close: `cd packages/data && npm test`. Commit (`chore(data): elimina adaptador Firestore de administración`).
- [ ] 6.3 PR13 — delete 7 of 9 `contracts/schemas/*`+tests (`abrir-sesion`,`cerrar-sesion`,`actualizar-cajero`,`actualizar-sucursal`,`crear-categoria`,`crear-sucursal`,`desactivar-categoria`); update `contracts/schemas/index.ts` exports; keep `crear-cajero`/`desactivar-cajero` (`gestion-cajeros` REMOVED "actualizarCajero has a new zod contract", `#27` D5). Pre-close: `cd contracts && npm test`. Commit (`chore(contracts): elimina esquemas zod reemplazados por RPC/RLS`).
- [ ] 6.4 PR14a — run `npm run test:rules` as the last-green baseline, then delete `infra/test/reglas.test.ts` (359 lines, 29 `it()`). Commit (`chore(infra): elimina suite de tests de reglas Firestore`).
- [ ] 6.5 PR14b — delete `infra/firestore.rules` (144 lines); `npm run test:rules` is moot post-14a (no rules file remains) — do not re-run. Commit (`chore(infra): elimina firestore.rules, reemplazado por RLS de Supabase`).
- [ ] 6.6 PR15 — delete `packages/functions/src/callables/{abrir-sesion,cerrar-sesion}.ts`, `packages/functions/src/triggers/on-aporte-escrito.ts`+3 test files. Commit (`chore(functions): elimina callables de sesión, reemplazados por RPCs y trigger Postgres`).
- [ ] 6.7 PR16 — delete `packages/functions/src/callables/{crear-cajero,actualizar-cajero,desactivar-cajero,reactivar-cajero}.ts`+4 test files. Commit (`chore(functions): elimina callables de gestión de cajeros`).
- [ ] 6.8 PR17 — delete `packages/functions/src/callables/{crear-sucursal,actualizar-sucursal,crear-categoria,desactivar-categoria}.ts`+4 test files. Commit (`chore(functions): elimina callables de catálogo, reemplazados por PostgREST directo`).
- [ ] 6.9 PR18 — delete `packages/functions/src/scheduled/{recalcular-resumenes,reconciliar-lineas,purgar-auditoria}.ts`, `packages/functions/src/lib/{resumen,sincronizacion}.ts`+5 test files. Commit (`chore(functions): elimina jobs programados y helpers de resumen/sincronización`).
- [ ] 6.10 PR19 — delete `packages/functions/src/lib/{exigir-admin,validar,auditoria}.ts`, `packages/functions/src/index.ts`, `test/bundle.test.ts`, `test/gitignore-env-example.test.ts`, package config (`package.json`,`tsconfig.json`), remove the workspace entry from root `package.json`. Pre-close: `npm run test --workspaces --if-present` (confirms no dangling reference). Commit (`chore(functions): elimina el paquete completo`).

## Phase 7: Documentation (PR20)

- [ ] 7.1 PR20 — `docs/diseno/09-seguridad-y-auditoria.md:27-28` — A-8/A-9 "App Check" mitigation claim → "sin mitigar, límites de tasa de Supabase Auth" (`autorizacion-supabase` Req. "A-8/A-9 remain explicitly unmitigated", binding ruling 3/4).
- [ ] 7.2 `docs/diseno/09-seguridad-y-auditoria.md:67` — remove the forced first-login password-change claim (doesn't exist, #24 H4); `:70-74` — remove the App Check subsection.
- [ ] 7.3 Commit (`docs: corrige doc 09 sobre mitigación A-8/A-9 y flujo de cambio de contraseña`).

---

## Not in scope (explicit)

- No production cutover, no Firebase decommission, no `apps/web`↔Firebase disconnection at the infra level — ticket #32, out of scope (binding ruling 1).
- No fix for the temporary-password weakness or A-8/A-9 — deliberate parity gaps (binding ruling 4, `autorizacion-supabase` D-5).
- No bulk rewrite of the other 12 `docs/diseno/*` docs — only doc 09 §2/§3 (binding ruling 3).
- No `.github/workflows/ci.yml` edit — the `functions`/`reglas` path-filtered jobs simply stop triggering once their paths are gone; not named in `design.md`'s File Changes table.
