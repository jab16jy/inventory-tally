```yaml
schema: gentle-ai.verify-result/v1
evidence_revision: sha256:b3ac892c9bc2c233f05449e5b6f71512b562691ce74383d20bf76a48209523ba
verdict: pass
blockers: 0
critical_findings: 0
requirements: 3/3
scenarios: 10/10
test_command_1: (cd contracts && npx vitest run schemas/crear-cajero.schema.test.ts schemas/actualizar-cajero.schema.test.ts)
test_exit_code_1: 0
test_output_hash_1: sha256:6f8bb027429ab207ba3a6a477028decd942c258bd5bf711d8d98928cce33bac2
test_command_2: (cd packages/functions && firebase emulators:exec --project demo-conteo-eficiente --only firestore,auth "npx vitest run test/lib/exigir-admin.test.ts")
test_exit_code_2: 0
test_output_hash_2: sha256:ae3c287fd33e8c6efa6c1ac0c5a07369f55d07d7c6ca0c9624879d989e32d2f2
build_command: npm run typecheck (worktree root, all workspaces)
build_exit_code: 0
build_output_hash: sha256:2f3195dd2626c149fc17ec47a09bf8d8f5bc93d7548baf414d2587aa78902a65
```

## Verification Report

**Change**: rol-admin-sucursal
**Scope**: Slice S4-foundation only (task 4.1: RolUsuario widen, crearCajeroSchema/actualizarCajeroSchema cardinality refine, exigirCajeroDeAlcance/exigirCajeroObjetivo helpers). S1/S2a/S2b/S3a/S3b are separate, already-verified slices (verify-report-s1.md, verify-report-s2a.md, verify-report-s2b.md, verify-report-s3a.md, verify-report-s3b.md -- not re-litigated here). S4-crear/S4-actualizar/S4-desactivar-reactivar/S4-eliminar (callable wiring for crearCajero/actualizarCajero/desactivarCajero/reactivarCajero/eliminarCajero) are NOT implemented in this slice and are explicitly OUT OF SCOPE below (not failed).
**Version**: N/A
**Mode**: Strict TDD

**Worktree**: C:/Users/PC RYZEN/Documents/Proyectos/Sistema inventario-worktrees/feat-rol-admin-sucursal-cajero-contratos, branch feat/rol-admin-sucursal-cajero-contratos, based on f7d127f (S3b merge point). No commit made -- candidate is unstaged in the worktree; git status --short showed exactly the 7 files apply-progress.md claims, both before and after every command run in this verification.

### Evidence revision -- how it was computed

sha256 of the exact unified diff (git diff) restricted to the 7 files task 4.1 touches, in this fixed (alphabetical) order: contracts/schemas/actualizar-cajero.schema.test.ts, contracts/schemas/actualizar-cajero.schema.ts, contracts/schemas/crear-cajero.schema.test.ts, contracts/schemas/crear-cajero.schema.ts, packages/functions/src/lib/exigir-admin.ts, packages/functions/test/lib/exigir-admin.test.ts, packages/shared/src/models/usuario.ts.

git diff --numstat on the same 7 paths: 29+0, 12+6, 29+0, 13+7, 47+0, 87+1, 1+1 = 233 additions+deletions. Matches apply-progress.md own Budget section (233, forecast ~310) exactly -- no discrepancy this time (no orchestrator post-writer addition found for this slice).

### Completeness (S4-foundation only)

| Metric | Value |
|--------|-------|
| Tasks total (this report scope) | 1 (task 4.1 / S4-foundation) |
| Tasks complete per apply-progress.md | 1 |
| Tasks complete per tasks.md checkbox | 1 -- checkbox is [x] 4.1 S4-foundation (correctly reflects completion). Task 4.2 (S4-crear, next phase) is correctly left [ ]. |

### Build and Tests Execution

Build: Passed
```text
npm run typecheck   (from worktree root)
all 6 workspaces (web, data, functions, shared, contracts, tools) pass
exit 0
```
Notably: web typechecked clean with no exhaustive-switch/Record<RolUsuario,...> fallout from the RolUsuario widen -- confirms apply-progress.md own claim.

Tests: reproduced live in this session, both focused commands separately (the task specifies two distinct runners for two distinct workspaces):

```text
(cd contracts && npx vitest run schemas/crear-cajero.schema.test.ts schemas/actualizar-cajero.schema.test.ts)
Test Files  2 passed (2)
     Tests  21 passed (21)
exit 0
```

```text
(cd packages/functions && firebase emulators:exec --project demo-conteo-eficiente --only firestore,auth "npx vitest run test/lib/exigir-admin.test.ts")
Test Files  1 passed (1)
     Tests  26 passed (26)
exit 0
```

Full monorepo suite was NOT re-run here per instructions (focused-only scope for this report, do not run the full suite).

Coverage: not available -- no coverage tool detected in contracts/packages/functions (informational only, not blocking per Strict TDD rules).

### Source inspection -- implementation vs. design.md D1/D3/Interfaces block

packages/shared/src/models/usuario.ts:

| Before | After |
|---|---|
| type RolUsuario = "admin" pipe "cajero" | type RolUsuario = "admin" pipe "admin_sucursal" pipe "cajero" |

contracts/schemas/crear-cajero.schema.ts and actualizar-cajero.schema.ts (identical shape): rol enum widened to include "admin_sucursal"; both gain a .refine enforcing rol !== "admin_sucursal" OR sucursalesAsignadas.length === 1, path sucursalesAsignadas. Matches the admin-sucursal spec cardinality requirement and design.md D3/D-6 note verbatim.

packages/functions/src/lib/exigir-admin.ts -- new exports checked against design.md Interfaces block:

| Interface signature (design.md) | Implementation | Match |
|---|---|---|
| exigirCajeroDeAlcance(alcance, rol, sucursales): void -- rol cajero y sucursales exactamente [alcance] | alcance === null returns (Gerente no-op); else rol !== "cajero" throws permission-denied; else delegates to exigirExclusivaDeSucursal(alcance, sucursales) | Exact |
| exigirCajeroObjetivo(auth, alcance, uid): Promise<void> -- Claims del objetivo (doc 09 par.2); null returns without reading | alcance === null returns immediately, before any auth.getUser call; else auth.getUser(uid) (catches auth/user-not-found, throws HttpsError not-found; rethrows any other error) then calls exigirCajeroDeAlcance(alcance, customClaims rol, customClaims sucursales) | Exact -- reads customClaims, never usuarios/{uid}, per D3 |

Confirmed via git diff --stat restricted to packages/functions/src/callables/: zero callable files changed in this slice -- the helpers are genuinely additive/unwired, exactly as task 4.1 and apply-progress.md state (unused until S4-crear+; revert is a no-op for running callables).

### Spec Compliance Matrix (S4-foundation scope only)

| Requirement | Scenario | Test | Result |
|---|---|---|---|
| admin-sucursal / RolUsuario admits admin_sucursal with exactly one sucursal | Single sucursal passes (affirmative) | crear-cajero.schema.test.ts "acepta admin_sucursal con exactamente 1 sucursal asignada"; actualizar-cajero.schema.test.ts same case | COMPLIANT |
| admin-sucursal / RolUsuario admits admin_sucursal with exactly one sucursal | Zero or multiple sucursales rejected (negative) | Both schema test files: "rechaza sin ninguna sucursal asignada" plus "rechaza con mas de una sucursal asignada" (2 sub-cases each, cardinality discriminated alone) | COMPLIANT |
| gestion-cajeros (ADDED) / crearCajeroSchema enforces admin_sucursal cardinality | admin_sucursal with one sucursal passes (affirmative) | crear-cajero.schema.test.ts cardinality describe block | COMPLIANT |
| gestion-cajeros (ADDED) / crearCajeroSchema enforces admin_sucursal cardinality | Zero or multiple sucursales rejected (negative) | Same describe block, 2 sub-cases | COMPLIANT |
| gestion-cajeros (MODIFIED) / actualizarCajero has a new zod contract | Complete update passes (affirmative, unchanged) | actualizarCajeroSchema base describe block, "acepta el objeto completo" | COMPLIANT |
| gestion-cajeros (MODIFIED) / actualizarCajero has a new zod contract | Partial update rejected (negative, unchanged) | "rechaza un objeto parcial sin rol ni sucursalesAsignadas" | COMPLIANT |
| gestion-cajeros (MODIFIED) / actualizarCajero has a new zod contract | Invalid rol rejected (negative, discriminates enum) | "rechaza un rol fuera del enum, con el resto de campos validos" | COMPLIANT |
| gestion-cajeros (MODIFIED) / actualizarCajero has a new zod contract | Oversized sucursalesAsignadas rejected (negative, unchanged) | "rechaza mas de 10 sucursales asignadas, con el resto de campos validos" | COMPLIANT |
| gestion-cajeros (MODIFIED) / actualizarCajero has a new zod contract | admin_sucursal with one sucursal passes (affirmative, NEW) | Cardinality describe block | COMPLIANT |
| gestion-cajeros (MODIFIED) / actualizarCajero has a new zod contract | admin_sucursal with zero or multiple sucursales rejected (negative, NEW) | Cardinality describe block, 2 sub-cases | COMPLIANT |

Compliance summary: 10/10 scenario-instances compliant across 3 requirements -- the only requirements this slice can fully satisfy (schema layer, additive helpers). Every scenario was reproduced live in this session (see Build and Tests Execution above).

Explicitly OUT OF SCOPE for this report (not failed -- later slices per tasks.md ordering):

| Requirement (gestion-cajeros) | Why out of scope | Slice that closes it |
|---|---|---|
| All three callables are Gerente-only or admin_sucursal scoped with anti-escalation (crearCajero, actualizarCajero, desactivarCajero) | Requires wiring exigirCajeroDeAlcance/exigirCajeroObjetivo into the 3 callables; confirmed zero callable files touched in this slice | S4-crear (4.2), S4-actualizar (4.3), S4-desactivar-reactivar (4.4, desactivar half) |
| reactivarCajero is Gerente-only or admin_sucursal scoped to its own sucursal | Same -- callable wiring not present | S4-desactivar-reactivar (4.4, reactivar half) |
| eliminarCajero is Gerente-only or admin_sucursal scoped, decided before any side effect | Same -- callable wiring not present | S4-eliminar (4.5) |

### Task-level invariant verification (task 4.1 own RED-test contract, design.md Interfaces block)

Not a top-level spec Requirement on its own (the helpers are a design-level mechanism, not user-facing behavior yet), but task 4.1 explicitly names the required test coverage for both new helpers. Verified against the live exigir-admin.test.ts diff:

| Helper | Required case (task 4.1) | Test present | Result |
|---|---|---|---|
| exigirCajeroDeAlcance | Rejects non-cajero rol | "rechaza rol admin (anti-escalada)", "rechaza rol admin_sucursal (anti-escalada)" | PASS |
| exigirCajeroDeAlcance | Rejects foreign or extra sucursal | "rechaza una sucursal ajena", "rechaza sucursales extra ademas de la propia" | PASS |
| exigirCajeroDeAlcance | Passes on exact match | "permite rol cajero con exactamente la sucursal del alcance" | PASS |
| exigirCajeroDeAlcance | No-ops for Gerente (null) | "no aplica restriccion para el alcance Gerente (null)" | PASS |
| exigirCajeroObjetivo | No-ops on null without reading Auth | "no aplica restriccion y NO lee Auth para el alcance Gerente (null)" -- proven via a non-existent uid that would fail if Auth were actually read | PASS |
| exigirCajeroObjetivo | Rejects target rol not equal cajero | "rechaza un objetivo con rol distinto de cajero" | PASS |
| exigirCajeroObjetivo | Rejects target sucursales not equal [own] | "rechaza un objetivo cajero compartido con otra sucursal", "rechaza un objetivo cajero de otra sucursal" | PASS |
| exigirCajeroObjetivo | Passes on match | "permite un objetivo cajero de exactamente la sucursal del alcance" | PASS |
| exigirCajeroObjetivo | Target not found in Auth | "rechaza not-found cuando el uid objetivo no existe en Auth" (not explicitly named in task 4.1 RED list, but required by the Interfaces block not-found note) | PASS |

All task-level invariant cases hold (26 total assertions in the file across both describe blocks, all passing). The no-op-without-reading-Auth proof technique (nonexistent-uid probe) is a real discriminating test, not a tautology.

### Correctness (Static and Runtime Evidence)

| Behavior | Status | Notes |
|---|---|---|
| RolUsuario widened to include "admin_sucursal" | Implemented | Confirmed via diff; npm run typecheck clean across all 6 workspaces including web, which consumes RolUsuario |
| crearCajeroSchema/actualizarCajeroSchema rol enum widened plus refine cardinality rule added | Implemented | Confirmed via diff, both schemas identical shape; 21/21 contracts tests pass |
| exigirCajeroDeAlcance matches Interfaces block signature and behavior | Implemented | Confirmed via diff and live test run |
| exigirCajeroObjetivo matches Interfaces block signature and behavior, reads Auth custom claims (never usuarios/{uid}), per D3 | Implemented | Confirmed via diff and live test run against real Auth emulator (auth.createUser/setCustomUserClaims/getUser) |
| Zero callable files (crear-cajero.ts, actualizar-cajero.ts, desactivar-cajero.ts, reactivar-cajero.ts, eliminar-cajero.ts) modified -- additive-only slice | Implemented | Confirmed via git diff --stat restricted to packages/functions/src/callables/ returning empty |
| docs/diseno/03-modelo-de-dominio.md rol enum documentation | No change needed | Already widened in S1 (line 40); apply-progress.md Deviations section correctly notes this rather than silently skipping doc work |

### Coherence (Design)

| Decision | Followed | Notes |
|---|---|---|
| D3 -- target checks resolve on Auth custom claims, never usuarios/{uid} | Yes | exigirCajeroObjetivo reads auth.getUser(uid).customClaims, no Firestore read |
| D-6 (schema cardinality) | Yes | Both schemas gain the identical refine |
| Interfaces block signatures (exigirCajeroDeAlcance, exigirCajeroObjetivo) | Yes | Verbatim match, see Source inspection above |
| Migration/Rollout table: S4 precedes S6, RolUsuario widens in S4 together with the schemas | Yes | Both widened together in this single slice, as designed |
| Task 4.1 scope discipline: helpers additive/unwired until S4-crear+ | Yes | Confirmed -- zero callable files touched |

### TDD Compliance

| Check | Result | Details |
|---|---|---|
| TDD Evidence reported | Yes | apply-progress.md Phase 4 section 4.1 has a RED/GREEN/REFACTOR table |
| RED confirmed | Yes (per apply-progress.md) | Contracts: 19/21 passed, 2 failed for the right reason (affirmative admin_sucursal case against the old enum, since negative cardinality cases already fail on the old enum alone). Functions: 14/26 passed, 12 failed for the right reason (is not a function) |
| GREEN confirmed | Yes | 21/21 (contracts) plus 26/26 (functions), reproduced live in this verification session |
| Triangulation adequate | Yes | Each helper has affirmative, Gerente no-op, and multiple distinct negative branches (wrong rol, foreign sucursal, extra sucursal, target not found); no gap comparable to S3a/S3b carried-over length-1-foreign WARNING -- that exact case IS covered here ("rechaza una sucursal ajena") |
| Safety net for modified files | Yes | Pre-existing crearCajeroSchema/actualizarCajeroSchema base describe blocks and exigirAdmin/exigirAdminDeSucursal/exigirExclusivaDeSucursal describe blocks ran unchanged in the same test runs |
| Known apply-time caveat honestly disclosed | Yes | apply-progress.md Issues Found section states None and this verification found no undisclosed deviation |

TDD Compliance: 6/6 checks fully passed.

### Assertion Quality

Scanned the 7-file diff for banned patterns: no tautologies, no assertions skipping production-code calls, no ghost loops, no smoke-test-only patterns. exigirCajeroObjetivo tests use the real Auth emulator (auth.createUser/setCustomUserClaims/getUser/deleteUser), not mocks; each test has its own afterEach cleanup of created uids. Every negative schema test discriminates a single field (per AGENTS.md par.2 style already established in this change).

Assertion quality: 0 CRITICAL, 0 WARNING

### Budget

git diff --numstat for task 4.1 7 files: 29+0, 12+6, 29+0, 13+7, 47+0, 87+1, 1+1 = 233 additions+deletions. Well under the 400-line hard limit and under the ~310 forecast in tasks.md Suggested Work Units table.

### Issues Found

CRITICAL: None.

WARNING: None.

SUGGESTION:
1. exigirCajeroObjetivo has no explicit test for a target whose customClaims object exists but is entirely missing sucursales (e.g. a legacy Auth user with only rol set). Low risk: exigirCajeroDeAlcance downstream check already treats an undefined sucursales as not-an-array-of-length-1 and rejects -- verified by direct source inspection -- so the code path is exercised indirectly by the "rol distinto de cajero" case own undefined-sucursales shape, but no case isolates a cajero-rol target with missing sucursales specifically. Not blocking; can be folded into S4-crear/S4-actualizar own test suites if a real legacy-claim scenario is discovered.
2. Task 4.1 RED-test list did not explicitly name the target-not-found-in-Auth case, but the Interfaces block requires it (not-found note) and it IS tested -- worth updating tasks.md task 4.1 RED-test description to mention it explicitly for consistency with what was actually built, purely a documentation-completeness note, not a functional gap.

### Verdict

PASS -- S4-foundation (task 4.1: RolUsuario widen, crearCajeroSchema/actualizarCajeroSchema cardinality refine, and the two new anti-escalation/target-claim helpers exigirCajeroDeAlcance/exigirCajeroObjetivo) is complete and additive-only: zero callable files were touched, matching the slice own rollback-boundary claim. All 3 spec requirements this slice can fully satisfy (schema-layer cardinality in both admin-sucursal and gestion-cajeros) are 10/10 scenario-instances COMPLIANT, reproduced live in this session (21/21 contracts plus 26/26 functions). The two new helpers match design.md Interfaces block signatures and D3 claims-authority rule exactly, and all task 4.1 invariant cases pass. Typecheck is clean across all 6 workspaces with no fallout from the RolUsuario widen. Zero CRITICAL, zero WARNING, two purely informational SUGGESTIONs (neither blocking). S4-crear through S4-eliminar (callable wiring for the 5 cajero callables) remain correctly unimplemented and out of scope for this report, not failed.
