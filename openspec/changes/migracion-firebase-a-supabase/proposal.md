# Proposal — migracion-firebase-a-supabase

Phase: `sdd-propose` · Store: `hybrid` · Engram: `sdd/migracion-firebase-a-supabase/proposal`

## Intent

Google Cloud billing error `[OR-CBAT-23]` has no reliable self-service fix (issue #22). The
backend must leave Firebase. Green-field confirmed — no production data, so no ETL.

Decision map #22 is closed on its four core tickets (#23 data model, #24 auth/claims, #27
Cloud Functions translation, #28 RLS) plus #25 Realtime, #26 offline, #29 limits. **This
proposal consolidates those decisions into one SDD change; it does not re-open them.**

Net direction is deletion: `packages/functions/src/**` measures **1292 lines / 20 files**
(the closed #27 text says "1143 líneas" — re-measure, do not quote). Of it, one Edge Function
with three operations survives; the rest becomes schema.

## Scope

### This SDD round

`propose` → `spec` + `design` → `tasks`, and **stop**. No `apply`, no review, no `verify`, no
`archive`. Nothing in this round writes production code.

### In scope (the change)

| #   | Item                                                                                                                                                                                                      | Source               |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------- |
| 1   | Postgres schema: 10 tables, 2 admin-only views, partial unique index (I-1), sync trigger for `lineas`, audit triggers, generated `sincronizado`, Realtime publication                                     | #23 D1-D9, #27 D2/D6 |
| 2   | Auth on `perfiles`/`perfil_sucursales` — no `custom_access_token_hook`; `private.es_admin()`/`tiene_sucursal()`/`sesion_abierta()` `SECURITY DEFINER` in an unexposed schema (`ctx7-supabase-rls.md:136`) | #24 D1-D4            |
| 3   | `GRANT` = verb, RLS = rows; default-deny built from revoke + `ENABLE RLS` + a `pg_class` test (`ctx7-supabase-rls.md:174`); views `security_invoker = true` + `WHERE private.es_admin()` (`:160`)         | #28 D1-D5            |
| 4   | Server ops: 1 Edge Function (3 ops), 3 RPCs, 4 direct PostgREST writes, `pg_cron` purge                                                                                                                   | #27 D1/D3/D7         |
| 5   | Realtime: `postgres_changes` only, ~4-5 channels (one per screen)                                                                                                                                         | #25 D1-D5            |
| 6   | `indexedDB` pending-write queue replacing Firestore's offline cache; `persistencia-monitor.ts` (44 lines) and its canary test are deleted                                                                 | #26 D1-D5            |
| 7   | **Carve-out A — `LineaConteo.versiones[uid]` replacement.** Folded in as an **addendum to the consolidated data model, not new scope.**                                                                   | below                |
| 8   | **Carve-out B — the migration seam.**                                                                                                                                                                     | below                |
| 9   | Doc corrections mandated by `openspec/config.yaml` `rules.proposal`                                                                                                                                       | below                |
| 10  | Deletion: `packages/functions`, 7 of 9 `contracts/schemas`, `infra/firestore.rules` + `infra/test/reglas.test.ts`, `tools/seed.ts` Firebase-admin path                                                    | #27 D5, #28          |

### Out of scope

- **Cutover (#32)** and shutting Firebase down. Firebase stays live and untouched through this
  change.
- **Deploy/CI (#30 remainder), PR preview envs (#31), Postgres backup (#34)** — all OPEN;
  `supabase db diff`/`db push`/`db reset` work standalone (`ctx7-supabase-cli-testing.md:38,77`),
  so none blocks schema/RLS/RPC authoring.
- **Password rotation** — deliberate parity gap (#24 D5). **A-8/A-9 stay unmitigated** (#28 D4).
- **Bulk Firebase→Supabase rewrite of the 13 `docs/diseno/*` docs** — post-implementation work
  per #22. Only the docs this change's decisions _contradict_ are corrected (item 9).
- Firebase Storage (unused), non-Firebase client observability.

## Carve-out A — `versiones[uid]` replacement

#23 D2 deletes `lineas.versiones` as Firestore idempotency plumbing. It is also the **sole**
data source for four live behaviours no closed ticket owns:

| Consumer                                     | Location                                               |
| -------------------------------------------- | ------------------------------------------------------ |
| `estaPendiente` — "sólo pendientes" filter   | `packages/shared/src/services/progreso.ts:18-19`       |
| `siguientePendiente` — keyboard auto-advance | `packages/shared/src/services/progreso.ts:30-40`       |
| Progress bar "47/60"                         | `apps/web/src/ui/primitivos/BarraProgreso.tsx:5`       |
| `aporteConfirmado` — RF-16 cross-device      | `packages/shared/src/services/sincronizacion.ts:18-21` |

**Ruling: addendum, in scope, no new schema presumed.** The raw signal already survives —
`aportes` keyed `(sesion_id, categoria_id, uid)` (#23), the client's own-aporte channel (#25 D5),
and the local queue (#26 D5). `sdd-design` owns the replacement shape and MUST justify any new
column against those three before adding one. **Not designed here.**

## Carve-out B — the migration seam is not enforced

`AGENTS.md:111` and `openspec/config.yaml:23` both claim ESLint enforces "only `packages/data`
touches the Firebase SDK". **False.** `eslint.config.js` restricts Firebase imports only under
`packages/shared/**` (`:31`) and `apps/web/src/ui/primitivos/**` (`:67`). No other rule, no
`dependency-cruiser`.

A real leak exists in the newest commit: `apps/web/src/state/useVersionMinima.ts:8,10,53` reads
`config/app` with `doc()`/`getDoc()` directly, bypassing both repositories. In scope:

1. Route that read through a repository (it becomes a PostgREST select either way).
2. Extend the **existing** `no-restricted-imports` block to actually fence
   `@supabase/supabase-js` outside `packages/data` + `apps/web/src/lib`. No new tool.
3. Correct both false claims in `AGENTS.md:111` and `openspec/config.yaml:23`.

A doc that lies about an enforced boundary is worse than one that admits the gap.

## Doc corrections (item 9)

`rules.proposal` requires a contradicted design doc to be fixed inside the change.
`docs/diseno/09-seguridad-y-auditoria.md:27-28` declares A-8/A-9 mitigated by App Check, never
implemented (`README.md:112`, Pendiente); `:67` describes a forced first-login password change
that does not exist (#24 H4). Both contradict #28 D4 / #24 D5 → corrected in this change, as
task units. Also touched: doc 04 (claims duplication), doc 05 (offline), doc 08 (functions).

## Capabilities

### New

- `esquema-postgres` — tables, views, indices, triggers, generated column, Realtime publication.
- `autorizacion-supabase` — identity, `perfiles` as sole source of `rol`/`sucursales`, `private`
  helpers, `GRANT`/RLS split, default-deny, threat coverage A-1…A-11.
- `operaciones-servidor` — Edge Function, RPCs, direct PostgREST writes, `pg_cron`.
- `tiempo-real` — channel topology, denormalized participant `nombre`, no `broadcast`.
- `cola-pendientes-offline` — `indexedDB` queue, retry policy, `pendientes` (RF-16), optimistic
  echo limited to `observarMiAporte`.

### Modified

- `reconciliacion-lineas` — **removed in full** (#23 D2: a synchronous trigger cannot desync).
- `resumen-sesion` — cron/`dirty`/`marcaAportes`/I-M removed; summary becomes a view (#23 D6).
- `cierre-sesion` — RF-16 predicate becomes a generated column (#27 D6); RPC, not callable.
- `gestion-cajeros` — claims requirements removed (#24 D1); Edge Function + RPC split (#27 D1).

## Approach

The seam holds the whole plan: `packages/data/src/repositories/` (`ConteoRepository`,
`AdminRepository`) keeps its interfaces; only the adapters under `packages/data/src/firebase/`
are replaced. `packages/data/src/fakes/*` have zero SDK dependency, so ~40 `apps/web` UI test
files keep passing unmodified — that is what makes a big-bang backend swap affordable at this
scale (3 sucursales, ~6 sesiones/month).

Order: schema → authorization → triggers/views → RPCs/Edge Function → `packages/data` adapters →
`apps/web` → deletion → docs.

## Affected areas

| Area                                                                      | Impact     | What                                                |
| ------------------------------------------------------------------------- | ---------- | --------------------------------------------------- |
| `supabase/migrations/`                                                    | New        | All SQL: tables, RLS, triggers, RPCs, `pg_cron`     |
| `supabase/functions/`                                                     | New        | One Edge Function, 3 operations                     |
| `packages/data/src/supabase/`                                             | New        | Adapters + `indexedDB` queue                        |
| `packages/data/src/firebase/`                                             | Removed    | 4 files + 4 test files (853 lines)                  |
| `packages/functions/`                                                     | Removed    | Whole package, 1292 lines / 20 files, 19 test files |
| `infra/firestore.rules` + `infra/test/`                                   | Removed    | 144 + 359 lines (**29** `it()` blocks, not 27)      |
| `contracts/schemas/`                                                      | Modified   | 7 of 9 schemas + their tests removed                |
| `apps/web/src/lib`, `src/state`, 4 `ui/admin` files                       | Modified   | Client init, auth state, error shapes               |
| `packages/shared/src/services/`                                           | Modified   | `progreso.ts`, `sincronizacion.ts` (carve-out A)    |
| `docs/diseno/09`, `AGENTS.md`, `openspec/config.yaml`, `eslint.config.js` | Modified   | Carve-out B + item 9                                |
| `apps/web/src/state/useConexion.ts`, `packages/data/src/fakes/`           | Unaffected | Verified: no SDK import                             |

## Preconditions and assumptions

1. **#33 (test strategy) is OPEN and is the real gate on `apply`** — not the four closed core
   tickets. Strict TDD is non-negotiable (`AGENTS.md` §2), and 19 `packages/functions` test
   files plus `infra/test/reglas.test.ts` lose their apparatus entirely. pgTAP and local-Postgres
   integration tests are both confirmed current (`ctx7-supabase-cli-testing.md:17`), but neither
   is chosen. **Authoring may proceed; "done" may not be claimed until #33 closes.**
2. Supabase Free + externally-monitored keep-alive cron (#29/#30). `pg_cron` does not run while
   the project is paused — two distinct mechanisms, both required (#27 D3).
3. Every quantity above is re-measured from code, not quoted from tickets.

## Delivery

`auto-chain`, 400 changed lines per slice. **This change cannot be one PR.** Sketch, ~10 slices:
schema → default-deny/RLS/helpers → triggers+views → RPCs → Edge Function → `packages/data`
adapters+queue → Realtime topology → `apps/web` → deletion → docs/seam.

**Budget hazard:** the count is `additions + deletions`. Deleting `packages/functions` alone is
1292 deletions — 3+ slices or an explicit `size:exception`. `sdd-tasks` must forecast this; it is
the single largest budget fact in the change.

## Rollback

Additive until the deletion slices: Supabase is built alongside a live, untouched Firebase, so
every slice up to deletion reverts by reverting its PR with zero production impact. After the
deletion slices, rollback is a Git revert of the whole chain — still safe, because production
cutover is #32 and is **out of scope for this change**. No data migration, no backfill
(green-field, #22).

## Success criteria (this round)

- [ ] Specs exist for all 5 new + 4 modified capabilities, with affirmative _and_ negative
      scenarios for every threat A-1…A-11 (#28 D6 — negative-only would go green on a schema
      nobody can use).
- [ ] Design resolves carve-out A without inventing a column the three surviving signals cover.
- [ ] Design accounts for the RLS gotchas the fetched docs confirm: an UPDATE policy needs
      `USING` + `WITH CHECK` **and** a matching SELECT policy (`ctx7-supabase-rls.md:191`) —
      `sesion_participantes` silently no-ops without it; DELETE payloads under RLS degrade to
      PK-only rather than skipping the event, so #25 H4's wording must not be copied verbatim.
- [ ] Tasks are TDD-ordered (red before green), flag the `pg_class` default-deny test, and carry
      a per-slice 400-line forecast.
- [ ] Tasks include carve-out B (3 items) and the doc corrections.
- [ ] The round stops at `tasks`.
