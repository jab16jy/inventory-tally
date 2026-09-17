```yaml
schema: gentle-ai.verify-result/v1
evidence_revision: sha256:f2c1eb8ee17278f572615864c4dbaa9ed6796945118daaca33722a1693f27fb4
verdict: pass
blockers: 0
critical_findings: 0
requirements: 1/1
scenarios: 8/8
test_command: (cd packages/functions && firebase emulators:exec --project demo-conteo-eficiente --only firestore,auth "npx vitest run test/callables/crear-cajero.test.ts")
test_exit_code: 0
test_output_hash: sha256:c848233c929d9cf7fa28487c9ddf9095a17eb341e97a48bc0beeda05ab002100
build_command: npm run typecheck (worktree root, all workspaces)
build_exit_code: 0
build_output_hash: sha256:c0ec79fcf6f09a053bc62c51241988ca2b9a0a7a6ff7e960b8727c6bb1bd74f1
```

## Verification Report

**Change**: rol-admin-sucursal
**Scope**: Slice S4-crear only (task 4.2: `crearCajero` anti-escalation wiring). S1/S2a/S2b/S3a/S3b/S4-foundation are separate, already-verified slices (verify-report-s1.md through verify-report-s4-foundation.md -- not re-litigated here). S4-actualizar/S4-desactivar-reactivar/S4-eliminar (wiring for actualizarCajero/desactivarCajero/reactivarCajero/eliminarCajero) are NOT implemented in this slice and are explicitly OUT OF SCOPE below (not failed).
**Version**: N/A
**Mode**: Strict TDD

**Worktree**: C:/Users/PC RYZEN/Documents/Proyectos/Sistema inventario-worktrees/feat-rol-admin-sucursal-crear-cajero, branch feat/rol-admin-sucursal-crear-cajero, based on f575ef5 (S4-foundation merge point). No commit made -- candidate is unstaged in the worktree; git status --short showed exactly the 2 files apply-progress.md claims, both before and after every command run in this verification.

### Evidence revision -- how it was computed

sha256 of the exact unified diff (git diff) restricted to the 2 files task 4.2 touches, in this fixed (alphabetical) order: packages/functions/src/callables/crear-cajero.ts, packages/functions/test/callables/crear-cajero.test.ts.

git diff --numstat on the same 2 paths: 6+2, 153+2 = 163 additions+deletions. Matches apply-progress.md own Budget section (163, forecast ~180) exactly -- no discrepancy (no orchestrator post-writer addition for this slice).

### Completeness (S4-crear only)

| Metric | Value |
|--------|-------|
| Tasks total (this report scope) | 1 (task 4.2 / S4-crear) |
| Tasks complete per apply-progress.md | 1 |
| Tasks complete per tasks.md checkbox | 1 -- checkbox is [x] 4.2 S4-crear (correctly reflects completion). Task 4.3 (S4-actualizar, next phase) is correctly left [ ]. |

### Build and Tests Execution

Build: Passed
```text
npm run typecheck   (from worktree root)
all 6 workspaces (web, data, functions, shared, contracts, tools) pass
exit 0
```

Tests: reproduced live in this session (focused command from tasks.md row 4.2):

```text
(cd packages/functions && firebase emulators:exec --project demo-conteo-eficiente --only firestore,auth "npx vitest run test/callables/crear-cajero.test.ts")
Test Files  1 passed (1)
     Tests  9 passed (9)
exit 0
```

Full monorepo suite was run once during apply (before the RDD freeze) and was green in a single clean pass -- web 472/472, data 103/103, functions 238/238 (32 files), shared 120/120, contracts 71/71, exit 0; typecheck and lint clean. It was NOT re-run in this verification (focused-only scope for this report, and re-running the full suite cannot touch the frozen candidate either way).

Coverage: not available -- no coverage tool detected in packages/functions (informational only, not blocking per Strict TDD rules).

### Source inspection -- implementation vs. design.md Interfaces block

packages/functions/src/callables/crear-cajero.ts (wrapper only, 6+2):

| Before | After |
|---|---|
| `exigirAdmin(req)` then `validar` then `crearCajeroImpl` | `const alcance = exigirAdminDeSucursal(req)` then `validar` then `exigirCajeroDeAlcance(alcance, datos.rol, datos.sucursalesAsignadas)` then `crearCajeroImpl` |

Matches design.md Interfaces row `crearCajero | wrapper: exigirCajeroDeAlcance(alcance, datos.rol, datos.sucursalesAsignadas)` verbatim. Both gates run before `crearCajeroImpl` -- the only Auth/Firestore writer -- so a denied caller performs zero side effects. `crearCajeroImpl` is byte-identical (untouched). No new helpers, no doc change (task 4.2 Files list names only these 2 files; doc 08 carries no cajero-gate catalog to extend).

### Spec Compliance Matrix (S4-crear scope only)

Requirement: gestion-cajeros MODIFIED -- `crearCajero` is Gerente-only or admin_sucursal scoped to its own sucursal, with anti-escalation (crearCajero portion only; actualizarCajero/desactivarCajero portions belong to later slices).

| Scenario | Test | Result |
|---|---|---|
| admin_sucursal creates a cajero for its own sucursal (affirmative) | "admin_sucursal crea un cajero de su propia sucursal (afirmativo)" -- asserts creado, claims {rol cajero, sucursales [own]}, perfil activo | COMPLIANT |
| admin_sucursal attempts rol admin (negative -- anti-escalation) | "asigna rol admin es rechazado antes de escribir" -- permission-denied + afirmarSinEfecto (getUserByEmail throws, zero perfiles) | COMPLIANT |
| admin_sucursal attempts rol admin_sucursal (negative -- anti-escalation) | "asigna rol admin_sucursal es rechazado antes de escribir" -- same absence asserts | COMPLIANT |
| admin_sucursal attempts foreign sucursal (negative) | "sucursal ajena o extra" first half -- permission-denied + afirmarSinEfecto | COMPLIANT |
| admin_sucursal attempts extra sucursal (negative) | same test, second half ([own, foreign]) -- permission-denied + afirmarSinEfecto | COMPLIANT |
| Malformed claim, 0 sucursales (negative) | "claim malformado (0 o 2 sucursales)" first half -- permission-denied + afirmarSinEfecto | COMPLIANT |
| Malformed claim, 2 sucursales (negative) | same test, second half -- permission-denied + afirmarSinEfecto | COMPLIANT |
| Gerente unaffected (affirmative, regression) | "admin (Gerente) no se ve afectado por el alcance" -- creado true | COMPLIANT |

Compliance summary: 8/8 scenario-instances compliant, all reproduced live in this session (9/9 tests: 3 pre-existing Impl + 6 new wrapper cases; the foreign/extra and malformed pairs share one test each with two sequential denies).

Explicitly OUT OF SCOPE for this report (not failed -- later slices per tasks.md ordering):

| Requirement (gestion-cajeros) | Why out of scope | Slice that closes it |
|---|---|---|
| actualizarCajero anti-escalation + target-claim wiring | Requires exigirCajeroDeAlcance + exigirCajeroObjetivo wiring into actualizar-cajero.ts; confirmed untouched (git diff --stat on it returns empty) | S4-actualizar (4.3) |
| desactivarCajero/reactivarCajero target-claim wiring | Same -- callable wiring not present | S4-desactivar-reactivar (4.4) |
| eliminarCajero target-claim wiring before side effects | Same -- callable wiring not present | S4-eliminar (4.5) |

The spec's Unauthenticated/Cajero-caller scenarios for crearCajero are unchanged behavior, transitively covered by exigirAdminDeSucursal's own tests (S2a) -- not re-proven at wrapper level here (same convention as S2b/S3a/S3b).

### Task-level invariant verification (task 4.2 own RED-test contract)

| Required case (task 4.2) | Test present | Result |
|---|---|---|
| own-sucursal cajero affirmative | "crea un cajero de su propia sucursal (afirmativo)" | PASS |
| escalation (rol admin/admin_sucursal) rejected pre-write | two dedicated tests, both with afirmarSinEfecto | PASS |
| foreign/extra sucursal rejected pre-write | one test, two sequential denies, both with afirmarSinEfecto | PASS |
| malformed claim rejected | one test (0- and 2-sucursal), both with afirmarSinEfecto | PASS |
| Gerente regression | "admin (Gerente) no se ve afectado" | PASS |

### Correctness (Static and Runtime Evidence)

| Behavior | Status | Notes |
|---|---|---|
| Wrapper calls exigirAdminDeSucursal before validar, exigirCajeroDeAlcance after validar, both before crearCajeroImpl | Implemented | Confirmed via diff; no Auth/Firestore write precedes either gate |
| Every negative asserts absence of effect (no Auth user, no perfil) | Implemented | afirmarSinEfecto helper; all 5 negative paths (2 escalation + foreign + extra + 2 malformed = 6 denies) assert it |
| New tests clean up everything they create | Implemented | afterEach deletes Auth user + usuarios doc + auditoria events per created uid |
| Pre-existing crearCajeroImpl tests unaffected | Implemented | 3/3 pass unchanged in the same run |

### Coherence (Design)

| Decision | Followed | Notes |
|---|---|---|
| D3 -- input-level anti-escalation on rol+sucursalesAsignadas for crearCajero | Yes | exigirCajeroDeAlcance on validated input, wrapper placement per Interfaces table |
| D1 -- role gate before any read | Yes | exigirAdminDeSucursal is the first wrapper call |
| D5 -- wrapper proven through .run(req) | Yes | all 6 new tests use crearCajero.run(req) |
| Task 4.2 scope discipline (2 files, no helpers, no docs) | Yes | Confirmed -- diff touches only crear-cajero.ts + its test |

### TDD Compliance

| Check | Result | Details |
|---|---|---|
| TDD Evidence reported | Yes | apply-progress.md Phase 4 section 4.2 has a RED/GREEN/REFACTOR table |
| RED confirmed | Yes (per apply-progress.md) | 8/9 passed, 1 failed for the right reason (Se requiere rol admin. on the affirmative against the old unconditional exigirAdmin gate) |
| GREEN confirmed | Yes | 9/9, reproduced live in this verification session |
| Triangulation adequate | Yes | Affirmative + Gerente no-op + 4 distinct negative branches (wrong rol x2, foreign/extra sucursal, malformed claim x2); negatives assert absence of effect so they are not vacuous (removing the gate flips them to resolve) |
| Safety net for modified files | Yes | Pre-existing crearCajeroImpl block (3 tests) ran unchanged in the same run |
| Known apply-time caveat honestly disclosed | Yes | apply-progress.md notes the S2b/S3a-pattern RED asymmetry (negatives pass trivially against the old gate; the affirmative is the discriminator) |

TDD Compliance: 6/6 checks fully passed.

### Assertion Quality

Scanned the 2-file diff for banned patterns: no tautologies, no assertions skipping production-code calls, no ghost loops, no smoke-test-only patterns. Negatives use real Auth/Firestore emulator reads for absence asserts, not mocks. Each negative discriminates a single reason (complete otherwise-valid input per AGENTS.md section 2).

Assertion quality: 0 CRITICAL, 0 WARNING

### Budget

git diff --numstat for task 4.2 2 files: 6+2, 153+2 = 163 additions+deletions. Well under the 400-line hard limit and under the ~180 forecast in tasks.md Suggested Work Units table.

### Issues Found

CRITICAL: None.

WARNING: None (verification-level; the RDD reviewer's 2 WARNINGs -- empty-sucursalesAsignadas untested, Gerente regression cajero-only -- were admitted as informational advisory findings R3-001/R3-002 on receipt review-a73e795f7741c5af and require no correction per change policy).

SUGGESTION:
1. RDD reviewer remark (not captured -- outside the frozen candidate, recorded here for the record): no forbidOnly on the functions test path, so CI would pass with a focused test.only. Pre-existing repo gap, out of slice scope.

### RDD Receipt

lineage review-a73e795f7741c5af (review-reliability, order 0), state approved, problems []. 4 advisory findings admitted (R3-001 WARNING, R3-002 WARNING, R3-003 SUGGESTION, R3-004 SUGGESTION), all disposition informational -- none opened a correction, none reopens the review. No correction transaction was offered or consumed; the frozen candidate is byte-identical to what was reviewed (git status --short still shows exactly the same 2 modified files, unstaged).

### Verdict

PASS -- S4-crear (task 4.2: crearCajero anti-escalation wiring) is complete and minimal: the wrapper enforces exigirAdminDeSucursal then exigirCajeroDeAlcance before any Auth/Firestore write, exactly per design.md Interfaces. All 8 crearCajero scenario-instances are COMPLIANT, reproduced live (9/9 focused tests, exit 0). Typecheck clean across all 6 workspaces. Zero CRITICAL, zero verification-level WARNING, one recorded out-of-scope SUGGESTION. S4-actualizar through S4-eliminar remain correctly unimplemented and out of scope for this report, not failed.
