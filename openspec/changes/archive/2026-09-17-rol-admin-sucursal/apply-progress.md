# Apply progress: rol-admin-sucursal

Engram disconnected this session — progress tracked here instead of `mem_save`.
Worktree: `feat-rol-admin-sucursal-reglas-worktrees\feat-rol-admin-sucursal-reglas`
(branch `feat/rol-admin-sucursal-reglas`, based on `main` @ f4f6f24). No commit made —
awaiting RDD receipt per the RDD workflow; changes are unstaged in the worktree.

## Phase 1: Rules read scope

- [x] 1.1 **S1** — `puedeVerSucursal`/`veUsuario` rules + provable-query docs

### Mode

Strict TDD (per task instructions). Test runner: `npm run test:rules`
(Firestore + Auth emulator).

### TDD Cycle Evidence

| Step | Evidence |
|---|---|
| RED | Added `describe("D6 · admin_sucursal — alcance de lectura (S1)")` to `infra/test/reglas.test.ts` (5 affirmative scenarios: unfiltered usuarios list — highest leak first — filtered list, get shared usuario, historicos, resumen, auditoria; plus negatives, Gerente/cajero regressions, malformed-claim 0/2+ sucursales). Ran `npm run test:rules` against the OLD rules: **5 failed for the right reason** (`false for 'get'/'list' @ ...`, i.e. denied — not evaluation errors), 74 passed (pre-existing suite untouched). |
| GREEN | Added `esAdminSucursal()`, `puedeVerSucursal()`, `veUsuario()` helpers to `infra/firestore.rules`; wired `usuarios` get/list, `historicos` read, `resumen` read, `auditoria` read to the new predicate. Re-ran `npm run test:rules`: **79/79 passed**. |
| REFACTOR | None needed — helpers are minimal, no duplication introduced. |

### Query-provability decision

Design flagged uncertainty on whether Firestore can prove the `usuarios` list
query from the `x in list` form, with `hasAny` as fallback. **Proved `in` works**:
`request.auth.token.sucursales[0] in resource.data.sucursalesAsignadas` paired
with the client's `.where("sucursalesAsignadas", "array-contains", "suc_norte")`
passed in the emulator on first try — no `hasAny` fallback needed.

### Files Changed

| File | Action | What Was Done |
|------|--------|---------------|
| `infra/firestore.rules` | Modified | Added `esAdminSucursal()`, `puedeVerSucursal(sucursalId)`, `veUsuario()` helpers; `usuarios` get/list, `historicos` read, `resumen` read, `auditoria` read now route through `puedeVerSucursal`/`veUsuario`. `esAdmin()`/`esCajero()` paths unchanged. |
| `infra/test/reglas.test.ts` | Modified | Seeded `sucursalesAsignadas` on `usuarios/uid_ana` (shared) and new `usuarios/uid_luis` (foreign-only); added `adminSucursal()` context helper; added `describe("D6 · admin_sucursal — alcance de lectura (S1)")` with usuarios/historicos/resumen/auditoria affirmative+negative pairs, Gerente/cajero regressions, and 0-/2+-sucursal malformed-claim negatives. |
| `docs/diseno/09-seguridad-y-auditoria.md` | Modified | §2 claims table: `rol` admits `admin_sucursal`, `sucursales` cardinality note (ADR-27). §3 rules snippet: added the 3 new helpers and updated `usuarios`/`historicos`/`resumen`/`auditoria` blocks to match the real rules (also fixed pre-existing drift on the `auditoria` block, which was missing the cajero branch that already exists in `infra/firestore.rules`). |
| `docs/diseno/01-requisitos-y-alcance.md` | Modified | §2 Actores: "dos roles" → "tres roles"; added `admin_sucursal` node to the flowchart; replaced the "no existe un tercer rol" note; added an "Admin de sucursal" column to the permissions matrix (full target design per design.md's Migration/Rollout — doc lands ahead of S2-S4 code by design, noted explicitly in-doc). |
| `docs/diseno/03-modelo-de-dominio.md` | Modified | ER diagram: `rol` enum string widened to `"admin \| admin_sucursal \| cajero"`. |
| `docs/diseno/13-decisiones-adr.md` | Modified | New `ADR-27` (branch-scoped admin role), following the exact ADR-26 format (Contexto/Decisión/tabla de alternativas/Consecuencias/Detonante de reevaluación). |

### Deviations from Design

None — implementation matches design.md D6 and the rules diff exactly. Doc 09's
`auditoria` code-block line ended up also fixing pre-existing (out-of-scope)
drift against the real rules file, because it's the exact line D6 requires
touching; no unrelated lines in that doc were touched.

### Issues Found

None.

### Work Unit Evidence

| Evidence | Value |
|---|---|
| Focused test command and result | `npm run test:rules` → 79/79 passed (5 files) |
| Runtime harness | Same command — Firestore + Auth emulator IS the runtime boundary for security rules |
| Rollback boundary | `infra/firestore.rules` + `infra/test/reglas.test.ts` diff; reverting leaves `esAdmin()`-only rules (S1's own rollback note in tasks.md) |

### Closing Checks

| Command | Result |
|---|---|
| `npm run typecheck` | Pass (all workspaces) |
| `npm run lint` | Pass (eslint ., no errors) |
| `npm test` | Pass — 171/171 (functions) + 120/120 (shared) + 65/65 (contracts) |
| `npm run test:rules` | Pass — 79/79 |

### Budget

`git diff --numstat` (worktree, after `prettier --write` on the 5 non-rules
changed files — `.rules` isn't Prettier-supported):

```
30  21  docs/diseno/01-requisitos-y-alcance.md
 1   1  docs/diseno/03-modelo-de-dominio.md
29   9  docs/diseno/09-seguridad-y-auditoria.md
38   0  docs/diseno/13-decisiones-adr.md
23   5  infra/firestore.rules
127  1  infra/test/reglas.test.ts
```

Total additions + deletions = **285** (forecast was ~305). Under the 400 hard limit.

### Status

1/1 assigned task complete. Ready for RDD candidate review (no commit made per
instructions — orchestrator runs the receipt). Not proceeding to any other
slice (S2+) — out of scope for this apply.

### Orchestrator addendum (supersedes the numbers above)

Before the RDD START, the orchestrator applied two pre-freeze corrections found
by the fresh-context apply validator: removed a misleading "bloque simplificado"
comment from doc 09's `auditoria` block (the block is the exact rule), and added
2 tests (`usuarios` list filtered by a foreign sucursal → denied; `auditoria`
list filtered by own sucursal → allowed). Final candidate:

- `git diff --numstat` total = **303** additions+deletions (6 files).
- `npm run test:rules` = **81/81** (70 in `reglas.test.ts`, 16 new D6 tests).
- RDD: lineage `review-a8d0cafc62a78ef8`, lens `review-reliability`, 0 findings,
  approved and acknowledged.
- sdd-verify: pass, 8/8 scenarios, `evidence_revision`
  `sha256:0a58bedb5a5538f78e9b8da7c8457d6d5791d35c1943d39514a80d5e15824cfd`
  (`verify-report-s1.md`).
- sdd-attempt settled `passed` → objective complete.
- Worktree path: `C:/Users/PC RYZEN/Documents/Proyectos/Sistema inventario-worktrees/feat-rol-admin-sucursal-reglas`.

## Phase 2: Sesión gate

- [x] 2.1 **S2a** — `exigirAdminDeSucursal`/`exigirExclusivaDeSucursal` + `abrirSesion`

Worktree: `C:/Users/PC RYZEN/Documents/Proyectos/Sistema inventario-worktrees/feat-rol-admin-sucursal-alcance-helpers`
(branch `feat/rol-admin-sucursal-alcance-helpers`, based on S1 commit `3bcc4d6`). No commit
made — candidate left unstaged in the worktree per instructions.

### Mode

Strict TDD. Test runner: `(cd packages/functions && firebase emulators:exec
--project demo-conteo-eficiente --only firestore,auth "vitest run
test/lib/exigir-admin.test.ts test/callables/abrir-sesion.test.ts")`.

### TDD Cycle Evidence

| Step | Evidence |
|---|---|
| RED | Added `exigirAdminDeSucursal`/`exigirExclusivaDeSucursal` describe blocks to `exigir-admin.test.ts` (6 + 5 cases) and an `abrirSesion — autorización de sucursal` describe block to `abrir-sesion.test.ts` proven through the `onCall` wrapper (`abrirSesion.run(req)`, D5) — own-sucursal affirmative, foreign-sucursal negative, 0-/2-sucursal malformed-claim negatives, Gerente regression. Ran against the OLD `exigir-admin.ts`/`abrir-sesion.ts`: **12 failed for the right reason** (`exigirAdminDeSucursal`/`exigirExclusivaDeSucursal` not a function; `abrirSesion.run` threw "Se requiere rol admin." for the admin_sucursal cases), 18 pre-existing passed unchanged. |
| GREEN | Added `AlcanceAdmin`, `exigirAdminDeSucursal` and `exigirExclusivaDeSucursal` to `exigir-admin.ts` (reusing `autorizacionDe` from `exigir-cajero-de-sesion.ts` per D1's claim-normalization reuse); wired `abrirSesion`'s wrapper to `exigirAdminDeSucursal(req)` → alcance, then `exigirExclusivaDeSucursal(alcance, [datos.sucursalId])` after `validar` per design's interface table. Re-ran the focused command: **30/30 passed**. |
| REFACTOR | None needed — 2 small functions, no duplication introduced. |

### Files Changed

| File | Action | What Was Done |
|------|--------|---------------|
| `packages/functions/src/lib/exigir-admin.ts` | Modified | Added `AlcanceAdmin` type, `exigirAdminDeSucursal(req): AlcanceAdmin` (D1, reuses `autorizacionDe`), `exigirExclusivaDeSucursal(alcance, sucursales): void` (D2). `exigirAdmin` untouched. |
| `packages/functions/src/callables/abrir-sesion.ts` | Modified | Wrapper now calls `exigirAdminDeSucursal(req)` instead of `exigirAdmin(req)`, then `exigirExclusivaDeSucursal(alcance, [datos.sucursalId])` after `validar` (per design's Interfaces table: `abrirSesion | wrapper: exclusiva(alcance, [datos.sucursalId])`). `abrirSesionImpl` untouched. |
| `packages/functions/test/lib/exigir-admin.test.ts` | Modified | Added `exigirAdminDeSucursal` (6 cases: unauthenticated, cajero, admin→null, 0-sucursal malformed, 2-sucursal malformed, valid admin_sucursal→sucursal) and `exigirExclusivaDeSucursal` (5 cases: exact match, undefined/global, foreign, shared 2+, Gerente no-op) describe blocks. |
| `packages/functions/test/callables/abrir-sesion.test.ts` | Modified | Added `abrirSesion — autorización de sucursal (D1/D2, S2a)` describe block proven through `abrirSesion.run(req)` (5 cases: own-sucursal affirmative, foreign negative, 0-/2-sucursal malformed negatives, Gerente regression). Includes a local `sesionesCreadas`/`afterEach` cleanup (see Issues Found) — the pre-existing `abrirSesionImpl` describe block above it was left untouched (out of scope). |

### Deviations from Design

None on the authorization logic — matches D1/D2 and the Interfaces table exactly:
`exigirAdminDeSucursal` reuses `autorizacionDe`, `exigirExclusivaDeSucursal`'s
signature and Gerente no-op match the spec verbatim, and `abrirSesion`'s wrapper
checks `[datos.sucursalId]` after `validar` as designed. One test-hygiene addition
beyond RED tests: an `afterEach` cleanup for the sessions the new wrapper-level
tests open (see Issues Found below) — required by the repo's known shared-emulator-state
gotcha, not a design deviation.

### Issues Found

Running the full `npm test` after GREEN caused
`test/scheduled/reconciliar-lineas.test.ts`'s "reejecutar sin aportes nuevos"
case to time out (5000ms) — it queries ALL `sesiones` with `estado == "abierta"`
across the shared emulator and iterates each one. Confirmed root cause empirically:
stashing my diff and running `npm test` on the base S1 commit alone was green
(171/171); the 2 new affirmative wrapper tests (admin_sucursal + Gerente) each
leave one open sesión with no cleanup, tipping the shared-state count over the
5s budget. Fix: added a local `sesionesCreadas` array + `afterEach` inside the
new describe block that deletes each sesión it opened (matching the existing
pattern in `crear-categoria-en-sesion.test.ts`), consistent with the repo gotcha
"every test that creates sesiones ... must delete them in afterEach." Did NOT
retrofit cleanup onto the pre-existing `abrirSesionImpl` describe block above it
(out of scope for this task; confirmed separately that the untouched base branch
is *also* intermittently flaky under load — a different test, "I-1 · dos
aperturas concurrentes ... interleaving real", timed out on two additional
base-only re-runs — so residual flakiness there predates this change and isn't
something this slice's diff introduces or should fix).

### Work Unit Evidence

| Evidence | Value |
|---|---|
| Focused test command and result | `(cd packages/functions && firebase emulators:exec --project demo-conteo-eficiente --only firestore,auth "vitest run test/lib/exigir-admin.test.ts test/callables/abrir-sesion.test.ts")` → 30/30 passed |
| Runtime harness | Same command — Firestore + Auth emulator, and the authorization proof runs through `abrirSesion.run(req)` (the real `onCall` wrapper), not just the Impl |
| Rollback boundary | `exigir-admin.ts` new exports (additive) + `abrir-sesion.ts`'s 3-line wrapper change; revert = `abrirSesion` back to `exigirAdmin(req)` |

### Closing Checks

| Command | Result |
|---|---|
| `npm run typecheck` | Pass (all workspaces) |
| `npm run lint` | Pass (eslint ., no errors) |
| `npm test` | Pass — 187/187 (functions, clean run) + 59/59 (web) + 120/120 (shared) + 65/65 (contracts). Intermittent under repeated back-to-back runs on this machine: one run timed out a single `reconciliar-lineas`/`on-aporte-escrito` concurrency test (5000ms budget) — reproduced as pre-existing on the untouched base branch too (see Issues Found); not caused by this diff. |
| Focused command (`exigir-admin.test.ts` + `abrir-sesion.test.ts`) | Pass — 30/30, reproduced clean multiple times |

### Budget

`git diff --numstat` (worktree, after `npx prettier --write` on the 4 changed files):

```
 3   2  packages/functions/src/callables/abrir-sesion.ts
34   0  packages/functions/src/lib/exigir-admin.ts
93   3  packages/functions/test/callables/abrir-sesion.test.ts
58   1  packages/functions/test/lib/exigir-admin.test.ts
```

Total additions + deletions = **194** (forecast was ~250). Under the 400 hard limit.

### Status

1/1 assigned task (2.1 / S2a) complete. Not proceeding to any other slice
(S2b+) — out of scope for this apply. No commit made per instructions;
candidate is unstaged in the worktree, awaiting RDD receipt/orchestrator review.

### Orchestrator addendum (supersedes the flakiness note above)

The intermittent timeout was NOT environmental. Root cause, reproduced
deterministically on main code: `packages/functions` runs test files in
sequence (`fileParallelism: false`) on one shared emulator, and
`abrir-sesion.test.ts` left ~14 open sesiones + active categorías behind;
`reconciliarLineasImpl` scans all open sesiones (N+1), so whenever vitest's
cache ordered `reconciliar-lineas.test.ts` after it, the no-op test crossed 5 s.
Fixed as its own candidate: issue #98, commit `c8d280d`
(`fix/tests-abrir-sesion-limpieza`, RDD lineage `review-62fc141134627294`,
0 findings). S2a was moved on top of it (stash → ff → conflict in the vitest
import resolved) and its now-redundant local session cleanup was removed.

Final S2a candidate (base `c8d280d`): 180 additions+deletions (3+2, 34+0, 80+2,
58+1); typecheck/lint clean; `npm test` root green — functions 187/187 with
`reconciliar-lineas` at 1.5 s, web 472, data 103, shared 120, contracts 65.

Closed: RDD lineage `review-6a6b1f5eea6684dd` (review-reliability, 0 findings,
approved + acknowledged); sdd-verify PASS (`verify-report-s2a.md`, evidence
`sha256:bc5c848f7b3caf6ecbeebeec61511c65913e10f6b03dd9c8789abaf0e75e639d`);
attempt settled complete. Work-unit commits on
`feat/rol-admin-sucursal-alcance-helpers`: `fdb9250` (helpers + tests),
`cb8267b` (abrirSesion wiring + tests). Next: S2b (task 2.2) from this branch.

- [x] 2.2 **S2b** — `cerrarSesion` two-stage gate

Worktree: `C:/Users/PC RYZEN/Documents/Proyectos/Sistema inventario-worktrees/feat-rol-admin-sucursal-cierre-sesion`
(branch `feat/rol-admin-sucursal-cierre-sesion`, based on S2a commit `cb8267b`). No commit
made — candidate left unstaged in the worktree per instructions.

### Mode

Strict TDD. Test runner: `(cd packages/functions && firebase emulators:exec
--project demo-conteo-eficiente --only firestore,auth "vitest run
test/callables/cerrar-sesion.test.ts test/lib/exigir-cajero-de-sesion.test.ts")`.

### TDD Cycle Evidence

| Step | Evidence |
|---|---|
| RED | Added the 11 existing `cerrarSesionImpl(...)` call sites' trailing `null` arg (Gerente scope, D4), a `cerrarSesion — autorización de sucursal (D4, S2b)` describe block proven through `cerrarSesion.run(req)` (D5: own-sucursal affirmative, foreign-sucursal negative with `sinConfirmar` non-empty, 0-/2-sucursal malformed negatives against a NON-EXISTENT sesionId, Gerente regression), and an `admin_sucursal` membership pair to `exigir-cajero-de-sesion.test.ts`. Ran against the OLD `cerrar-sesion.ts`: the affirmative admin_sucursal test failed for the right reason (`Se requiere rol admin.`, from the old unconditional `exigirAdmin`) — the true discriminator per AGENTS.md §2 (a negative alone proves nothing; the old gate already rejects non-`admin` roles, so the negative/malformed/regression cases pass trivially either way, but the affirmative pair does not). 24/25 passed, 1 failed for the right reason. |
| GREEN | `cerrarSesionImpl` gained a REQUIRED trailing `alcance: AlcanceAdmin` param (D4, no default — fails closed on a forgotten wire); `exigirExclusivaDeSucursal(alcance, [sesionAntes.get("sucursalId")])` runs right after the `!exists` check, BEFORE the estado check, RF-16, `CIERRE_BLOQUEADO` and the freeze tx. Wrapper replaced `exigirAdmin(req)` with `exigirAdminDeSucursal(req)` → `alcance`, then `validar`, then `cerrarSesionImpl(getFirestore(), req.auth!.uid, datos, alcance)`. Re-ran the focused command: **25/25 passed**. |
| REFACTOR | None needed — one new call reusing an existing helper, no duplication introduced. |

### Files Changed

| File | Action | What Was Done |
|------|--------|---------------|
| `packages/functions/src/callables/cerrar-sesion.ts` | Modified | `cerrarSesionImpl` gains required trailing `alcance: AlcanceAdmin`; `exigirExclusivaDeSucursal` call added right after the `exists` check per D4/S2b. Wrapper now calls `exigirAdminDeSucursal(req)` instead of `exigirAdmin(req)` and threads `alcance` into `cerrarSesionImpl`. |
| `packages/functions/test/callables/cerrar-sesion.test.ts` | Modified | 11 existing `cerrarSesionImpl` call sites now pass a trailing `null` (Gerente scope). Added `cerrarSesion — autorización de sucursal (D4, S2b)` describe block proven through `cerrarSesion.run(req)` (5 cases, with its own `afterEach` cleanup limited to what it creates — issue #98, no retrofit onto the pre-existing describe block above it). |
| `packages/functions/test/lib/exigir-cajero-de-sesion.test.ts` | Modified | Added an `admin_sucursal` membership pair (own-sucursal passes, foreign-sucursal rejected) — test-only coverage confirming the design's D3/membership claim; no change to `exigir-cajero-de-sesion.ts` (the helper already admitted `admin_sucursal` through claim membership, as design.md stated). |
| `docs/diseno/08-contratos-y-cloud-functions.md` | Modified | §5 (Convenciones transversales): added a note documenting `cerrarSesion`'s two-stage gate (role gate via `exigirAdminDeSucursal` before any read; sucursal gate right after the sesión read, before RF-16/`CIERRE_BLOQUEADO`/the freeze tx; Gerente exempt). Minimal addition, no rewrite of the (already-stale, out-of-scope) `exigirAdmin`-based code samples in §3. |

### Deviations from Design

None — matches D4's Interfaces table placement exactly ("Impl: right after the
`exists` check, BEFORE the estado check, `verificarSincronizacion` and
`CIERRE_BLOQUEADO`") and D5 (wrapper-level `.run(req)` tests). Item 3
(`exigirAdminOCajeroDeSesion`) required no code change, confirming the design's
own note that it "already admits admin_sucursal through claim membership. It
needs a test only."

### Issues Found

None. The negative/malformed/regression scenarios in the new wrapper describe
block also pass against the OLD `exigirAdmin`-only gate (it already rejects any
non-`admin` rol, including a malformed `admin_sucursal`), so only the
affirmative admin_sucursal case is a true RED/GREEN discriminator for this
slice — noted per AGENTS.md §2 rather than treated as a gap, since the
affirmative pair is present and the negatives still assert the right absence of
effect (no `CIERRE_BLOQUEADO`, sesión stays `abierta`).

### Work Unit Evidence

| Evidence | Value |
|---|---|
| Focused test command and result | `(cd packages/functions && firebase emulators:exec --project demo-conteo-eficiente --only firestore,auth "vitest run test/callables/cerrar-sesion.test.ts test/lib/exigir-cajero-de-sesion.test.ts")` → 25/25 passed |
| Runtime harness | Same command — Firestore + Auth emulator, and the authorization proof runs through `cerrarSesion.run(req)` (the real `onCall` wrapper), not just the Impl |
| Rollback boundary | `cerrar-sesion.ts`'s `alcance` param + 2-line wrapper change; revert = `cerrarSesion` back to unconditional `exigirAdmin(req)` before the read and `cerrarSesionImpl` losing its 4th param (with the 11 test call sites' trailing `null` reverted alongside) |

### Closing Checks

| Command | Result |
|---|---|
| `npm run typecheck` | Pass (all workspaces) |
| `npm run lint` | Pass (eslint ., no errors) |
| `npm test` | Pass — web 472/472, data 103/103, functions 194/194, shared 120/120, contracts 65/65 |
| Focused command (`cerrar-sesion.test.ts` + `exigir-cajero-de-sesion.test.ts`) | Pass — 25/25 |

### Budget

`git diff --numstat` (worktree, after `npx prettier --write` on the 4 changed files):

```
 9   0  docs/diseno/08-contratos-y-cloud-functions.md
12   3  packages/functions/src/callables/cerrar-sesion.ts
143 24  packages/functions/test/callables/cerrar-sesion.test.ts
20   0  packages/functions/test/lib/exigir-cajero-de-sesion.test.ts
```

Total additions + deletions = **211** (forecast was ~200). Under the 400 hard limit.

### Status

1/1 assigned task (2.2 / S2b) complete. Not proceeding to any other slice
(S3+) — out of scope for this apply. No commit made per instructions; candidate
is unstaged in the worktree, awaiting RDD receipt/orchestrator review.

## Phase 3: Categoría exclusive writes

- [x] 3.1 **S3a** — `crearCategoria` + `actualizarCategoria`

Worktree: `C:/Users/PC RYZEN/Documents/Proyectos/Sistema inventario-worktrees/feat-rol-admin-sucursal-categoria-crear-actualizar`
(branch `feat/rol-admin-sucursal-categoria-crear-actualizar`, based on S2b commit
`69483e5`). No commit made — candidate left unstaged in the worktree per
instructions.

### Mode

Strict TDD. Test runner: `(cd packages/functions && firebase emulators:exec
--project demo-conteo-eficiente --only firestore,auth "vitest run
test/callables/crear-categoria.test.ts test/callables/actualizar-categoria.test.ts")`.

### TDD Cycle Evidence

| Step | Evidence |
|---|---|
| RED | Added a `crearCategoria — autorización de sucursal (D2, S3a)` describe block (5 cases, proven through `crearCategoria.run(req)`, D5) and an `actualizarCategoria — autorización de sucursal (D2, S3a)` describe block (6 cases, through `actualizarCategoria.run(req)`), plus the 5 existing `actualizarCategoriaImpl` call sites' trailing `null` arg (Gerente scope, D4-style required param). Ran against the OLD callables (`git stash` on just the 2 src files, tests untouched): **2 failed for the right reason** (`Se requiere rol admin.`, from the old unconditional `exigirAdmin` — the true discriminators per AGENTS.md §2, same pattern as S2b: negatives/malformed/regression already pass against the old gate since it already rejects any non-admin rol), 20/22 passed. Two intermediate test-authoring bugs were found and fixed *before* trusting this RED (an explicit `sucursalesAsignadas: undefined` key in test payloads breaking Firestore writes differently from an omitted key, and a Gerente-regression assertion comparing against an unused local instead of the helper's own generated value) — both fixed in the test files only, no source touched, then RED re-confirmed clean. |
| GREEN | `crear-categoria.ts` wrapper: `exigirAdminDeSucursal(req)` → `alcance`, then after `validar`, `exigirExclusivaDeSucursal(alcance, datos.sucursalesAsignadas)`. `actualizar-categoria.ts`: `actualizarCategoriaImpl` gains a REQUIRED trailing `alcance: AlcanceAdmin` param (no default, D4 pattern) and checks the STORED `sucursalesAsignadas` via `exigirExclusivaDeSucursal` right after `tx.get`, before `tx.update`; the wrapper checks the same exclusivity on the INPUT (see Deviations) before calling the Impl. Re-ran the focused command: **22/22 passed**. |
| REFACTOR | None needed — reuses S2a's existing helpers verbatim, no duplication introduced. |

### Files Changed

| File | Action | What Was Done |
|------|--------|---------------|
| `packages/functions/src/callables/crear-categoria.ts` | Modified | Wrapper now calls `exigirAdminDeSucursal(req)` instead of `exigirAdmin(req)`, then `exigirExclusivaDeSucursal(alcance, datos.sucursalesAsignadas)` after `validar` per design's Interfaces table. `crearCategoriaImpl` untouched. |
| `packages/functions/src/callables/actualizar-categoria.ts` | Modified | `actualizarCategoriaImpl` gains required trailing `alcance: AlcanceAdmin`; checks the stored `sucursalesAsignadas` right after `tx.get`, before any `tx.update` (D2). Wrapper calls `exigirAdminDeSucursal(req)` → `alcance`, checks the same exclusivity on the input, then threads `alcance` into the Impl. |
| `packages/functions/test/callables/crear-categoria.test.ts` | Modified | Added `crearCategoria — autorización de sucursal (D2, S3a)` describe block through `crearCategoria.run(req)` (5 cases: own-sucursal exact-match affirmative, omitted-input negative, multi-sucursal-input negative, malformed-claim negative, Gerente regression). |
| `packages/functions/test/callables/actualizar-categoria.test.ts` | Modified | 5 existing `actualizarCategoriaImpl` call sites now pass a trailing `null` (Gerente scope). Added `actualizarCategoria — autorización de sucursal (D2, S3a)` describe block through `actualizarCategoria.run(req)` (6 cases: exclusively-owned affirmative, omitted-input-on-own-categoría negative — see Deviations, global-stored negative, shared-stored negative, malformed-claim negative, Gerente regression). No new cleanup needed: `sembrarCategoria` already registers into the existing top-level `categoriasCreadas`/`afterEach`. |
| `docs/diseno/08-contratos-y-cloud-functions.md` | Modified | Extended the S2b note (§ "Convenciones transversales") with one short paragraph for `crearCategoria`/`actualizarCategoria`'s exclusive-ownership gate, matching the exact convention of the existing `cerrarSesion` note. |

### Deviations from Design

One clarification, not a deviation: design.md's Interfaces table says
`actualizarCategoria | wrapper: the same check on the input, plus Impl inside
tx after tx.get on the stored value` — literally "the same check" as
`crearCategoria`'s unconditional input check, not a conditional one. The task
brief flagged ambiguity (`actualizarCategoriaSchema`'s `sucursalesAsignadas`
is `.optional()`) and asked to state the resolution. Traced the concrete
risk: `actualizarCategoriaImpl` already writes
`sucursalesAsignadas: sucursalesAsignadas ?? FieldValue.delete()` — an
update that OMITS the field clears it, turning an exclusively-owned
categoría GLOBAL. If the wrapper only checked the input when present, an
admin_sucursal owning a categoría could omit the field and pass the Impl's
stored-value check (stored was still `[own]` at tx.get time) while the same
transaction's `tx.update` silently made it global — a privilege-escalation
gap. Implemented the check unconditionally on `datos.sucursalesAsignadas`
(identical shape to `crearCategoria`'s), closing that gap; added the
specific regression test for it (`actualizar-categoria.test.ts`, "admin_sucursal
que omite sucursalesAsignadas al actualizar su propia categoría es
rechazado, sin cambios").

### Issues Found

`npm test` (full suite) has one intermittent, pre-existing failure unrelated
to this diff: `test/triggers/on-aporte-escrito.test.ts`'s "T-1/T-8 · dos
cajeros distintos suman sin pisarse" times out at the 5000ms budget under
full-suite load (shared emulator, `fileParallelism: false`), but passes
11/11 when run in isolation. This file and its source
(`src/triggers/on-aporte-escrito.ts`) are untouched by this slice — same
class of machine-load flakiness already documented in the S2a section above
(a different test, different root cause, not retried into a fix per
AGENTS.md §2's "no retrofit" scope discipline).

### Work Unit Evidence

| Evidence | Value |
|---|---|
| Focused test command and result | `(cd packages/functions && firebase emulators:exec --project demo-conteo-eficiente --only firestore,auth "vitest run test/callables/crear-categoria.test.ts test/callables/actualizar-categoria.test.ts")` → 22/22 passed |
| Runtime harness | Same command — Firestore + Auth emulator, authorization proof runs through `crearCategoria.run(req)`/`actualizarCategoria.run(req)` (the real `onCall` wrappers), not just the Impls |
| Rollback boundary | 2 callable files; revert = both back to unconditional `exigirAdmin` (`actualizarCategoriaImpl` loses its 4th param, with the 5 test call sites' trailing `null` reverted alongside) |

### Closing Checks

| Command | Result |
|---|---|
| `npm run typecheck` | Pass (all workspaces) |
| `npm run lint` | Pass (eslint ., no errors) |
| `npm test` | functions 204/205 (1 pre-existing flake, see Issues Found — isolated re-run 11/11 clean) + web 472/472 + data 103/103 + shared 120/120 + contracts 65/65 |
| Focused command (`crear-categoria.test.ts` + `actualizar-categoria.test.ts`) | Pass — 22/22, reproduced clean |

### Budget

`git diff --numstat` (worktree, after `npx prettier --write` on the 5 changed files):

```
 8   0  docs/diseno/08-contratos-y-cloud-functions.md
16   3  packages/functions/src/callables/actualizar-categoria.ts
 5   2  packages/functions/src/callables/crear-categoria.ts
183 33  packages/functions/test/callables/actualizar-categoria.test.ts
77  2   packages/functions/test/callables/crear-categoria.test.ts
```

Total additions + deletions = **329** (forecast was ~215). Under the 400 hard limit.

### Status

1/1 assigned task (3.1 / S3a) complete. Not proceeding to any other slice
(S3b+) — out of scope for this apply. No commit made per instructions;
candidate is unstaged in the worktree, awaiting RDD receipt/orchestrator review.

### Orchestrator addendum (S2b — misplaced here by a concurrent append)

S2b closed: RDD lineage `review-df094974b51482a1` (review-reliability, 0 findings,
approved + acknowledged); sdd-verify PASS 6/6 (`verify-report-s2b.md`, evidence
`sha256:a5167ed2387e3ca632bd1890e94f262808465d3001fabe6501e28f0cb77fcfde`);
attempt settled complete. Work-unit commits on
`feat/rol-admin-sucursal-cierre-sesion`: `2eb3299` (cerrarSesion gate + tests +
doc 08), `69483e5` (exigirAdminOCajeroDeSesion test pair).

### Orchestrator addendum (S3a)

S3a closed: orchestrator re-ran the functions suite clean (205/205; the writer's
`on-aporte-escrito` timeout did not reproduce). RDD lineage
`review-2fa992f3d914a97d` (review-reliability) approved with 3 informational
WARNINGs, not corrected: (1) premise false — `packages/functions` runs files
sequentially (`fileParallelism: false`); (2)(3) malformed-claim negatives only
assert the rejection, which happens in the role gate before any read. sdd-verify
PASS 8/8 (`verify-report-s3a.md`, evidence
`sha256:8ab17ebe620c69d2d0ebe893d2aa804caa6e3cee3ca3608c2f9c2ef037e23a18`); its
WARNING (length-1 foreign branch) is covered in `exigir-admin.test.ts` (S2a).
Attempt settled complete. Commit `0f97963` on
`feat/rol-admin-sucursal-categoria-crear-actualizar`. Next: S3b (task 3.2).

- [x] 3.2 **S3b** — `desactivarCategoria` + `reactivarCategoria` + `eliminarCategoria`

Worktree: `C:/Users/PC RYZEN/Documents/Proyectos/Sistema inventario-worktrees/feat-rol-admin-sucursal-categoria-desactivar-eliminar`
(branch `feat/rol-admin-sucursal-categoria-desactivar-eliminar`, based on S3a
commit `0f97963`). No commit made — candidate left unstaged in the worktree
per instructions.

### Mode

Strict TDD. Test runner: `(cd packages/functions && firebase emulators:exec
--project demo-conteo-eficiente --only firestore,auth "vitest run
test/callables/desactivar-categoria.test.ts test/callables/reactivar-categoria.test.ts
test/callables/eliminar-categoria.test.ts")`.

### TDD Cycle Evidence

| Step | Evidence |
|---|---|
| RED | Added an `— autorización de sucursal (D2, S3b)` describe block to each of the 3 test files (5 cases each: exclusively-owned affirmative, global-stored negative, shared-stored negative, malformed-claim negative, Gerente regression), proven through `desactivarCategoria.run(req)`/`reactivarCategoria.run(req)`/`eliminarCategoria.run(req)` (D5); `eliminarCategoria`'s block additionally seeds a shared-sucursal categoría that IS in use (a line under an open sesión) to prove the rejection happens before `count()`, not because of a usage mismatch. Also added a trailing `null` (Gerente scope) to the 4+2+4 existing Impl call sites across the 3 files. Ran against the OLD callables (still on unconditional `exigirAdmin`): **3 failed for the right reason** (`Se requiere rol admin.` — the 3 affirmative admin_sucursal cases; the true discriminators, same pattern as S2b/S3a: the old gate already rejects any non-`admin` rol, so negatives/malformed/regression trivially pass either way), 24/27 passed. One test-authoring bug was found and fixed before trusting this RED: the `eliminarCategoria` "in use" seed opened its session on an unrelated random sucursal instead of one of the categoría's own `sucursalesAsignadas`, so no line was actually seeded (`lineaAntes.exists` was `false`) — fixed by opening the session on one of the shared categoría's own sucursales, then RED re-confirmed clean. |
| GREEN | `desactivarCategoriaImpl`/`reactivarCategoriaImpl` each gained a REQUIRED trailing `alcance: AlcanceAdmin` param (D4 pattern, no default) and call `exigirExclusivaDeSucursal(alcance, categoria.get("sucursalesAsignadas"))` right after `tx.get`, before `tx.update` — same placement as S3a's `actualizarCategoriaImpl`. `eliminarCategoriaImpl` also gained the required trailing `alcance` param; when `alcance !== null`, a pre-read (`categoriaRef.get()`, outside any transaction) + `exigirExclusivaDeSucursal` runs BEFORE the `count()` aggregation query, so a denied admin_sucursal caller never reaches the usage-count error message; Gerente (`alcance === null`) skips the pre-read entirely, keeping its original order byte-for-byte. All 3 wrappers now call `exigirAdminDeSucursal(req)` → `alcance` and thread it into their Impl. Re-ran the focused command: **27/27 passed**. |
| REFACTOR | None needed — reuses S3a's existing helper (`exigirExclusivaDeSucursal`) verbatim, no duplication introduced. |

### Files Changed

| File | Action | What Was Done |
|------|--------|---------------|
| `packages/functions/src/callables/desactivar-categoria.ts` | Modified | `desactivarCategoriaImpl` gains required trailing `alcance: AlcanceAdmin`; checks the stored `sucursalesAsignadas` right after `tx.get`, before `tx.update`. Wrapper calls `exigirAdminDeSucursal(req)` → `alcance`, threads it into the Impl. |
| `packages/functions/src/callables/reactivar-categoria.ts` | Modified | Same shape as `desactivarCategoria.ts`. |
| `packages/functions/src/callables/eliminar-categoria.ts` | Modified | `eliminarCategoriaImpl` gains required trailing `alcance: AlcanceAdmin`; when `alcance !== null`, a pre-read + `exigirExclusivaDeSucursal` runs before the existing `count()` guard (new `ponytail:`-style doc comment explains why, next to the existing TOCTOU comment); Gerente path unchanged. Wrapper calls `exigirAdminDeSucursal(req)` → `alcance`, threads it into the Impl. |
| `packages/functions/test/callables/desactivar-categoria.test.ts` | Modified | `sembrarCategoria` gained an optional `sucursalesAsignadas` param; 4 existing Impl call sites now pass a trailing `null` (Gerente scope). Added the 5-case authorization describe block through `desactivarCategoria.run(req)`. |
| `packages/functions/test/callables/reactivar-categoria.test.ts` | Modified | Same shape; 2+2 existing Impl call sites (`desactivarCategoriaImpl`/`reactivarCategoriaImpl`) now pass a trailing `null`. Added the 5-case authorization describe block through `reactivarCategoria.run(req)`. |
| `packages/functions/test/callables/eliminar-categoria.test.ts` | Modified | Same shape; 4 existing Impl call sites now pass a trailing `null`. Added the 5-case authorization describe block through `eliminarCategoria.run(req)`, including the shared-and-in-use ordering test (proves the rejection precedes `count()`); reuses the existing `categoriasCreadas`/`sesionesCreadas`/`sucursalesCreadas` `afterEach` cleanup. |
| `docs/diseno/08-contratos-y-cloud-functions.md` | Modified | Extended the S3a note with one short paragraph for `desactivarCategoria`/`reactivarCategoria`/`eliminarCategoria`'s exclusive-ownership gate, noting `eliminarCategoria`'s pre-`count()` ordering. |

### Deviations from Design

None — matches D2's Interfaces table placement exactly for all 3 callables
(`desactivar/reactivarCategoria | Impl inside tx after tx.get`;
`eliminarCategoria | Impl: when alcance !== null, pre-read + check BEFORE
count()`) and D5 (wrapper-level `.run(req)` tests). Gerente's `alcance ===
null` path in `eliminarCategoriaImpl` is untouched byte-for-byte (no new
read, no new branch executed) — required by the task brief.

### Issues Found

None new. `npm test` (full suite, this session) was clean across all 5
workspaces (117 files, 980 tests) — no reproduction of the intermittent
machine-load flakiness noted in S2a/S3a's addenda.

### Work Unit Evidence

| Evidence | Value |
|---|---|
| Focused test command and result | `(cd packages/functions && firebase emulators:exec --project demo-conteo-eficiente --only firestore,auth "vitest run test/callables/desactivar-categoria.test.ts test/callables/reactivar-categoria.test.ts test/callables/eliminar-categoria.test.ts")` → 27/27 passed |
| Runtime harness | Same command — Firestore + Auth emulator, authorization proof runs through the 3 real `onCall` wrappers via `.run(req)`, not just the Impls |
| Rollback boundary | 3 callable files; revert restores `exigirAdmin` and the original count-then-read order in `eliminarCategoriaImpl` (with the 10 test call sites' trailing `null` reverted alongside) |

### Closing Checks

| Command | Result |
|---|---|
| `npm run typecheck` | Pass (all workspaces) |
| `npm run lint` | Pass (eslint ., no errors) |
| `npm test` | Pass — web 472/472, contracts 103/103, functions 220/220, data 120/120, shared 65/65 (117 files, 980 tests, clean single run) |
| Focused command (3 callable test files) | Pass — 27/27 |

### Budget

`git diff --numstat` (worktree, after `npx prettier --write` on the 7 changed files):

```
 6   0  docs/diseno/08-contratos-y-cloud-functions.md
12   3  packages/functions/src/callables/desactivar-categoria.ts
22   3  packages/functions/src/callables/eliminar-categoria.ts
12   3  packages/functions/src/callables/reactivar-categoria.ts
94   9  packages/functions/test/callables/desactivar-categoria.test.ts
116  9  packages/functions/test/callables/eliminar-categoria.test.ts
98  10  packages/functions/test/callables/reactivar-categoria.test.ts
```

Total additions + deletions = **397** (forecast was ~320). Under the 400 hard limit.

### Status

1/1 assigned task (3.2 / S3b) complete. Not proceeding to any other slice
(S4+) — out of scope for this apply. No commit made per instructions;
candidate is unstaged in the worktree, awaiting RDD receipt/orchestrator review.

### Orchestrator addendum (S3b)

Pre-freeze correction by the orchestrator: `eliminarCategoriaImpl` now also
re-runs `exigirExclusivaDeSucursal` inside the delete transaction, on the
`tx.get` it already did (TOCTOU — the pre-read before `count()` only prevents
the usage-count leak; design D4 rejects a pre-read outside the tx as the only
gate). +2 lines, final budget 399/400; focused 27/27 re-run green. The race
itself has no deterministic test (accepted as WARNING by sdd-verify).
RDD lineage `review-e57206b7672de9c0` (review-reliability) approved with 0
findings, acknowledged/burned. sdd-verify PASS 7/7 (`verify-report-s3b.md`,
evidence `sha256:9e940fb3533a2bc51edc5d70a16ac7db003489dd9d559247135f490ca7c8d3c5`).
Attempt settled complete. Commit `f7d127f` on
`feat/rol-admin-sucursal-categoria-desactivar-eliminar`. Next: S4-foundation (4.1).

## Phase 4: Cajero anti-escalation

- [x] 4.1 **S4-foundation** — contracts + helpers

Worktree: `C:/Users/PC RYZEN/Documents/Proyectos/Sistema inventario-worktrees/feat-rol-admin-sucursal-cajero-contratos`
(branch `feat/rol-admin-sucursal-cajero-contratos`, based on S3b commit `f7d127f`).
No commit made — candidate left unstaged in the worktree per instructions.

### Mode

Strict TDD. Test runners: `(cd contracts && npx vitest run
schemas/crear-cajero.schema.test.ts schemas/actualizar-cajero.schema.test.ts)`
and `(cd packages/functions && firebase emulators:exec --project
demo-conteo-eficiente --only firestore,auth "npx vitest run
test/lib/exigir-admin.test.ts")`.

### TDD Cycle Evidence

| Step | Evidence |
|---|---|
| RED | Added a "cardinalidad de admin_sucursal" describe block to both `crear-cajero.schema.test.ts` and `actualizar-cajero.schema.test.ts` (3 cases each: 1-sucursal affirmative, 0-sucursal negative, 2-sucursal negative). Ran against the OLD schemas (enum still `admin \| cajero`): **2 failed for the right reason** (the affirmative admin_sucursal case — the true discriminator, since the negative cardinality cases already fail on the old enum alone), 19/21 passed. Added `exigirCajeroDeAlcance`/`exigirCajeroObjetivo` describe blocks to `exigir-admin.test.ts` (6 + 6 cases, the latter through a real Auth-emulator `auth.createUser`/`setCustomUserClaims` helper with `afterEach` cleanup). Ran against the OLD `exigir-admin.ts`: **12 failed for the right reason** (`is not a function`), 14/26 passed. |
| GREEN | Widened `RolUsuario` to include `admin_sucursal` (`packages/shared/src/models/usuario.ts`). Widened both schemas' `rol` enum and added a `.refine` enforcing `rol !== "admin_sucursal" \|\| sucursalesAsignadas.length === 1` (path `sucursalesAsignadas`). Added `exigirCajeroDeAlcance(alcance, rol, sucursales)` (no-op on Gerente; else `rol === "cajero"` + reuses `exigirExclusivaDeSucursal`) and `exigirCajeroObjetivo(auth, alcance, uid)` (no-op on Gerente WITHOUT reading Auth; else `auth.getUser(uid)` → `not-found` on missing user → delegates the claim check to `exigirCajeroDeAlcance` on `customClaims.rol`/`customClaims.sucursales`) to `exigir-admin.ts`. Re-ran both focused commands: **21/21** (contracts) and **26/26** (functions) passed. |
| REFACTOR | None needed — `exigirCajeroObjetivo` reuses `exigirCajeroDeAlcance` for its claim check, `exigirCajeroDeAlcance` reuses `exigirExclusivaDeSucursal`; no duplication introduced. |

### Files Changed

| File | Action | What Was Done |
|------|--------|---------------|
| `packages/shared/src/models/usuario.ts` | Modified | `RolUsuario` widened from `"admin" \| "cajero"` to `"admin" \| "admin_sucursal" \| "cajero"`. |
| `contracts/schemas/crear-cajero.schema.ts` | Modified | `rol` enum gains `admin_sucursal`; added `.refine` cardinality rule (D3/D-6). |
| `contracts/schemas/actualizar-cajero.schema.ts` | Modified | Same shape as `crear-cajero.schema.ts`. |
| `contracts/schemas/crear-cajero.schema.test.ts` | Modified | Added 3-case cardinality describe block. |
| `contracts/schemas/actualizar-cajero.schema.test.ts` | Modified | Added 3-case cardinality describe block. |
| `packages/functions/src/lib/exigir-admin.ts` | Modified | Added `exigirCajeroDeAlcance(alcance, rol, sucursales): void` and `exigirCajeroObjetivo(auth, alcance, uid): Promise<void>` next to the existing D1/D2 helpers. Neither is wired into any callable yet (additive only, per task scope). |
| `packages/functions/test/lib/exigir-admin.test.ts` | Modified | Added Firestore/Auth emulator app init (`initializeApp`/`getAuth`), a 6-case `exigirCajeroDeAlcance` describe block, and a 6-case `exigirCajeroObjetivo` describe block with a local `sembrarUsuarioAuth` helper (real `auth.createUser` + `setCustomUserClaims`) and its own `afterEach` cleanup of every uid it creates. |

### Deviations from Design

None — `exigirCajeroDeAlcance`/`exigirCajeroObjetivo` match the Interfaces block's
signatures verbatim, and `exigirCajeroObjetivo` reads the target's Auth custom
claims (`customClaims.rol`/`customClaims.sucursales`, doc 09 §2) exactly as D3
requires, never `usuarios/{uid}`. `docs/diseno/03-modelo-de-dominio.md` already
had the widened `rol` enum from S1 (line 40: `"admin \| admin_sucursal \|
cajero"`) — no further doc change was needed there. `docs/diseno/08-contratos-y-cloud-functions.md`
does not carry a catalog list of `exigir-admin.ts` helpers (only inline notes
per prior slice), so no doc 08 edit was made for this additive-only slice.

### Issues Found

None. Full `npm test` ran clean in a single pass across all 5 workspaces (no
repeat of the S2a/S3a/S3b machine-load flakiness noted in earlier addenda).

### Work Unit Evidence

| Evidence | Value |
|---|---|
| Focused test command and result | `(cd contracts && npx vitest run schemas/crear-cajero.schema.test.ts schemas/actualizar-cajero.schema.test.ts)` → 21/21 passed; `(cd packages/functions && firebase emulators:exec --project demo-conteo-eficiente --only firestore,auth "npx vitest run test/lib/exigir-admin.test.ts")` → 26/26 passed |
| Runtime harness | Firestore + Auth emulator — `exigirCajeroObjetivo`'s target-claim proof runs through real `auth.createUser`/`setCustomUserClaims`/`getUser`, not a mock |
| Rollback boundary | Additive type/schema/helper only, unused until S4-crear+; revert is a no-op for any running callable |

### Closing Checks

| Command | Result |
|---|---|
| `npm run typecheck` | Pass (all workspaces) — the `RolUsuario` widening compiled clean everywhere with no exhaustive-switch/`Record<RolUsuario,...>` fallout found in the codebase |
| `npm run lint` | Pass (eslint ., no errors) |
| `npm test` | Pass — web 472/472, data 103/103, functions 232/232, shared 120/120, contracts 71/71 (single clean run) |
| Focused commands | Pass — 21/21 (contracts) + 26/26 (functions) |

### Budget

`git diff --numstat` (worktree, after `npx prettier --write` on the 7 changed files):

```
29   0  contracts/schemas/actualizar-cajero.schema.test.ts
12   6  contracts/schemas/actualizar-cajero.schema.ts
29   0  contracts/schemas/crear-cajero.schema.test.ts
13   7  contracts/schemas/crear-cajero.schema.ts
47   0  packages/functions/src/lib/exigir-admin.ts
87   1  packages/functions/test/lib/exigir-admin.test.ts
 1   1  packages/shared/src/models/usuario.ts
```

Total additions + deletions = **233** (forecast was ~310). Under the 400 hard limit.

### Status

1/1 assigned task (4.1 / S4-foundation) complete. Not proceeding to any other
slice (S4-crear+) — out of scope for this apply. No commit made per
instructions; candidate is unstaged in the worktree, awaiting RDD
receipt/orchestrator review.

### Orchestrator addendum (S4-foundation)

The first writer run was interrupted by a session end with no changes landed;
it was resumed and completed. RDD lineage `review-8ee6c432dbbcd99b`
(review-reliability) approved with 0 findings, acknowledged/burned. sdd-verify
PASS 10/10 (`verify-report-s4-foundation.md`, evidence
`sha256:b3ac892c9bc2c233f05449e5b6f71512b562691ce74383d20bf76a48209523ba`).
Attempt settled complete. Work-unit commits on
`feat/rol-admin-sucursal-cajero-contratos`: `8cbd972` (RolUsuario), `c13ab76`
(schema cardinality), `f575ef5` (exigirCajeroDeAlcance / exigirCajeroObjetivo).
Next: S4-crear (task 4.2).

- [x] 4.2 **S4-crear** — `crearCajero` anti-escalation wiring

Worktree: `C:/Users/PC RYZEN/Documents/Proyectos/Sistema inventario-worktrees/feat-rol-admin-sucursal-crear-cajero`
(branch `feat/rol-admin-sucursal-crear-cajero`, based on S4-foundation commit
`f575ef5`). No commit made — candidate left unstaged in the worktree per
instructions. sdd-attempt token `sha256:f85f302d…fb1de` (request-id
`s4-crear-20260915-a`, gentle-ai 2.9.1, acquired clean on first try).

### Mode

Strict TDD. Test runner: `(cd packages/functions && firebase emulators:exec
--project demo-conteo-eficiente --only firestore,auth "npx vitest run
test/callables/crear-cajero.test.ts")`.

### TDD Cycle Evidence

| Step | Evidence |
|---|---|
| RED | Added a `crearCajero — autorización de sucursal (D3, S4-crear)` describe block (6 cases, proven through `crearCajero.run(req)`, D5) with its own `reqCrearCajero` fake-`CallableRequest` builder, an `afirmarSinEfecto(correo)` absence helper (`getUserByEmail` throws + zero `usuarios` perfiles for that correo), and an `afterEach` deleting every uid the block creates (Auth + perfil + auditoria). Ran against the OLD `crear-cajero.ts` (still unconditional `exigirAdmin`): **1 failed for the right reason** (`Se requiere rol admin.` — the own-sucursal affirmative; the true discriminator, same pattern as S2b/S3a: the old gate already rejects any non-`admin` rol, so the 2 escalation + sucursal + malformed negatives and the Gerente regression trivially pass either way), 8/9 passed. |
| GREEN | `crear-cajero.ts` wrapper: `exigirAdminDeSucursal(req)` → `alcance`, then after `validar`, `exigirCajeroDeAlcance(alcance, datos.rol, datos.sucursalesAsignadas)` before `crearCajeroImpl` (no Auth/Firestore write precedes the check). `crearCajeroImpl` untouched. Re-ran the focused command: **9/9 passed**. |
| REFACTOR | None needed — reuses S4-foundation's existing helpers verbatim, no duplication introduced. |

### Files Changed

| File | Action | What Was Done |
|------|--------|---------------|
| `packages/functions/src/callables/crear-cajero.ts` | Modified | Wrapper now calls `exigirAdminDeSucursal(req)` instead of `exigirAdmin(req)`, then `exigirCajeroDeAlcance(alcance, datos.rol, datos.sucursalesAsignadas)` after `validar` per design's Interfaces table (`crearCajero \| wrapper: exigirCajeroDeAlcance(alcance, datos.rol, datos.sucursalesAsignadas)`). `crearCajeroImpl` untouched. |
| `packages/functions/test/callables/crear-cajero.test.ts` | Modified | Added the 6-case authorization describe block through `crearCajero.run(req)` (own-sucursal affirmative with claims+perfil asserts; `rol: "admin"` escalation negative; `rol: "admin_sucursal"` escalation negative; foreign+extra sucursal negative; 0-/2-sucursal malformed-claim negative; Gerente regression). Every negative asserts absence of effect via `afirmarSinEfecto`. |

### Deviations from Design

None — matches D3's Interfaces table placement exactly (input-level
anti-escalation in the wrapper, before any side effect). No doc 08 edit:
task 4.2's Files list names only the callable + its test, and doc 08 carries
no catalog of cajero gates to extend (same rationale as S4-foundation's
no-doc-08 decision).

### Issues Found

None. Full `npm test` green in a single clean run across all 5 workspaces —
no repeat of the S2a/S3a machine-load flakiness.

### Work Unit Evidence

| Evidence | Value |
|---|---|
| Focused test command and result | `(cd packages/functions && firebase emulators:exec --project demo-conteo-eficiente --only firestore,auth "npx vitest run test/callables/crear-cajero.test.ts")` → 9/9 passed (3 pre-existing Impl + 6 new wrapper) |
| Runtime harness | Same command — Firestore + Auth emulator, authorization proof runs through `crearCajero.run(req)` (the real `onCall` wrapper), not just the Impl |
| Rollback boundary | `crear-cajero.ts`'s 4-line wrapper change; revert = `crearCajero` back to unconditional `exigirAdmin(req)` |

### Closing Checks

| Command | Result |
|---|---|
| `npm run typecheck` | Pass (all workspaces) |
| `npm run lint` | Pass (eslint ., no errors) |
| `npm test` | Pass — web 472/472, data 103/103, functions 238/238 (32 files, incl. `crear-cajero.test.ts` 9/9), shared 120/120, contracts 71/71; exit 0, single clean run |
| Focused command (`crear-cajero.test.ts`) | Pass — 9/9 |

### Budget

`git diff --numstat` (worktree, after `npx prettier --write` on the 2 changed files):

```
 6   2  packages/functions/src/callables/crear-cajero.ts
153   2  packages/functions/test/callables/crear-cajero.test.ts
```

Total additions + deletions = **163** (forecast was ~180). Under the 400 hard limit.

### Status

1/1 assigned task (4.2 / S4-crear) complete. Not proceeding to any other slice
(S4-actualizar+) — out of scope for this apply. No commit made per
instructions; candidate is unstaged in the worktree, awaiting RDD
receipt/orchestrator review.

### Orchestrator addendum (S4-crear)

RDD ran natively in this session (gentle-ai 2.9.1, no Claude Code round-trip
needed): lineage `review-a73e795f7741c5af` (review-reliability, order 0),
frozen 2 files / 163 lines, verdict **approved** with 4 advisory findings
(R3-001/R3-002 WARNING, R3-003/R3-004 SUGGESTION), all disposition
informational -- no correction opened or consumed, candidate byte-identical.
sdd-verify PASS 8/8 (`verify-report-s4-crear.md`, evidence
`sha256:f2c1eb8ee17278f572615864c4dbaa9ed6796945118daaca33722a1693f27fb4`,
validated with `sdd-verify-validate`). Attempt settled complete. Commit
`13f0793` on `feat/rol-admin-sucursal-crear-cajero` (single work unit:
`feat(functions): acotar crearCajero al alcance de admin_sucursal`; pre-commit
hook printed the expected informative `unmanaged` gate). Next: S4-actualizar
(task 4.3).

## Task 4.3 — S4-actualizar

- [x] 4.3 **S4-actualizar** — `actualizarCajero` anti-escalation + target-claims wiring

Worktree: `C:/Users/PC RYZEN/Documents/Proyectos/Sistema inventario-worktrees/feat-rol-admin-sucursal-actualizar-cajero`
(branch `feat/rol-admin-sucursal-actualizar-cajero`, based on S4-crear commit
`13f0793`). No commit made — candidate left unstaged in the worktree per
instructions.

### Mode

Strict TDD. Test runner: `(cd packages/functions && firebase emulators:exec
--project demo-conteo-eficiente --only firestore,auth "npx vitest run
test/callables/actualizar-cajero.test.ts")`.

### TDD Cycle Evidence

| Step | Evidence |
|---|---|
| RED | Added an `actualizarCajero — autorización de sucursal (D3, S4-actualizar)` describe block (6 cases, proven through `actualizarCajero.run(req)`, D5) with its own `reqActualizarCajero` fake-`CallableRequest` builder, a `sembrarCajeroDe(sucursales)` seeding helper (reuses `crearCajeroImpl`), and an `afterEach` deleting every uid the block creates (Auth + perfil + auditoria) — same pattern as `crear-cajero.test.ts`'s S4-crear block. Ran against the OLD `actualizar-cajero.ts` (still unconditional `exigirAdmin`): **1 failed for the right reason** (`Se requiere rol admin.` — the own-sucursal affirmative; the true discriminator, same pattern as S4-crear: the old gate already rejects any non-`admin` caller rol, so the 2 escalation + shared-sucursal + foreign + malformed-claim negatives and the Gerente regression trivially pass either way regardless of the new logic), 8/9 passed. |
| GREEN | `actualizar-cajero.ts` wrapper: `exigirAdminDeSucursal(req)` → `alcance`, then after `validar`, `exigirCajeroDeAlcance(alcance, datos.rol, datos.sucursalesAsignadas)` (input anti-escalation), then `await exigirCajeroObjetivo(getAuth(), alcance, datos.uid)` (target's CURRENT Auth claims) before `actualizarCajeroImpl` — exact placement from design.md's Interfaces table line for `actualizarCajero`. `actualizarCajeroImpl` untouched. Re-ran the focused command: **9/9 passed**. |
| REFACTOR | None needed — reuses S4-foundation's existing helpers (`exigirAdminDeSucursal`, `exigirCajeroDeAlcance`, `exigirCajeroObjetivo`) verbatim, no new abstraction. |

### Files Changed

| File | Action | What Was Done |
|------|--------|---------------|
| `packages/functions/src/callables/actualizar-cajero.ts` | Modified | Wrapper now calls `exigirAdminDeSucursal(req)` instead of `exigirAdmin(req)`, then `exigirCajeroDeAlcance(alcance, datos.rol, datos.sucursalesAsignadas)` after `validar`, then `await exigirCajeroObjetivo(getAuth(), alcance, datos.uid)` before `actualizarCajeroImpl` — matches design's Interfaces table (`actualizarCajero \| wrapper: the input check + await exigirCajeroObjetivo(getAuth(), alcance, datos.uid)`). `actualizarCajeroImpl` untouched. |
| `packages/functions/test/callables/actualizar-cajero.test.ts` | Modified | Added the 6-case authorization describe block through `actualizarCajero.run(req)`: own-sucursal affirmative; `rol: "admin"`/`"admin_sucursal"` input escalation negative (profile+claims unchanged); shared-sucursal target negative (target's current claims span 2 sucursales including the caller's — profile+claims unchanged); foreign target negative (target's current claims are a different sucursal entirely — profile+claims unchanged); caller claim malformed (0 or 2 sucursales) negative (`auth.getUser` spy proves the target is never even read); Gerente regression. |

### Deviations from Design

None — matches D3's Interfaces table placement exactly: input-level
anti-escalation (`exigirCajeroDeAlcance` on `datos`) runs first in the
wrapper, then the target-claims check (`exigirCajeroObjetivo`) right after,
both before any Auth/Firestore write in `actualizarCajeroImpl`. No doc 08
edit, same rationale as S4-crear (no catalog of cajero gates to extend
there).

### Issues Found

None. Full `npm test` green in a single clean run across all 5 workspaces.

### Work Unit Evidence

| Evidence | Value |
|---|---|
| Focused test command and result | `(cd packages/functions && firebase emulators:exec --project demo-conteo-eficiente --only firestore,auth "npx vitest run test/callables/actualizar-cajero.test.ts")` → 10/10 passed (3 pre-existing Impl + 7 new wrapper; the writer measured 9/9 before the orchestrator's 7th case) |
| Runtime harness | Same command — Firestore + Auth emulator, authorization proof runs through `actualizarCajero.run(req)` (the real `onCall` wrapper), not just the Impl; the target-claims check reads real Auth state via `auth.getUser` |
| Rollback boundary | `actualizar-cajero.ts`'s wrapper change (3 helper calls added); revert = `actualizarCajero` back to unconditional `exigirAdmin(req)` |

### Closing Checks

| Command | Result |
|---|---|
| `npm run typecheck` | Pass (all workspaces) |
| `npm run lint` | Pass (eslint ., no errors) |
| `npm test` | Pass — exit 0, single clean run across all 5 workspaces. Writer's run: web 472/472, data 103/103, functions 244/244, shared 120/120, contracts 71/71. Re-run after the orchestrator's 7th case: exit 0 again. |
| Focused command (`actualizar-cajero.test.ts`) | Pass — 10/10 |

### Budget

`git diff --numstat` (worktree, after `npx prettier --write` on the 2 changed files):

```
11   2  packages/functions/src/callables/actualizar-cajero.ts
238   3  packages/functions/test/callables/actualizar-cajero.test.ts
```

Total additions + deletions = **254** (forecast was ~220). Under the 400 hard
limit. The writer measured 226 over 6 new tests; the orchestrator added a 7th
case after the first RDD round (see the addendum below), which is the difference.

### Status

1/1 assigned task (4.3 / S4-actualizar) complete. Not proceeding to any other
slice (S4-desactivar-reactivar/eliminar) — out of scope for this apply. No
commit made per instructions; candidate is unstaged in the worktree, awaiting
RDD receipt/orchestrator review.

### Orchestrator addendum (S4-actualizar)

Two RDD rounds ran natively in this session (gentle-ai 2.9.1), both medium risk,
both lens `review-reliability` order 0, both **approved** with zero blocking
findings and no correction opened or consumed.

Round 1 — lineage `review-eaf068c01795bc5b`, frozen 2 files / 226 lines
(correction budget 113), approved and acknowledged (authority burned). Its
advisory evidence flagged a real coverage gap: no test exercised an
`admin_sucursal` request that keeps `rol: "cajero"` but widens
`sucursalesAsignadas` beyond its own sucursal for an in-scope target. Task 4.3's
RED list asks for "input escalation rejected" and the writer had implemented
only the `rol` half. The guard itself was already correct
(`exigirCajeroDeAlcance` → `exigirExclusivaDeSucursal`), but the negative
control was missing, and it is a genuine discriminator: with
`exigirCajeroDeAlcance` removed, `exigirCajeroObjetivo` alone lets this case
through, because the target is in scope. The orchestrator added that one case
(+28 lines) rather than deferring it — a missing negative control on the
change's central anti-escalation invariant is not a follow-up.

Round 2 — lineage `review-78e28241c236e1c1`, frozen 2 files / 254 lines
(correction budget 127), approved with 2 informational findings and
acknowledged (authority burned):

| # | Severity | Claim | Disposition |
|---|---|---|---|
| R3-001 | WARNING | Check-then-act window between `exigirCajeroObjetivo`'s Auth claims read and `actualizarCajeroImpl`'s write; no transaction links them. | Follow-up. **Not** portable from S3b's `eliminarCategoria` fix: that one re-checked inside the same Firestore transaction, but this check reads Firebase Auth custom claims — a separate system — so no single Firestore tx can close it (confirmed independently by sdd-verify). |
| R3-002 | SUGGESTION | No wrapper-level test for `exigirCajeroObjetivo` against a uid absent from Auth (`not-found`). | Follow-up. The helper's `not-found` path is already unit-tested in S4-foundation (`test/lib/exigir-admin.test.ts`); only the black-box path through `actualizarCajero.run` is unproven. |

sdd-verify **PASS** (`verify-report-s4-actualizar.md`), 1/1 requirements, 9/9
scenarios, 0 CRITICAL, focused 10/10 exit 0, `npm run typecheck` exit 0;
evidence
`sha256:cf5d0c9fcf84f613daf8889fedf602ba0173fc44424e63582e92f9a84193c908`,
validated with `sdd-verify-validate`. Verify also caught the writer's stale test
count and budget figure in this section (6/226 vs the actual 7/254, caused by
the orchestrator's added case); both are corrected above. Attempt settled
complete. Next: S4-desactivar-reactivar (task 4.4).

## Task 4.4 — S4-desactivar-reactivar

- [x] 4.4 **S4-desactivar-reactivar** — `desactivarCajero` + `reactivarCajero` target-claims wiring

Worktree: `C:/Users/PC RYZEN/Documents/Proyectos/Sistema inventario-worktrees/feat-rol-admin-sucursal-desactivar-reactivar-cajero`
(branch `feat/rol-admin-sucursal-desactivar-reactivar-cajero`, based on
S4-actualizar commit `8d4c8b9`). No commit made — candidate left unstaged in
the worktree per instructions.

### Mode

Strict TDD. Test runner: `(cd packages/functions && firebase emulators:exec
--project demo-conteo-eficiente --only firestore,auth "npx vitest run
test/callables/desactivar-cajero.test.ts test/callables/reactivar-cajero.test.ts")`.

### TDD Cycle Evidence

| Step | Evidence |
|---|---|
| RED | Added a `desactivarCajero — autorización de sucursal (D3, S4-desactivar-reactivar)` block (6 cases) to `desactivar-cajero.test.ts` and a `reactivarCajero — autorización de sucursal (D3, S4-desactivar-reactivar)` block (6 cases) to `reactivar-cajero.test.ts`, both proven through `.run(req)` (D5), reusing `actualizar-cajero.test.ts`'s pattern verbatim: `reqXCajero` fake-`CallableRequest` builder, a `sembrarCajeroDe`/`sembrarCajeroDesactivadoDe` seeding helper (reuses `crearCajeroImpl`, and for reactivar also `desactivarCajeroImpl` so the target starts disabled), and an `afterEach` deleting every uid the block creates (Auth + perfil + auditoria). Ran against the OLD unmodified callables (both still unconditional `exigirAdmin`): **exactly 2 failed, both for the same reason** — `Se requiere rol admin.` on each callable's own-sucursal affirmative (the true discriminator, same pattern as S4-actualizar/S4-crear: the old gate already rejects any non-`admin` caller rol, so all 5 remaining negatives per callable — both escalation claims, shared-sucursal, foreign, malformed-claim — plus the Gerente regression trivially pass either way regardless of the new logic). 18/20 passed. |
| GREEN | Both wrappers changed identically: `exigirAdminDeSucursal(req)` → `alcance`, then after `validar`, `await exigirCajeroObjetivo(getAuth(), alcance, datos.uid)` before the respective `Impl` call — exact placement from design.md's Interfaces table line for `desactivar/reactivar/eliminarCajero`. No input-level `exigirCajeroDeAlcance` call: per the task brief, these inputs carry only `{ uid }`, so there is nothing to anti-escalate at the input level. Both `Impl` functions untouched. Re-ran the focused command: **20/20 passed**. |
| REFACTOR | None needed — reuses S4-foundation's existing `exigirAdminDeSucursal`/`exigirCajeroObjetivo` verbatim, no new abstraction. The two wrappers and the two test blocks are near-identical by design (same invariant, same shape); per the ponytail constraint this stayed as duplication inside each file, no cross-file test utility was built. |

### Files Changed

| File | Action | What Was Done |
|------|--------|---------------|
| `packages/functions/src/callables/desactivar-cajero.ts` | Modified | Wrapper now calls `exigirAdminDeSucursal(req)` instead of `exigirAdmin(req)`, then `await exigirCajeroObjetivo(getAuth(), alcance, datos.uid)` before `desactivarCajeroImpl`. `desactivarCajeroImpl` untouched. |
| `packages/functions/src/callables/reactivar-cajero.ts` | Modified | Same wrapper change: `exigirAdminDeSucursal(req)` + `await exigirCajeroObjetivo(getAuth(), alcance, datos.uid)` before `reactivarCajeroImpl`. `reactivarCajeroImpl` untouched. |
| `packages/functions/test/callables/desactivar-cajero.test.ts` | Modified | Added a 6-case authorization describe block through `desactivarCajero.run(req)`: own-sucursal affirmative; target-claims escalation (`admin` AND `admin_sucursal`, both asserted in one test) rejected with no side effect (`auth.updateUser`/`revokeRefreshTokens` never called, `activo` unchanged); shared-sucursal target rejected, no write; foreign target rejected, no write; caller claim malformed (0 or 2 sucursales) rejected before reading the target (`auth.getUser` spy proves it); Gerente regression. |
| `packages/functions/test/callables/reactivar-cajero.test.ts` | Modified | Same 6-case shape through `reactivarCajero.run(req)`, seeding via `sembrarCajeroDesactivadoDe` (seed → `desactivarCajeroImpl` → target starts disabled but still carries `rol: cajero` + its sucursal in claims, confirmed by the affirmative test's `customClaims` assertion). Same escalation/shared/foreign/malformed/Gerente shape as the desactivar block, asserting `activo` stays `false` (the seeded disabled state) instead of `true` on every negative. |

### Deviations from Design

None — matches D3's Interfaces table placement exactly for
`desactivar/reactivar/eliminarCajero`: `await exigirCajeroObjetivo(...)` runs
before every side effect, in the wrapper, before `Impl`. No input-level
`exigirCajeroDeAlcance` call, per the task's explicit instruction that these
two inputs carry only `{ uid }` (no `rol`/`sucursalesAsignadas` to
anti-escalate at the input level, unlike `crearCajero`/`actualizarCajero`).

### Issues Found

None. Confirmed the non-obvious detail called out in the task brief:
`desactivarCajeroImpl` never clears custom claims, so a disabled target's
`auth.getUser(uid).customClaims` still resolves to `{ rol: "cajero",
sucursales: [...] }` — the reactivar affirmative test asserts this directly,
and it is what lets `exigirCajeroObjetivo` correctly admit an
already-disabled own-sucursal target for `reactivarCajero`.

### Work Unit Evidence

| Evidence | Value |
|---|---|
| Focused test command and result | `(cd packages/functions && firebase emulators:exec --project demo-conteo-eficiente --only firestore,auth "npx vitest run test/callables/desactivar-cajero.test.ts test/callables/reactivar-cajero.test.ts")` → 20/20 passed. `desactivar-cajero.test.ts`: 9 total (3 pre-existing Impl/session tests + 6 new authorization tests). `reactivar-cajero.test.ts`: 11 total (5 pre-existing Impl tests + 6 new authorization tests). |
| Runtime harness | Same command — Firestore + Auth emulator, authorization proof runs through `desactivarCajero.run(req)` / `reactivarCajero.run(req)` (the real `onCall` wrapper), not just the Impl; the target-claims check reads real Auth state via `auth.getUser`, and the reactivar affirmative round-trips through a real prior `desactivarCajeroImpl` call to prove claims survive |
| Rollback boundary | Each callable file's single wrapper edit (2 lines added, 1 import changed); revert = both `desactivarCajero`/`reactivarCajero` back to unconditional `exigirAdmin(req)` |

### Closing Checks

| Command | Result |
|---|---|
| `npm run typecheck` | Pass — all workspaces (web, data, functions, shared, contracts, tools), no errors printed |
| `npm run lint` | Pass — `eslint .`, no output/errors |
| `npm test` | Pass — exit 0. Visible tail (last 120 lines, web/data output scrolled past the capture window): functions 32 files / 257 tests passed, shared 8 files / 120 tests passed, contracts 12 files / 71 tests passed. No failures anywhere in the run. |
| Focused command (`desactivar-cajero.test.ts` + `reactivar-cajero.test.ts`) | Pass — 20/20, re-confirmed after `prettier --write` reformatted the 2 new test files (line-wrapping only, no logic change) |

### Budget

`git diff --numstat` (worktree, after `npx prettier --write` on all 4 changed files):

```
5    2  packages/functions/src/callables/desactivar-cajero.ts
7    2  packages/functions/src/callables/reactivar-cajero.ts
155  3  packages/functions/test/callables/desactivar-cajero.test.ts
161  2  packages/functions/test/callables/reactivar-cajero.test.ts
```

Total additions + deletions = **337** (forecast was ~280, design.md estimated
~280). Under the 400 hard limit.

### Status

1/1 assigned task (4.4 / S4-desactivar-reactivar) complete. Not proceeding to
any other slice (S4-eliminar/S5/S6) — out of scope for this apply. No commit
made per instructions; candidate is unstaged in the worktree, awaiting
RDD receipt/orchestrator review. `tasks.md` NOT marked `[x]` per instructions
(orchestrator's responsibility). Next: S4-eliminar (task 4.5).

### Orchestrator addendum (S4-desactivar-reactivar)

RDD ran natively in one round (gentle-ai 2.9.1): lineage
`review-837d76a43c174959`, medium risk, lens `review-reliability` order 0,
frozen 4 files / 337 lines (correction budget 169), **approved** with 3
informational findings, no correction opened or consumed, candidate
byte-identical. Acknowledged; authority burned.

The orchestrator reviewed the production diff before the START and confirmed
task 4.4's RED list is fully covered this time — 6 cases per callable, with both
escalation claim values (`admin` and `admin_sucursal`) asserted, absence of
effect proven via `auth.updateUser`/`revokeRefreshTokens` spies plus an
unchanged `activo`, and the malformed-claim case proving `auth.getUser` is never
reached. No orchestrator-added case was needed (unlike S4-actualizar).

| # | Severity | Claim | Disposition |
|---|---|---|---|
| R3-001 | WARNING | `desactivarCajero`: the new `exigirCajeroObjetivo` call adds an Auth-`not-found` path no wrapper test exercises. | Follow-up — see the consolidated item below. |
| R3-002 | WARNING | `reactivarCajero`: same gap. | Follow-up — same item. |
| R3-003 | SUGGESTION | Check-then-act window between the Auth claims read and the Impl mutation. | Follow-up. Same cross-system TOCTOU as S4-actualizar's R3-001; not closable by a Firestore transaction because the check reads Firebase Auth. |

**Consolidated follow-up (spans slices).** The untested wrapper-level
Auth-`not-found` path now affects `actualizarCajero`, `desactivarCajero` and
`reactivarCajero`, and will affect `eliminarCajero` after S4-eliminar. The
disposition is deliberately consistent across all of them: the helper's
`not-found` branch is already unit-tested in S4-foundation
(`test/lib/exigir-admin.test.ts`), no task's RED list asks for the black-box
path, and no behavior regression was found. Recommended: close all four in one
small cleanup slice after S4-eliminar (~12 lines per callable, one RDD cycle)
rather than patching slice by slice.

sdd-verify **PASS WITH WARNINGS** (`verify-report-s4-desactivar-reactivar.md`),
2/2 requirements, 11/11 scenarios, 0 CRITICAL, focused 20/20 exit 0 (9 in
`desactivar-cajero.test.ts`, 11 in `reactivar-cajero.test.ts`),
`npm run typecheck` exit 0; evidence
`sha256:94f486b7d0ac04665090def6c4a04d7001bdfef03583bab69a7ac50097d121ec`,
validated with `sdd-verify-validate`. It independently reproduced the 337-line
budget and the test counts — no drift this time.

**New finding from verify, not raised by RDD (WARNING, not a blocker).** The
orchestrator asked verify to check whether the new Auth-keyed pre-check changes
observable `not-found` behavior, since `reactivarCajeroImpl` previously keyed
`not-found` on a missing *Firestore profile* while `exigirCajeroObjetivo` keys
it on a missing *Auth user*. Result:

- `desactivarCajero`: no change. Its only `not-found` condition was already
  Auth-keyed (via `auth.updateUser`), so the pre-check yields byte-identical
  rejection semantics, only earlier.
- `reactivarCajero`: a genuine new asymmetry on an **orphan** target (Auth user
  deleted, Firestore profile present). An `admin_sucursal` caller now fails
  early and cleanly with `not-found` and zero side effects. A Gerente still
  takes the untouched pre-existing path: the Firestore transaction commits and
  only then does the final `auth.updateUser` throw.

The asymmetry fails in the safer direction and no spec scenario covers orphan
targets, so it is not a spec violation for this slice. Note that the Gerente
partial-commit-then-throw is **pre-existing** behavior in
`reactivarCajeroImpl`, not introduced here; it is worth its own issue outside
this change.

Attempt settled complete. Commit `d92a173` on
`feat/rol-admin-sucursal-desactivar-reactivar-cajero` (single work unit,
mirroring S3b's `desactivar/reactivar/eliminarCategoria` commit shape). Next:
S4-eliminar (task 4.5).

## Task 4.5 — S4-eliminar

- [ ] 4.5 **S4-eliminar** — `eliminarCajero` target-claims wiring (not marked
      `[x]` in `tasks.md`, per instructions — orchestrator's responsibility)

Worktree: `C:/Users/PC RYZEN/Documents/Proyectos/Sistema inventario-worktrees/feat-rol-admin-sucursal-eliminar-cajero`
(branch `feat/rol-admin-sucursal-eliminar-cajero`, based on
S4-desactivar-reactivar commit `d92a173`). No commit made — candidate left
unstaged in the worktree per instructions.

### Mode

Strict TDD. Test runner: `(cd packages/functions && firebase emulators:exec
--project demo-conteo-eficiente --only firestore,auth "npx vitest run
test/callables/eliminar-cajero.test.ts")`.

### TDD Cycle Evidence

| Step | Evidence |
|---|---|
| RED | Added an `eliminarCajero — autorización de sucursal (D3, S4-eliminar)` block (7 cases) to `eliminar-cajero.test.ts`, proven through `eliminarCajero.run(req)` (D5), reusing `desactivar-cajero.test.ts`'s pattern verbatim: `reqEliminarCajero` fake-`CallableRequest` builder, a `sembrarCajeroDe` seeding helper (reuses `crearCajeroImpl`), and an `afterEach` deleting every uid/sesión the block creates (Auth + perfil + auditoria + sesiones). Ran against the OLD unmodified callable (still unconditional `exigirAdmin`): **exactly 2 of 17 failed, both for the same reason** — `Se requiere rol admin.` on the own-sucursal affirmative and on the admin_sucursal orphan-target case (both true discriminators, same shape as S4-desactivar-reactivar/S4-actualizar: the old gate already rejects any non-`admin` caller rol with `permission-denied`, so the 3 remaining wrapper negatives — escalation, shared-sucursal-in-use, foreign — plus the Gerente affirmative and the Gerente-orphan regression trivially pass either way regardless of the new logic, since Gerente's `rol === "admin"` already satisfied the old gate and admin_sucursal's rejection already happened to land on `permission-denied` for the wrong reason). 15/17 passed. |
| GREEN | Wrapper changed identically in shape to S4-desactivar-reactivar: `exigirAdminDeSucursal(req)` → `alcance`, then after `validar`, `await exigirCajeroObjetivo(getAuth(), alcance, datos.uid)` before `eliminarCajeroImpl` — exact placement from design.md's Interfaces table line for `desactivar/reactivar/eliminarCajero`. No input-level `exigirCajeroDeAlcance` call: the input carries only `{ uid }`. `eliminarCajeroImpl` completely untouched — unlike S3b's `eliminarCategoria`, no Impl-internal reorder was needed here (see Deviations below for why). Re-ran the focused command: **17/17 passed**. |
| REFACTOR | None needed — reuses S4-foundation's existing `exigirAdminDeSucursal`/`exigirCajeroObjetivo` verbatim, no new abstraction, no new helper file. |

### Files Changed

| File | Action | What Was Done |
|------|--------|---------------|
| `packages/functions/src/callables/eliminar-cajero.ts` | Modified | Wrapper now calls `exigirAdminDeSucursal(req)` instead of `exigirAdmin(req)`, then `await exigirCajeroObjetivo(getAuth(), alcance, datos.uid)` before `eliminarCajeroImpl`. `eliminarCajeroImpl` untouched (import of `exigirAdmin` replaced by `exigirAdminDeSucursal`/`exigirCajeroObjetivo`). |
| `packages/functions/test/callables/eliminar-cajero.test.ts` | Modified | Added a 7-case authorization describe block through `eliminarCajero.run(req)`: own-sucursal affirmative; target-claims escalation (`admin` and `admin_sucursal`, both asserted in one test) rejected with no side effect (`auth.deleteUser` never called, profile survives); shared-sucursal target **with a seeded participación** rejected `permission-denied` (not `failed-precondition`), no deletion; foreign-sucursal target rejected, no deletion; Gerente regression (affirmative, unaffected by alcance); admin_sucursal against an orphan target (Auth user deleted, profile remains) rejected `not-found`, profile survives; Gerente against the same orphan target still sweeps the profile (regression, proves the fallback stays reachable for Gerente). |

### Deviations from Design

None — matches D3's Interfaces table placement exactly for
`desactivar/reactivar/eliminarCajero`: `await exigirCajeroObjetivo(...)` runs
in the wrapper, before `Impl`, and therefore before every side effect
`eliminarCajeroImpl` performs (the target-claims read, the participaciones
`count()`, `auth.deleteUser`, and the Firestore delete transaction) — placing
the check ahead of the whole `Impl` call satisfies "before the count" for
free, with no reordering inside `eliminarCajeroImpl` itself. This is the
explicit contrast with S3b's `eliminarCategoria`, which needed an
Impl-internal reorder: that callable's alcance check is a resource-scope
check that could only run after `tx.get` read the stored category (the check
depends on data the Impl reads), so it had to be placed inside the Impl,
after the read but before `count()`. Here the check is on the *target's Auth
claims*, entirely independent of anything `eliminarCajeroImpl` reads
internally, so it can run — and does run — as a pure precondition in the
wrapper, before `Impl` is even called. No input-level `exigirCajeroDeAlcance`
call, per the task's explicit instruction that `{ uid }`-only inputs have
nothing to anti-escalate at the input level.

### Orphan-fallback behavior (D3, deliberate)

`eliminarCajeroImpl` has a pre-existing orphan-profile fallback: when
`auth.getUser(uid)` throws `auth/user-not-found`, it falls back to reading
`usuarios/{uid}` and checks `rol` there, so a partially-deleted cajero (Auth
gone, profile left behind) can still be swept up on retry. `exigirCajeroObjetivo`
maps that same `auth/user-not-found` to `HttpsError("not-found")` in the
wrapper, so once it runs, an `admin_sucursal` caller can never reach
`eliminarCajeroImpl`'s orphan branch — the wrapper already threw. This makes
the orphan fallback **Gerente-only** by construction, exactly as design.md D3
states ("The profile stays only in eliminar's existing orphan fallback, which
is reachable for the Gerente only. For admin_sucursal, a missing Auth user
returns `not-found`"). Two tests pin this: `admin_sucursal` against an orphan
target gets `not-found` with the profile still present (nothing deleted, no
`auth.deleteUser` reached since there's no Auth user to delete), and a
Gerente against the identical orphan target still resolves `eliminado: true`
and sweeps the profile. No workaround was attempted — this is the intended
design, not a regression, and matches the task's own wording ("the
orphan-profile fallback path stays Gerente-only").

### Issues Found

None in the production code. One unrelated pre-existing flake observed in the
full `npm test` run: `test/triggers/on-aporte-escrito.test.ts` ›
`D2/RNF-03 · dos entregas concurrentes del MISMO evento ... no duplican el
delta` timed out at 5000ms once. Re-ran that file alone: 11/11 passed,
including that exact case (3178ms, under the 5s budget) — a timing-sensitive
concurrency test unrelated to `eliminar-cajero.ts`/`exigir-admin.ts`, not
caused by this change.

### Work Unit Evidence

| Evidence | Value |
|---|---|
| Focused test command and result | `(cd packages/functions && firebase emulators:exec --project demo-conteo-eficiente --only firestore,auth "npx vitest run test/callables/eliminar-cajero.test.ts")` → 17/17 passed (10 pre-existing Impl tests + 7 new authorization tests). |
| Runtime harness | Same command — Firestore + Auth emulator, authorization proof runs through `eliminarCajero.run(req)` (the real `onCall` wrapper), not just the Impl; the target-claims check reads real Auth state via `auth.getUser`, the shared-sucursal negative seeds a real `sesiones` doc with the target in `participantes` to prove the gate precedes `count()`, and both orphan tests round-trip through a real prior `auth.deleteUser` to leave a genuine orphaned profile |
| Rollback boundary | Single wrapper edit in `eliminar-cajero.ts` (1 import line changed, 2 lines added); revert = `eliminarCajero` back to unconditional `exigirAdmin(req)`, no other file touched |

### Closing Checks

| Command | Result |
|---|---|
| `npm run typecheck` | Pass — all workspaces (web, data, functions, shared, contracts, tools), no errors printed |
| `npm run lint` | Pass — `eslint .`, no output/errors |
| `npm test` | 1 failure on first run, in an unrelated file: `on-aporte-escrito.test.ts`'s `D2/RNF-03` concurrency test timed out at 5000ms (263/264 tests passed across functions/web/data/shared/contracts). Re-ran that file alone in isolation: 11/11 passed. Confirmed pre-existing flake, not caused by this change (see Issues Found). |
| Focused command (`eliminar-cajero.test.ts`) | Pass — 17/17, both in the full `npm test` run and standalone |

### Budget

`git diff --numstat` (worktree, after `npx prettier --write` on both changed
files — prettier reported "All files formatted correctly", no changes made):

```
5    2  packages/functions/src/callables/eliminar-cajero.ts
176  3  packages/functions/test/callables/eliminar-cajero.test.ts
```

Total additions + deletions = **186** (forecast was ~220). Under the 400 hard
limit, and under S4-desactivar-reactivar's 337 for a single callable's worth
of change — the wrapper mirrors that slice exactly, and this is one callable
instead of two.

### Status

1/1 assigned task (4.5 / S4-eliminar) complete. This closes Phase 4. Not
proceeding to S5/S6 — out of scope for this apply. No commit made per
instructions; candidate is unstaged in the worktree, awaiting RDD
receipt/orchestrator review. `tasks.md` NOT marked `[x]` per instructions
(orchestrator's responsibility).

### Orchestrator addendum (S4-eliminar)

RDD ran natively in one round (gentle-ai 2.9.1): lineage `review-74e2c40ec8d62726`,
medium risk, lens `review-reliability` order 0, frozen 2 files / 186 lines
(correction budget 93), **approved** with 6 informational findings (2 WARNING,
4 SUGGESTION), no correction opened or consumed. Acknowledged; authority burned.

The orchestrator reviewed the production diff before START. Task 4.5's RED list
is fully covered (7 new cases), and two of the reviewer's findings were rejected
on verified evidence rather than accepted:

| Finding | Severity | Disposition |
|---|---|---|
| Rejected attempts may no longer produce an audit record a "coarser pre-change gate inside `eliminarCajeroImpl`" might have produced | WARNING | **Premise false.** `git show HEAD:.../eliminar-cajero.ts` has exactly one `registrarAuditoria` call, inside the success transaction (`USUARIO_ELIMINADO`). No rejection path ever wrote an audit record, before or after. No regression. (That *no* callable audits rejected escalation attempts is a real pre-existing system-wide product gap — its own issue, not this slice's.) |
| No test for an `admin_sucursal` with several sucursales partially overlapping the target's | SUGGESTION | **Structurally unreachable.** `exigirAdminDeSucursal` throws unless the token carries exactly 1 sucursal, so a multi-sucursal caller never reaches the target check; `exigirExclusivaDeSucursal` has no overlap/subset semantics to probe. Caller-cardinality is unit-tested in S4-foundation, and task 4.5's RED list (unlike 4.3/4.4) does not ask for a malformed-claim case. |
| Check-then-act race between the claims read and the deletion | SUGGESTION | Follow-up. Same cross-system Auth-vs-Firestore TOCTOU as S4-actualizar and S4-desactivar-reactivar. |

**Why no Impl reorder here, unlike S3b.** `eliminarCategoria` needed its check moved
inside the Impl before `count()` because the check depended on data the Impl reads.
`eliminarCajero`'s check reads only the target's Auth claims, independent of the
Impl, so a wrapper precondition satisfies "before the participaciones count" for
free. The whole Impl runs after it.

**Verification was run inline by the orchestrator**, not delegated: the `sdd-verify`
agent for this slice terminated early on an API session limit (HTTP 429) before
producing a report, and re-launching a cold agent would have re-derived context the
orchestrator already held. Every command was reproduced directly —
`verify-report-s4-eliminar.md`, **PASS WITH WARNINGS**, 1/1 requirements, 5/5
enumerated scenarios, 0 CRITICAL, focused 17/17 exit 0, `npm run typecheck` exit 0,
186 lines reproduced via `git diff --numstat`; evidence
`sha256:667320fba04e386b91261e9e6ce1b85f5196a02f4fc69c6c29364057584d98cd`,
validated with `sdd-verify-validate` (`valid: true`).

Two checks beyond the scenario matrix:
- **The count-ordering test genuinely discriminates.** It seeds a shared-sucursal
  target *with a real participación*, so if the gate ran after `count()` the call
  would throw `failed-precondition` ("participó en 1 conteo") instead of
  `permission-denied` and the assertion would fail. Without the seeded participación
  the test would be a tautology.
- **The orphan fallback is Gerente-only, per D3 verbatim.** Two tests pin it:
  `admin_sucursal` against an orphan target gets `not-found` with the profile
  surviving; Gerente still sweeps it. The three pre-existing Impl-level orphan tests
  are untouched and still pass — only who can reach the branch changed.

Attempt settled complete. Commit `fde22cf` on `feat/rol-admin-sucursal-eliminar-cajero`
(single work unit). **Phase 4 (tasks 4.1–4.5) is complete.** Next: Phase 5 (S5a).

## Phase 5: Scoped admin panel

- [ ] 5.1 **S5a** — auth state + comparativo guard

### Mode

Strict TDD (per task instructions). Test runner: `cd apps/web && npx vitest run src/state/useAuthState.test.ts src/lib/guardas-comparativo.test.ts` (mocked Firebase SDK per design's testing strategy; real authorization proven by S1–S4).

### TDD Cycle Evidence

| Step | Evidence |
|---|---|
| RED | Added `describe("useAuthState — claim rol y esAdmin (D8/S5a)")` to `apps/web/src/state/useAuthState.test.ts` (8 cases: rol string exposed, missing/non-string normalized to undefined, esAdmin true for admin, esAdmin true for admin_sucursal with 1 sucursal, esAdmin false for 0 sucursales, esAdmin false for 2+ sucursales, esAdmin false for cajero) and created `apps/web/src/lib/guardas-comparativo.test.ts` (8 cases: admin_sucursal redirect on /admin/comparativo and subpaths, negative pair for other /admin paths, affirmative for Gerente and legacy admin, regressions for cajero, unauthenticated and resolving). Ran focused vitest: **4 tests failed for the right reasons** (admin_sucursal comparativo expected "/admin" received `null`; subpath expected "/admin" received `null`; raw rol expected "admin_sucursal" received `undefined`; admin_sucursal with 1 sucursal expected true received `false`), 16 passed trivially (4 pre-existing tests + negative/regression cases). |
| GREEN | Updated `apps/web/src/lib/guardas.ts` to add `readonly rol?: string` to `UsuarioAutenticado` and the single redirect branch `if (pathname.startsWith("/admin/comparativo") && auth.rol === "admin_sucursal") return "/admin";`. Updated `apps/web/src/state/useAuthState.ts` to extract `rol`, compute `esAdmin = rol === "admin" || (rol === "admin_sucursal" && sucursales.length === 1)` and expose `rol`. Re-ran focused vitest: **20/20 passed** (8 in guardas-comparativo, 12 in useAuthState). `guardas.test.ts` untouched and 6/6 passed. |
| REFACTOR | Prettier applied to the 4 touched files (`apps/web/src/lib/guardas.ts`, `apps/web/src/state/useAuthState.ts`, `apps/web/src/state/useAuthState.test.ts`, `apps/web/src/lib/guardas-comparativo.test.ts`). Zero unnecessary abstractions added. |

### Files Changed

| File | Action | What Was Done |
|---|---|---|
| `apps/web/src/lib/guardas.ts` | Modified | Added optional `readonly rol?: string` to `UsuarioAutenticado` (preserves backward compatibility with `guardas.test.ts` literals) and added redirect branch `/admin/comparativo` → `/admin` when `auth.rol === "admin_sucursal"`. |
| `apps/web/src/state/useAuthState.ts` | Modified | Extracted `rol` from `token.claims.rol` (when string), computed `esAdmin` including `admin_sucursal` with exactly 1 sucursal (D8), and exposed `rol` in returned state. |
| `apps/web/src/state/useAuthState.test.ts` | Modified | Added 8 test cases verifying raw `rol` exposure, type normalization, and `esAdmin` calculation across admin, admin_sucursal (0, 1, 2+ sucursales) and cajero. |
| `apps/web/src/lib/guardas-comparativo.test.ts` | Added | New test suite with 8 cases verifying `/admin/comparativo` redirect for `admin_sucursal`, access to other `/admin` routes, access for Gerente and legacy admin, and cajero/unauthenticated regressions. |

### Deviations from Design / Tasks

None. Note regarding task RED list clause "+ nav has no link": `AdminLayout.tsx` nav link filtering belongs to slice 5.3 (S5c), as defined in its own task file list and RED list ("AdminLayout filters DESTINOS for admin_sucursal / keeps full list for Gerente"). S5a strictly covers route guard pure logic and auth state, keeping the slice focused and well within the 400-line budget.

### Issues Found

None in production code. Observed pre-existing flake in functions emulator test `test/triggers/on-aporte-escrito.test.ts` under load (5000ms timeout); re-ran in isolation and passed 11/11 (confirmed pre-existing, documented in Fase 4 and instructions).

### Work Unit Evidence

| Evidence | Value |
|---|---|
| Focused test command and result | `(cd apps/web && npx vitest run src/state/useAuthState.test.ts src/lib/guardas-comparativo.test.ts)` → 20/20 passed (2 files) |
| Runtime harness | N/A — web layer is mocked-SDK per design's testing strategy; real authorization is already proven by S1–S4 |
| Rollback boundary | `useAuthState.ts` field + `guardas.ts` single redirect branch; revert leaves `guardas.ts` on Gerente-only admin rules and untouched `guardas.test.ts` |

### Closing Checks

| Command | Result |
|---|---|
| `npm run typecheck` | Pass — all workspaces (web, data, functions, shared, contracts, tools), 0 errors |
| `npm run lint` | Pass — `eslint .`, 0 errors |
| `npm test` | Pass across shared (120/120), contracts (71/71), data (103/103), web (488/488 across 60 files), and functions (isolated run of on-aporte-escrito 11/11) |
| Focused command (`apps/web`) | Pass — 20/20 |

### Budget

`git diff --numstat` (worktree, after `npx prettier --write` on touched files):

```
4	0	apps/web/src/lib/guardas.ts
98	0	apps/web/src/state/useAuthState.test.ts
6	2	apps/web/src/state/useAuthState.ts
64	0	apps/web/src/lib/guardas-comparativo.test.ts (untracked)
```

Total additions + deletions = **174** (forecast was ~200). Under the 400 hard limit.

### Status

1/1 assigned task (5.1 / S5a) complete. Not proceeding to S5b/S5c — out of scope for this slice. No commit made, no stage, per instructions; candidate is unstaged in worktree `C:\Users\PC RYZEN\Documents\Proyectos\Sistema inventario-worktrees\feat-rol-admin-sucursal-auth-state-guarda`, awaiting RDD receipt from Claude Code.

### Orchestrator addendum (S5a)

RDD ran natively (gentle-ai 3.1.0, negotiated `review-integration/v2` contract):
lineage `review-1e403575ce016dbb`, medium risk, lens `review-reliability` order 0,
frozen 4 files / 178 lines (correction budget 89) — **approved with 0 findings**,
acknowledged, authority burned. Reviewer confirmed all 4 manifest paths against the
frozen `base_tree`/`candidate_tree`, confirmed `guardas.test.ts` byte-identical
between trees (protected file untouched), confirmed the 0/1/2+ sucursales boundary
is both implemented and tested, and ruled out a `/admin/comparativo` prefix-collision
with any sibling route. No correction needed.

Work-unit commits on `feat/rol-admin-sucursal-auth-state-guarda` (base `fde22cf`):
`c00d520` (`feat(web): exponer rol crudo en useAuthState`), `6084668`
(`feat(web): bloquear /admin/comparativo para admin_sucursal`). Next: S5b (task 5.2),
worktree `feat-rol-admin-sucursal-repo-admin` branched from `6084668`.

- [ ] 5.2 **S5b** — `FirestoreAdminRepository` scope

Worktree: `C:\Users\PC RYZEN\Documents\Proyectos\Sistema inventario-worktrees\feat-rol-admin-sucursal-repo-admin`
(branch `feat/rol-admin-sucursal-repo-admin`, based on S5a commit `6084668`). No
commit made — candidate left unstaged in the worktree per instructions.

### Mode

Strict TDD (per task instructions). Test runner: `cd packages/data && npx vitest
run src/firebase/firestore-admin-repository.test.ts` (mocked `firebase/firestore`/
`firebase/functions` SDK per design's testing strategy — this slice proves the
client constructs the correctly-scoped query object, not server-side
authorization; that is already proven by S1's rules/emulator tests).

### TDD Cycle Evidence

| Step | Evidence |
|---|---|
| RED | Added `describe("FirestoreAdminRepository — alcance (acotamiento admin_sucursal, D7 diseño §Client scope)")` with one affirmative/negative pair per method in the task's RED list (12 cases: `observarSesionesAbiertas`, `listarSesiones`, `observarUsuarios`, `observarSucursales`, `observarCategorias`, `listarAuditoria` — 6 × 2). Ran against the OLD repository (2-arg constructor, no scoping branches): **6 failed for the right reason** — the 6 scoped-affirmative cases: `observarSesionesAbiertas`/`listarSesiones`/`listarAuditoria` failed because `where("sucursalId","==","suc_a")` was never called (constructor silently dropped the 3rd arg); `observarUsuarios` failed because `where("sucursalesAsignadas","array-contains","suc_a")` was never called and `orderBy` WAS called (inverted expectation); `observarSucursales` failed because `doc` was never called for a single-doc listener; `observarCategorias` failed because the in-memory filter didn't exist (`cat_ajena` leaked through). The 6 negative Gerente-shape cases passed trivially, confirming the "default null must stay byte-identical" requirement already held before this slice even started — the correct baseline for the safety-critical default. |
| GREEN | Added `private readonly alcance: string | null = null` as the constructor's 3rd param (default preserves every existing call site). Wired each of the 6 methods per the design's Interfaces table (§Client scope): `observarSesionesAbiertas`/`listarSesiones` add/force `where("sucursalId","==",alcance)`; `observarUsuarios` swaps to `where("sucursalesAsignadas","array-contains",alcance)` with no `orderBy`, sorting the mapped result by `nombre` in memory; `observarSucursales` swaps the collection query for a single `doc(db,"sucursales",alcance)` listener; `observarCategorias` keeps the same query and filters the mapped result in memory (global or `sucursalesAsignadas.includes(alcance)`); `listarAuditoria` adds `where("sucursalId","==",alcance)` and drops a caller-supplied `sucursalId` filtro to avoid a duplicate/conflicting clause. Re-ran the focused command: **26/26 passed**. |
| REFACTOR | None needed — each branch reuses the file's existing `query`/`where`/`doc`/`onSnapshot` primitives verbatim, no new abstraction introduced. |

### Files Changed

| File | Action | What Was Done |
|------|--------|---------------|
| `packages/data/src/firebase/firestore-admin-repository.ts` | Modified | Constructor gains 3rd param `alcance: string \| null = null` (D7). `observarSesionesAbiertas`, `listarSesiones`, `listarAuditoria` add a `sucursalId` `where` clause when `alcance !== null`. `observarUsuarios` swaps to an `array-contains` query + in-memory sort when scoped. `observarSucursales` swaps to a single-doc listener when scoped. `observarCategorias` filters the mapped result in memory when scoped. All branches are strict `this.alcance !== null` checks; the `null` path is textually unchanged from before this slice. |
| `packages/data/src/firebase/firestore-admin-repository.test.ts` | Modified | Added the `— alcance (...)` describe block: 12 cases (one affirmative/negative pair per method in the task's RED list), plus a local `docCategoria`/`idsRecibidos` helper pair for the `observarCategorias` in-memory-filter assertions. |

### Deviations from Design

None — implementation matches design.md's `Client scope` table (§68-79) verbatim
for all 6 methods, including the two undocumented-in-prose but implied details:
(1) `listarAuditoria`'s own `sucursalId` filtro is dropped when scoped, exactly as
"a `sucursalId` filtro is dropped" states, tested via a filtro whose `campo` is
`"sucursalId"`; (2) `observarCategorias`' "global or includes A" filter reads
`sucursalesAsignadas` from the already-mapped `CategoriaValor` (not the raw doc),
matching `categoriaValorDesdeDoc`'s existing field passthrough, so no new doc-shape
assumption was introduced.

### Issues Found

None in the production diff. `npm test` (full suite, single run) had 1 pre-existing,
unrelated failure: `packages/functions/test/triggers/on-aporte-escrito.test.ts`'s
"ADR-23 · dos aportes de la misma cajera en áreas distintas suman en porArea sin
pisarse" timed out at 5000ms under full-suite emulator load. Confirmed pre-existing
and unrelated: `git status`/`git diff --stat` show zero changes under
`packages/functions` for this slice, and re-running that exact file in isolation
(`firebase emulators:exec ... "npx vitest run test/triggers/on-aporte-escrito.test.ts"`)
passed 11/11 clean (2.87s for that case) — same class of machine-load flakiness
already documented in S2a/S3a's addenda, not caused by this diff.

### Work Unit Evidence

| Evidence | Value |
|---|---|
| Focused test command and result | `cd packages/data && npx vitest run src/firebase/firestore-admin-repository.test.ts` → 26/26 passed |
| Runtime harness | N/A — client/data layer against a mocked Firebase SDK per design's testing strategy; the provable-query shapes this slice adds are the exact ones S1 already proved the rules accept against a live Firestore emulator |
| Rollback boundary | Single file's constructor param (additive, defaulted) + 6 method bodies; revert = `FirestoreAdminRepository` back to its 2-arg constructor and unconditional unscoped queries, no other file touched |

### Closing Checks

| Command | Result |
|---|---|
| `npm run typecheck` | Pass — all workspaces (web, data, functions, shared, contracts, tools), 0 errors |
| `npm run lint` | Pass — `eslint .`, 0 errors |
| `npm test` | 1 failure on first run, in an unrelated file (`on-aporte-escrito.test.ts`, see Issues Found); 263/264 across functions/web/data/shared/contracts. Re-ran that file alone in isolation: 11/11 passed. `packages/data` itself: 26/26 in the full run. |
| Focused command (`firestore-admin-repository.test.ts`) | Pass — 26/26, both in the full `npm test` run and standalone |

### Budget

`git diff --numstat` (worktree, after `npx prettier --write` on both changed
files):

```
137  0  packages/data/src/firebase/firestore-admin-repository.test.ts
53   7  packages/data/src/firebase/firestore-admin-repository.ts
```

Total additions + deletions = **197** (forecast was ~180). Under the 400 hard limit.

### Status

1/1 assigned task (5.2 / S5b) complete. Not proceeding to S5c or any other slice
— out of scope for this apply. No commit made, no stage, per instructions;
candidate is unstaged in the worktree, awaiting RDD receipt/orchestrator review.
`tasks.md` NOT marked `[x]` per instructions (orchestrator's responsibility).

### Orchestrator addendum (S5b)

Orchestrator re-ran `typecheck && lint && npm test` clean before RDD (264/264
functions this time — the `on-aporte-escrito` flake from the writer's run did
not reproduce). RDD ran natively (gentle-ai 3.1.0): lineage
`review-8579b14f73272d90`, medium risk, lens `review-reliability` order 0,
frozen 2 files / 197 lines (correction budget 99) — **approved** with 2
informational WARNINGs, no correction opened. Both verified against the diff
before accepting: `observarUsuarios`'s and `observarSucursales`'s "con alcance"
tests assert only on the `where`/`orderBy`/`doc`/`collection` call arguments,
never exercise the captured `onSnapshot` callback to prove the actual output
(sorted array / mapped single doc) — unlike `observarCategorias`'s tests, which
do. Confirmed accurate; left as a follow-up (not corrected — WARNING severity,
non-blocking, and the query-shape proof itself, which is the security-relevant
part per D7, is not in question).

Work-unit commit on `feat/rol-admin-sucursal-repo-admin` (base `6084668`,
S5a's tip): `f52f21b` (`feat(data): acotar FirestoreAdminRepository a la
sucursal del admin_sucursal`). Next: S5c (task 5.3), worktree
`feat-rol-admin-sucursal-panel-admin` branched from `f52f21b`.

- [ ] 5.3 **S5c** — `AdminLayout` + router + `CajerosScreen` rol option

Worktree: `C:\Users\PC RYZEN\Documents\Proyectos\Sistema inventario-worktrees\feat-rol-admin-sucursal-panel-admin`
(branch `feat/rol-admin-sucursal-panel-admin`, based on S5b commit `f52f21b`). No
commit made — candidate left unstaged in the worktree per instructions.

### Mode

Strict TDD (per task instructions). Test runner: `cd apps/web && npx vitest run
src/ui/admin/AdminLayout.test.tsx src/ui/admin/CajerosScreen.test.tsx` (mocked
Firebase SDK / mocked `AdminRepository` per design's testing strategy — this
slice proves the UI doesn't render/offer what it shouldn't and that the router
wires the repository correctly; server-side authorization is already proven by
S1–S4).

### TDD Cycle Evidence

| Step | Evidence |
|---|---|
| RED | `AdminLayout.test.tsx`: extended `renderLayout` with an optional `rol` param and added `describe("AdminLayout · alcance por rol (S5c, D8)")` with 2 cases — admin_sucursal hides the Comparativo destino (affirmative-negative pair: 6 links, no Comparativo link) and Gerente keeps all 7 including Comparativo (regression). `CajerosScreen.test.tsx`: added a `renderPantallaConRol` helper (`MemoryRouter` + `<Outlet context={{ rol }}/>` parent route, matching `PanelAdmin`'s production wiring) and `describe("CajerosScreen · opción de rol acotada (S5c, anti-escalada)")` with 4 cases — admin_sucursal sees exactly 1 rol option ("Cajero") (affirmative), admin_sucursal never sees "Administrador" (negative), Gerente keeps both options (regression), and direct mount with no Outlet context also keeps both options (regression — the existing 15 tests use this path). Ran focused vitest against the OLD components (no `rol` prop on `AdminLayout`, no `useOutletContext` in `CajerosScreen`): **3 tests failed for the right reasons** — `oculta el destino Comparativo para admin_sucursal` expected 6 links, got 7 (rol prop was ignored, all 7 destinos always rendered); `ofrece sólo 'Cajero' a admin_sucursal` expected 1 option, got 2 (ROLES was rendered unfiltered); `NO ofrece 'Administrador' a admin_sucursal` found the "Administrador" `<option>` that should have been absent. The other 26 tests (12 AdminLayout + 17 CajerosScreen minus the 3 new failing ones, including the 2 new regression cases) passed trivially, confirming the "no `rol`/Gerente `rol` behavior is unchanged" baseline already held before this slice started. |
| GREEN | `AdminLayout.tsx`: added `rol?: string` to `AdminLayoutProps`, exported a `PanelContexto` interface (`{ readonly rol?: string }`), computed `const destinos = rol === "admin_sucursal" ? DESTINOS.filter((d) => d.ruta !== "/admin/comparativo") : DESTINOS`, replaced both `DESTINOS.map` call sites (sidebar + bottom nav) with `destinos.map`, and changed `<Outlet />` to `<Outlet context={{ rol } satisfies PanelContexto} />`. `CajerosScreen.tsx`: added a `rolesPara(rol)` helper next to the existing `ROLES` constant that returns only the `"cajero"` entry when `rol === "admin_sucursal"` (else the full list, so `rol === undefined` — direct-mount tests — keeps existing behavior), read `const contexto = useOutletContext<PanelContexto>()` and `const roles = rolesPara(contexto?.rol)` in `CajerosScreen`, threaded a new `roles` prop through to `FormularioCajero`, and swapped its hardcoded `ROLES.map` for `roles.map` in the `<select>`. `router.tsx`: removed the module-scope `const adminRepo = new FirestoreAdminRepository(db, functions)` singleton, added a `PanelAdmin()` component that resolves its own `useAuthState(auth)`, derives `alcance` (the admin_sucursal's own `sucursales[0]`, or `null` for Gerente/unresolved), memoizes `new FirestoreAdminRepository(db, functions, alcance)` on `[alcance]`, returns `null` until `estadoAuth` resolves (so `AdminRepositoryProvider`/`AdminLayout` never mount pre-resolution), and otherwise renders `<AdminRepositoryProvider repo={repo}><AdminLayout rol={estadoAuth.rol} onSalir={...} /></AdminRepositoryProvider>`; the `/admin` route element became `<RequireAuth><PanelAdmin /></RequireAuth>`. Re-ran focused vitest: **29/29 passed** (12 AdminLayout + 17 CajerosScreen). |
| REFACTOR | `npx prettier --write` on the 5 touched files; only reformatted `CajerosScreen.tsx` (wrapped the `rolesPara` return-type annotation onto its own line), the other 4 were already formatted. No new abstraction beyond the one small `rolesPara`/`PanelContexto` pair the design explicitly asks for (D7's `<Outlet context>` + rol-option filtering); `PanelAdmin` mirrors the existing `RequireAuth`/`RequireAnonimo` component shape already in `router.tsx`. |

### Files Changed

| File | Action | What Was Done |
|------|--------|---------------|
| `apps/web/src/ui/admin/AdminLayout.tsx` | Modified | Added `rol?: string` prop and exported `PanelContexto` type; `DESTINOS` is filtered to drop the Comparativo entry when `rol === "admin_sucursal"` (both sidebar and bottom-nav render sites); `<Outlet/>` now forwards `{ rol }` as context. |
| `apps/web/src/ui/admin/AdminLayout.test.tsx` | Modified | `renderLayout` gained an optional `rol` param; added 2 new cases (admin_sucursal hides Comparativo / Gerente keeps all 7). |
| `apps/web/src/ui/admin/CajerosScreen.tsx` | Modified | Added `rolesPara(rol)` (returns only "Cajero" for admin_sucursal, else the full `ROLES` list); reads `rol` via `useOutletContext<PanelContexto>()`; threaded a new `roles` prop into `FormularioCajero`, which now maps over `roles` instead of the module-level `ROLES` constant. |
| `apps/web/src/ui/admin/CajerosScreen.test.tsx` | Modified | Added `renderPantallaConRol` helper (Router + `<Outlet context>` wiring) and 4 new cases (admin_sucursal sees only Cajero / never sees Administrador; Gerente and no-context direct-mount both keep both options). |
| `apps/web/src/lib/router.tsx` | Modified | Removed the module-scope `adminRepo` singleton; added `PanelAdmin()`, which resolves `useAuthState`, computes `alcance`, memoizes the scoped `FirestoreAdminRepository`, and gates mounting `AdminRepositoryProvider`/`AdminLayout` on auth resolution; the `/admin` route now renders `<RequireAuth><PanelAdmin /></RequireAuth>`. |
| `docs/diseno/11-ux-y-navegacion.md` (**MAIN checkout**, not this worktree — per instructions) | Modified | §2: new "Panel acotado por sucursal (admin_sucursal)" subsection before "Guardas de ruta", documenting `PanelAdmin`'s resolve-then-mount gate and the `Outlet context` → `useOutletContext` wiring. §8: added a callout under the Panel de administrador table noting admin_sucursal never sees the Comparativo section. |

### Deviations from Design

None — implementation matches design.md's "Web wiring" paragraph verbatim:
`PanelAdmin` runs its own `useAuthState`, returns `null` until resolved, then
`useMemo(() => new FirestoreAdminRepository(db, functions, alcance), [alcance])`
→ `<AdminLayout rol>`; `AdminLayout` filters `DESTINOS` and renders
`<Outlet context={{ rol }} />`; `CajerosScreen` reads `useOutletContext()` and
offers only "Cajero" to admin_sucursal. One implementation note not spelled out
verbatim in design: `rolesPara` treats an **absent** `rol` (no Outlet context —
e.g. a screen mounted directly in a test or future reuse outside `/admin`) the
same as Gerente (full option list), matching `AdminLayout`'s existing
`rol === "admin_sucursal"` equality check (not a `!== "admin_sucursal"` denylist)
so neither component ever fails open for an unexpected/malformed rol string —
only the exact literal `"admin_sucursal"` narrows anything, mirroring D8/D9's
established pattern from S5a.

### Issues Found

None in the production diff. `npm test` (full suite, single run) had 1
pre-existing, unrelated failure: `packages/functions/test/triggers/on-aporte-escrito.test.ts`'s
"ADR-23 · dos aportes de la misma cajera en áreas distintas suman en porArea sin
pisarse" timed out at 5000ms under full-suite emulator load — the same class of
machine-load flakiness already documented in S2a/S3a/S5a/S5b's addenda. `git
status`/`git diff --stat` show zero changes under `packages/functions` for this
slice. A prior full run in this same session passed that file and the rest of
`packages/functions` cleanly (264/264, 32/32 files), confirming the flake is
load-dependent, not caused by this diff.

### Work Unit Evidence

| Evidence | Value |
|---|---|
| Focused test command and result | `cd apps/web && npx vitest run src/ui/admin/AdminLayout.test.tsx src/ui/admin/CajerosScreen.test.tsx` → 29/29 passed (12 + 17) |
| Runtime harness | N/A — mocked SDK per design's testing strategy; manual PWA smoke check recommended, not automated in this slice (per task table) |
| Rollback boundary | `AdminLayout.tsx` rol prop + filter + Outlet context; `CajerosScreen.tsx` `rolesPara` + `roles` prop threading; `router.tsx`'s `PanelAdmin` replacing the old `adminRepo` singleton + inline provider. Revert = admin_sucursal falls back to the full nav and unfiltered rol options (still denied server-side per S1–S4); no other screen or file touched. |

### Closing Checks

| Command | Result |
|---|---|
| `npm run typecheck` | Pass — all workspaces (web, data, functions, shared, contracts, tools), 0 errors |
| `npm run lint` | Pass — `eslint .`, 0 errors |
| `npm test` | 1 failure on first full run, in an unrelated file (`on-aporte-escrito.test.ts`, see Issues Found); a prior full run in the same session passed all 32 functions files (264/264) cleanly. `apps/web`: 494/494 across all files including the 2 touched here. `packages/data`: 115/115. `packages/shared`: 120/120. `contracts`: 71/71. |
| Focused command (`AdminLayout.test.tsx` + `CajerosScreen.test.tsx`) | Pass — 29/29, both standalone and inside the full `apps/web` run |

### Budget

`git diff --numstat` (worktree, after `npx prettier --write` on all 5 touched files):

```
22  10  apps/web/src/lib/router.tsx
20  2   apps/web/src/ui/admin/AdminLayout.test.tsx
15  4   apps/web/src/ui/admin/AdminLayout.tsx
64  0   apps/web/src/ui/admin/CajerosScreen.test.tsx
20  1   apps/web/src/ui/admin/CajerosScreen.tsx
```

Total additions + deletions = **158** (forecast was ~200). Well under the 400
hard limit. (The `docs/diseno/11-ux-y-navegacion.md` edit lives in the MAIN
checkout per instructions and is not part of this worktree's diff/budget.)

### Status

1/1 assigned task (5.3 / S5c) complete. This closes Phase 5. Not proceeding to
Phase 6 (S6) — out of scope for this apply. No commit made, no stage, per
instructions; candidate is unstaged in the worktree, awaiting RDD
receipt/orchestrator review. `tasks.md` NOT marked `[x]` per instructions
(orchestrator's responsibility).

### Orchestrator addendum (S5c)

Orchestrator re-ran `typecheck && lint && npm test` clean before RDD (exit 0
across all workspaces). Reviewed the production diff directly, in particular
the `router.tsx` change replacing the module-level singleton `adminRepo` with
a `PanelAdmin()` component that resolves its own `useAuthState`, derives
`alcance`, and memoizes a scoped `FirestoreAdminRepository` — confirmed no
render race (returns `null` until auth resolves) and no accidental Gerente
narrowing.

RDD ran natively (gentle-ai 3.1.0): lineage `review-03f8f5079e41d36d`, medium
risk, lens `review-reliability` order 0, frozen 5 files / 158 lines
(correction budget 79) — **approved with 0 findings**, acknowledged, authority
burned. Reviewer specifically verified: the `PanelAdmin` hook-order/memoization
is race-free, `DESTINOS`/`rolesPara` are both allowlist-based (never fail open
on a malformed rol), and `useOutletContext` returning `undefined` outside an
`<Outlet>` (rather than throwing) is why all 15 pre-existing `CajerosScreen`
tests kept passing unmodified.

Work-unit commit on `feat/rol-admin-sucursal-panel-admin` (base `f52f21b`,
S5b's tip): `2faae70` (`feat(web): agregar PanelAdmin acotado y filtrar nav
para admin_sucursal`). **Phase 5 (tasks 5.1–5.3) is complete.** Next: Phase 6
(S6, task 6.1 — `etiqueta-rol.ts` + call sites), or Phase 7 (S7, optional,
D10).

## Phase 6: Labels + role option

- [ ] 6.1 **S6** — `etiqueta-rol.ts` + call sites (not marked `[x]` in
  `tasks.md` — orchestrator's responsibility per instructions)

Worktree: `C:\Users\PC RYZEN\Documents\Proyectos\Sistema inventario-worktrees\feat-rol-admin-sucursal-etiquetas`
(branch `feat/rol-admin-sucursal-etiquetas`, based on S5c commit `2faae70`). No
commit made — candidate left unstaged in the worktree per instructions.

### Mode

Strict TDD for the new pure function (per task instructions); the 3 existing
call sites (CuentaScreen, CajerosScreen, auditoria-helpers) are wiring
changes to code already covered by pre-existing tests, fixed together with
their assertions (standard-mode refactor, not new logic requiring a
standalone RED).

### TDD Cycle Evidence

| Step | Evidence |
|---|---|
| RED | Wrote `apps/web/src/lib/etiqueta-rol.test.ts` (table-driven `it.each` over the 3 `rol` values + 1 case for an absent `rol`) BEFORE `etiqueta-rol.ts` existed. Ran `cd apps/web && npx vitest run src/lib/etiqueta-rol.test.ts`: failed for the right reason — `Failed to resolve import "./etiqueta-rol.js"` (module not found), not an assertion failure. |
| GREEN | Created `apps/web/src/lib/etiqueta-rol.ts`: `etiquetaRol(rol: string \| undefined): string`, a `Record<RolUsuario, string>` lookup (`admin` → "Gerente", `admin_sucursal` → "Admin de sucursal", `cajero` → "Cajero") with a `"Cajero"` fallback for an absent/unrecognized `rol` (same default the 3 replaced call sites already had). Re-ran: **4/4 passed**. |
| REFACTOR | `npx prettier --write` on the new file — already formatted, no changes. No abstraction beyond the single `Record` lookup (ponytail: 3 static string pairs need neither an enum class nor i18n framework). |

### Call-site wiring (Files Changed)

| File | Action | What Was Done |
|------|--------|---------------|
| `apps/web/src/lib/etiqueta-rol.ts` | Created | `etiquetaRol(rol)` — the single label mapping used by every call site below. |
| `apps/web/src/lib/etiqueta-rol.test.ts` | Created | Table-driven RED test for the 3 mappings + the absent-rol fallback. |
| `apps/web/src/ui/CuentaScreen.tsx` | Modified | Line 87 (`Rol` `<dd>`): replaced `estadoAuth?.esAdmin ? "Administrador" : "Cajero"` with `etiquetaRol(estadoAuth?.rol)`. This also fixes a latent gap: `esAdmin` is `true` for a well-formed `admin_sucursal` too (S5a), so that rol previously rendered as "Administrador" on this screen; it now correctly reads "Admin de sucursal" from the raw `rol` claim (already exposed by `useAuthState` since S5a), while `esAdmin` itself is untouched (still drives the `/admin` entry gate, not this label). |
| `apps/web/src/ui/admin/CajerosScreen.tsx` | Modified | `ROLES` const (line ~26–29): both `etiqueta` fields now call `etiquetaRol("cajero")`/`etiquetaRol("admin")` instead of hardcoding the strings (no new `admin_sucursal` option added — out of scope, anti-escalation in `rolesPara` is unchanged). Column render (`clave: "rol"`, ~line 184): `(u) => (u.rol === "admin" ? "Administrador" : "Cajero")` → `(u) => etiquetaRol(u.rol)`. One doc comment above `rolesPara` updated (`"Administrador"` → `"Gerente"`) to match the new label — comment-only, no behavior change. |
| `apps/web/src/ui/admin/auditoria-helpers.ts` | Modified | The 3 existing `usuario?.rol === "admin" ? "Administrador" : "Cajero"` ternaries (lines 22, 31, 42 — file actually lives at `apps/web/src/ui/admin/auditoria-helpers.ts`, not `apps/web/src/lib/...` as design.md's shorthand path suggested; content and line numbers matched exactly) replaced with `etiquetaRol(usuario?.rol)` / `etiquetaRol(usuario.rol)`. |

### Deviations from Design

None in substance — implementation matches the design's "Web wiring" sentence
verbatim: "One `etiquetaRol(rol)` (`apps/web/src/lib/etiqueta-rol.ts`) maps
Gerente / Admin de sucursal / Cajero for `CuentaScreen.tsx:87`,
`CajerosScreen.tsx:26,168` and `auditoria-helpers.ts:22,31,42`." One path
correction: design.md and tasks.md both write `auditoria-helpers.ts` as if it
lived under `apps/web/src/lib/`; the real file is
`apps/web/src/ui/admin/auditoria-helpers.ts` (confirmed via grep — no
duplicate file exists at the `lib/` path). The line numbers (22, 31, 42) still
matched exactly at the real path, so this is a path-label typo in the
planning artifacts, not a signal to create a second file.

### Issues Found

One downstream regression outside the 3 files named in tasks.md: fixing
`auditoria-helpers.ts`'s label wording (admin: "Administrador" → "Gerente")
broke an existing assertion in `apps/web/src/ui/admin/AuditoriaScreen.test.tsx:141`
(`expect(screen.getByText("Administrador"))`), because `AuditoriaScreen`
renders `obtenerAutor(...).rol` directly in a table cell. Fixed the assertion
to `"Gerente"` — same class of fix as the 3 planned "assertion updates", just
one hop further downstream through a consumer of the changed function. Also
updated 2 more `CuentaScreen.test.tsx`/`CajerosScreen.test.tsx` negative
assertions that queried for the literal string `"Administrador"`/`/administrador/i`
(now querying for `"Gerente"`/`/gerente/i`) so they still test the intended
negative case instead of trivially passing against a string that can no
longer appear. No other production code changed to cause this; confirmed via
`grep -rn "Administrador"` across `apps/web` that the only remaining hit is a
doc comment in `CajerosScreen.tsx` (also fixed) — zero user-facing
"Administrador" strings remain.

### Work Unit Evidence

| Evidence | Value |
|---|---|
| Focused test command and result | `cd apps/web && npx vitest run src/lib/etiqueta-rol.test.ts src/ui/CuentaScreen.test.tsx src/ui/admin/CajerosScreen.test.tsx src/ui/admin/auditoria-helpers.test.ts` → 45/45 passed (4 + 6 + 17 + 18) |
| Runtime harness | N/A — presentational only, per task table (no callable/rules boundary touched) |
| Rollback boundary | New `etiqueta-rol.ts`/`.test.ts` (additive, unused if reverted); 3 call-site edits in `CuentaScreen.tsx`/`CajerosScreen.tsx`/`auditoria-helpers.ts` plus their test assertions, plus the 1 downstream `AuditoriaScreen.test.tsx` assertion. Revert = the 4 rol values fall back to the old 2-way "Administrador"/"Cajero" split (cosmetic only — no authorization path touched, matches tasks.md's own "revert is cosmetic only" note). |

### Closing Checks

| Command | Result |
|---|---|
| `npm run typecheck` | Pass — all workspaces (web, data, functions, shared, contracts, tools), 0 errors |
| `npm run lint` | Pass — `eslint .`, 0 errors |
| `npm test` (full suite) | `apps/web`: 61/61 files, 498/498 tests (after fixing the `AuditoriaScreen.test.tsx` downstream assertion described above). `packages/data`: 6/6 files, 115/115. `packages/functions`: 32/32 files, 264/264 (functions emulator, clean run — no flake this time). `packages/shared`: 8/8, 120/120. `contracts`: 12/12, 71/71. |
| Focused command | Pass — 45/45 (see Work Unit Evidence) |

### Budget

`git diff --numstat` (worktree, new files counted via `git add -N` then
unstaged again immediately after measuring — nothing left staged):

```
18  0   apps/web/src/lib/etiqueta-rol.test.ts
16  0   apps/web/src/lib/etiqueta-rol.ts
3   3   apps/web/src/ui/CuentaScreen.test.tsx
2   3   apps/web/src/ui/CuentaScreen.tsx
1   1   apps/web/src/ui/admin/AuditoriaScreen.test.tsx
3   3   apps/web/src/ui/admin/CajerosScreen.test.tsx
6   5   apps/web/src/ui/admin/CajerosScreen.tsx
1   1   apps/web/src/ui/admin/auditoria-helpers.test.ts
4   10  apps/web/src/ui/admin/auditoria-helpers.ts
```

Total additions + deletions = **80** (forecast was ~120, Migration/Rollout
table said ~90). Well under the 400 hard limit.

### Status

1/1 assigned task (6.1 / S6) complete. This closes Phase 6 (mandatory chain).
Not proceeding to Phase 7 (S7) — optional per D10, explicitly out of scope
for this apply. No commit made, no stage, per instructions; candidate is
unstaged in the worktree, awaiting RDD receipt/orchestrator review. `tasks.md`
NOT marked `[x]` per instructions (orchestrator's responsibility). This is
**the last mandatory slice of the whole `rol-admin-sucursal` change** — S1–S6
are all implemented pending this slice's review.

### Orchestrator addendum (S6)

Orchestrator re-ran `typecheck && lint && npm test` clean before RDD (exit 0
across all workspaces). Reviewed `etiqueta-rol.ts` and the `auditoria-helpers.ts`/
`CuentaScreen.tsx` diffs directly — exhaustive `Record<RolUsuario,string>`
lookup, undefined/unexpected `rol` falls back to "Cajero", no authorization
logic touched (confirmed `esAdmin`-based gating elsewhere is untouched).

RDD ran natively (gentle-ai 3.1.0): lineage `review-44eee914eeff998c`, medium
risk, lens `review-reliability` order 0, frozen 9 files / 80 lines (correction
budget 40) — **approved** with 3 informational WARNINGs (R3-001/002/003), no
correction opened. All three make the same accurate point at different call
sites: none of `CuentaScreen`, `CajerosScreen`, or `auditoria-helpers` has a
test proving the `admin_sucursal` → "Admin de sucursal" label actually renders
at that integration point — only `etiqueta-rol.test.ts`'s own unit test covers
the mapping table itself. Verified accurate (confirmed via `grep -n "Admin de
sucursal"` across the candidate tree: only the lib file and its own test
match). Left as a follow-up, not corrected — WARNING severity, non-blocking,
and the underlying mapping is exhaustively typed (`Record<RolUsuario,string>`)
so a missing case would be a compile error, not a silent runtime gap.

Work-unit commit on `feat/rol-admin-sucursal-etiquetas` (base `2faae70`, S5c's
tip): `fdab3e8` (`feat(web): agregar etiquetaRol y aplicarla en cuenta,
cajeros y auditoria`).

**Phase 6 complete. S1–S6 (the entire mandatory slice chain of
`rol-admin-sucursal`) are implemented, RDD-approved, and committed.** Chain:
`f4f6f24`(main) → S1 `3bcc4d6` → S2a `cb8267b` → S2b `69483e5` → S3a `0f97963`
→ S3b `f7d127f` → S4-foundation `f575ef5` → S4-crear `13f0793` → S4-actualizar
`8d4c8b9` → S4-desactivar-reactivar `d92a173` → S4-eliminar `fde22cf` → S5a
`6084668` → S5b `f52f21b` → S5c `2faae70` → S6 `fdab3e8`. All local — no
merge to `main`, no push, no PR opened. Remaining: optional Phase 7 (S7, D10)
is out of scope unless requested; per user instruction, no `sdd-verify` is
required to consider this change done — RDD per slice was sufficient.

