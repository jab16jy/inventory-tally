```yaml
schema: gentle-ai.verify-result/v1
evidence_revision: sha256:cf5d0c9fcf84f613daf8889fedf602ba0173fc44424e63582e92f9a84193c908
verdict: pass_with_warnings
blockers: 0
critical_findings: 0
requirements: 1/1
scenarios: 9/9
test_command: (cd packages/functions && firebase emulators:exec --project demo-conteo-eficiente --only firestore,auth "npx vitest run test/callables/actualizar-cajero.test.ts")
test_exit_code: 0
test_output_hash: sha256:44c353077efc658436ab3d3b3be2a1b1aa3cd784b3d80c7bf8aaf4a389168a9c
build_command: npm run typecheck (worktree root, all workspaces)
build_exit_code: 0
build_output_hash: sha256:2f3195dd2626c149fc17ec47a09bf8d8f5bc93d7548baf414d2587aa78902a65
```

## Verification Report

**Change**: rol-admin-sucursal
**Scope**: Slice S4-actualizar only (task 4.3: `actualizarCajero` anti-escalation + target-claims wiring). S1/S2a/S2b/S3a/S3b/S4-foundation/S4-crear are separate, already-verified slices (verify-report-s1.md through verify-report-s4-crear.md, not re-litigated here). S4-desactivar-reactivar (task 4.4: `desactivarCajero`/`reactivarCajero`) and S4-eliminar (task 4.5: `eliminarCajero`) are NOT implemented in this slice and are explicitly OUT OF SCOPE below (not failed). S5 through S7 are unimplemented and out of scope.

**Version**: N/A
**Mode**: Strict TDD

**Worktree**: C:/Users/PC RYZEN/Documents/Proyectos/Sistema inventario-worktrees/feat-rol-admin-sucursal-actualizar-cajero, branch feat/rol-admin-sucursal-actualizar-cajero, based on 13f0793 (S4-crear commit). No commit made, candidate is unstaged in the worktree; `git status --short` showed exactly the 2 files apply-progress.md claims, before and after every command run in this verification.

### Evidence revision, how it was computed

sha256 of the exact unified diff (`git diff`) restricted to the 2 files task 4.3 touches, in this fixed (alphabetical) order: `packages/functions/src/callables/actualizar-cajero.ts`, `packages/functions/test/callables/actualizar-cajero.test.ts`.

`git diff --numstat` on the same 2 paths: 11+2, 238+3 = 254 additions and deletions. This does NOT match apply-progress.md own Budget section (226, forecast about 220), see WARNING in Issues Found. Still well under the 400-line hard limit.

### Completeness (S4-actualizar only)

| Metric | Value |
|--------|-------|
| Tasks total (this report scope) | 1 (task 4.3 / S4-actualizar) |
| Tasks complete per apply-progress.md | 1 |
| Tasks complete per tasks.md checkbox | 0, checkbox is `[ ]` for 4.3, not yet checked. Consistent with the convention observed across every prior slice in this change: tasks.md gets checked at commit time (post-verify), and no commit has been made for this slice yet, matching the instruction not to mark tasks.md here. Not a blocking discrepancy; apply-progress.md own tracking checkbox for 4.3 is `[x]` and matches the observed code and test state. |

### Build and Tests Execution

Build: Passed
```text
npm run typecheck   (from worktree root)
all 6 workspaces (web, data, functions, shared, contracts, tools) pass
exit 0
```

Tests: reproduced live in this session (focused command from tasks.md row 4.3):
```text
(cd packages/functions && firebase emulators:exec --project demo-conteo-eficiente --only firestore,auth "npx vitest run test/callables/actualizar-cajero.test.ts")
Test Files  1 passed (1)
     Tests  10 passed (10)
exit 0
```

Note: apply-progress.md TDD Cycle Evidence table and Files Changed table describe "6 new" wrapper cases and a final count of "9/9 passed (3 pre-existing Impl + 6 new wrapper)". Live reproduction in this session shows 10/10 (3 pre-existing Impl + 7 new wrapper `it()` blocks in the `actualizarCajero — autorizacion de sucursal (D3, S4-actualizar)` describe block). See WARNING in Issues Found, this is a documentation undercount, not a functional gap; all 7 wrapper tests map to compliant spec scenarios below.

Full monorepo suite was run once during apply (before the RDD freeze) and was reported green in a single clean pass, web 472/472, data 103/103, functions 244/244 (32 files, incl. actualizar-cajero.test.ts reported as 9/9, actually 10/10 per this verification), shared 120/120, contracts 71/71, exit 0. It was NOT re-run in this verification (focused-only scope for this report, per S4-crear precedent).

Coverage: not available, no coverage tool detected in packages/functions (informational only, not blocking per Strict TDD rules).

### Source inspection, implementation vs. design.md Interfaces block

packages/functions/src/callables/actualizar-cajero.ts (wrapper only, 11+2):

| Before | After |
|---|---|
| `exigirAdmin(req)` then `validar` then `actualizarCajeroImpl` | `const alcance = exigirAdminDeSucursal(req)` then `validar` then `exigirCajeroDeAlcance(alcance, datos.rol, datos.sucursalesAsignadas)` then `await exigirCajeroObjetivo(getAuth(), alcance, datos.uid)` then `actualizarCajeroImpl` |

Matches design.md Interfaces row `actualizarCajero | wrapper: the input check + await exigirCajeroObjetivo(getAuth(), alcance, datos.uid)` verbatim. All three gates (`exigirAdminDeSucursal`, `exigirCajeroDeAlcance`, `exigirCajeroObjetivo`) run before `actualizarCajeroImpl`, the only Auth/Firestore writer, so a denied caller performs zero side effects. `actualizarCajeroImpl` is byte-identical (untouched). No new helpers (both `exigirCajeroDeAlcance` and `exigirCajeroObjetivo` are reused verbatim from S4-foundation), no doc change (task 4.3 Files list names only these 2 files; doc 08 carries no cajero-gate catalog to extend, same rationale as S4-crear).

`exigirCajeroObjetivo` (packages/functions/src/lib/exigir-admin.ts, unchanged by this slice, inspected for correctness): no-ops on Gerente (`alcance === null`) without reading Auth; else calls `auth.getUser(uid)`, converts `auth/user-not-found` to `HttpsError("not-found", ...)`, and delegates the claim check to `exigirCajeroDeAlcance(alcance, objetivo.customClaims?.rol, objetivo.customClaims?.sucursales)`, reading the target CURRENT Auth custom claims exclusively, never `usuarios/{uid}`, exactly per D3.

### Spec Compliance Matrix (S4-actualizar scope only)

Requirement: gestion-cajeros MODIFIED, "All three callables are Gerente-only or admin_sucursal scoped to its own sucursal, with anti-escalation" (`actualizarCajero` portion only; `crearCajero` portion verified in verify-report-s4-crear.md; `desactivarCajero` portion belongs to task 4.4, not implemented here).

| Scenario | Test | Result |
|---|---|---|
| Gerente caller proceeds regardless of sucursal (affirmative, regression) | "admin (Gerente) no se ve afectado por el alcance (regresion)" | COMPLIANT |
| admin_sucursal attempts rol admin (negative, anti-escalation, input) | "admin_sucursal que asigna rol admin/admin_sucursal es rechazado antes de escribir" first assert, permission-denied, claims/setCustomUserClaims and revokeRefreshTokens not called, profile name unchanged | COMPLIANT |
| admin_sucursal attempts rol admin_sucursal (negative, anti-escalation, input) | same test, second assert | COMPLIANT |
| admin_sucursal attempts foreign/extra sucursal on input (negative) | "admin_sucursal que amplia sucursalesAsignadas a una sucursal ajena es rechazado" - permission-denied, profile/claims unchanged | COMPLIANT |
| admin_sucursal updates a cajero assigned solely to its own sucursal (affirmative) | "admin_sucursal actualiza un cajero de su propia sucursal (afirmativo)" - actualizado true, profile renamed | COMPLIANT |
| admin_sucursal attempts to update a cajero shared with another sucursal (negative, decision #2) | "objetivo con sucursal compartida es rechazado, perfil y claims intactos" - permission-denied, profile/claims unchanged | COMPLIANT |
| admin_sucursal attempts to update a cajero of another sucursal entirely (negative) | "objetivo de sucursal ajena es rechazado antes de escribir" - permission-denied, profile/claims unchanged | COMPLIANT |
| Malformed claim, 0 sucursales (negative) | "claim del llamante malformado (0 o 2 sucursales) es rechazado antes de leer el objetivo" first assert, permission-denied, auth.getUser spy proves target never read | COMPLIANT |
| Malformed claim, 2 sucursales (negative) | same test, second assert | COMPLIANT |

Compliance summary: 9/9 scenario-instances compliant, all reproduced live in this session (7 new wrapper `it()` blocks; the escalation and malformed-claim pairs each share one test with two sequential denies, same convention as S4-crear).

Explicitly OUT OF SCOPE for this report (not failed, later slices per tasks.md ordering):

| Requirement (gestion-cajeros) | Why out of scope | Slice that closes it |
|---|---|---|
| `desactivarCajero` target-claim wiring (MODIFIED requirement `desactivarCajero` portion) | Callable wiring not present; `git diff --stat` on `desactivar-cajero.ts` returns empty | S4-desactivar-reactivar (4.4) |
| `reactivarCajero` target-claim wiring (ADDED requirement) | Same, callable wiring not present | S4-desactivar-reactivar (4.4) |
| `eliminarCajero` target-claim wiring before side effects (ADDED requirement) | Same, callable wiring not present | S4-eliminar (4.5) |

The spec Unauthenticated/Cajero-caller scenarios for `actualizarCajero` are unchanged behavior, transitively covered by `exigirAdminDeSucursal` own tests (S2a), not re-proven at wrapper level here (same convention as S2b/S3a/S3b/S4-crear, and explicitly documented in the test file own header comment).

The target-has-rol-admin/admin_sucursal branch of `exigirCajeroObjetivo` (i.e. `exigirCajeroDeAlcance` `rol !== "cajero"` check applied to the TARGET claims rather than the input) is exercised by neither this slice wrapper tests nor an explicit scenario in the "All three callables" MODIFIED requirement (that exact scenario only appears as an explicit ADDED-requirement scenario for `reactivarCajero`/`eliminarCajero`, task 4.4/4.5, not yet implemented). It IS covered at the unit level by S4-foundation `exigirCajeroObjetivo` describe block (6 cases, exigir-admin.test.ts, verified in verify-report-s4-foundation.md), the wrapper reuses that helper verbatim, so the branch is unit-tested but not re-proven end-to-end through `actualizarCajero.run(req)` in this slice. Not a spec compliance gap for this report scope (no scenario in the delta spec requires it here), consistent with the wrapper-reuses-tested-helper convention already established for S4-crear.

### Task-level invariant verification (task 4.3 own RED-test contract)

| Required case (task 4.3) | Test present | Result |
|---|---|---|
| own-sucursal target affirmative | "admin_sucursal actualiza un cajero de su propia sucursal (afirmativo)" | PASS |
| input escalation rejected | "admin_sucursal que asigna rol admin/admin_sucursal es rechazado" (2 asserts) plus "que amplia sucursalesAsignadas a una sucursal ajena" (1 assert) | PASS |
| shared-sucursal target rejected unchanged | "objetivo con sucursal compartida es rechazado, perfil y claims intactos" | PASS |
| foreign target rejected | "objetivo de sucursal ajena es rechazado antes de escribir" | PASS |
| malformed claim rejected | "claim del llamante malformado (0 o 2 sucursales)" (2 asserts) | PASS |
| Gerente regression | "admin (Gerente) no se ve afectado por el alcance" | PASS |

All 6 required RED-test cases from tasks.md own row for 4.3 are present and passing (7 `it()` blocks realize them, since the input-escalation case splits rol-escalation and sucursal-escalation into 2 separate tests, a finer split than the task brief single bullet, not a gap).

### Correctness (Static and Runtime Evidence)

| Behavior | Status | Notes |
|---|---|---|
| Wrapper calls `exigirAdminDeSucursal` before `validar`, `exigirCajeroDeAlcance` after `validar` (input anti-escalation), `exigirCajeroObjetivo` before `actualizarCajeroImpl` (target-claims check) | Implemented | Confirmed via source read; no Auth/Firestore write precedes any of the three gates |
| Target check reads CURRENT Auth custom claims exclusively, never `usuarios/{uid}` | Implemented | `exigirCajeroObjetivo` calls `auth.getUser(uid)` and reads `customClaims`, never touches Firestore |
| Every negative asserts absence of effect (no claims write, no revoke, no profile change) | Implemented | All 6 negative tests assert `setCustomUserClaims`/`revokeRefreshTokens` not called and/or profile fields unchanged |
| New tests clean up everything they create | Implemented | `afterEach` deletes Auth user, perfil doc, and auditoria events per created uid |
| Pre-existing `actualizarCajeroImpl` tests unaffected | Implemented | 3/3 pass unchanged in the same run |

### Coherence (Design)

| Decision | Followed | Notes |
|---|---|---|
| D3, target check reads Auth custom claims, not `usuarios/{uid}`, for `actualizarCajero` | Yes | `exigirCajeroObjetivo(getAuth(), alcance, datos.uid)` wired exactly as designed |
| D3, input-level anti-escalation on `rol`+`sucursalesAsignadas` | Yes | `exigirCajeroDeAlcance` on validated input, before the target check, matching the Interfaces table order |
| D1, role gate before any read | Yes | `exigirAdminDeSucursal` is the first wrapper call |
| D5, wrapper proven through `.run(req)` | Yes | all 7 new tests use `actualizarCajero.run(req)` |
| Task 4.3 scope discipline (2 files, no helpers, no docs) | Yes | Confirmed, diff touches only `actualizar-cajero.ts` plus its test |

TOCTOU comparison against S3b eliminarCategoria treatment (per RDD WARNING, requested comparison, no code change made): S3b closed its analogous check-then-act window by re-running `exigirExclusivaDeSucursal` a second time INSIDE the same Firestore transaction that performs the write (`tx.get` then check then `tx.update`, all within one `runTransaction`), because the checked value (`sucursalesAsignadas`) and the write both live in Firestore and can be read and verified atomically together. S4-actualizar window is architecturally different: `exigirCajeroObjetivo` reads Firebase Auth custom claims (`auth.getUser`), a separate system from the Firestore transaction that `actualizarCajeroImpl` runs; Firestore transactions cannot span an Auth read, so there is no direct equivalent of "re-check inside the same tx" available here. Closing this window would require a different mechanism entirely, for example re-reading Auth claims a second time immediately before `tx.update`, which narrows but does not eliminate the race, since Auth and Firestore still commit independently. Given D3 explicit rejection of reading `usuarios/{uid}` as the source of truth (which is what would let a single Firestore transaction cover both the check and the write atomically), the S3b-style fix is not straightforwardly portable to this callable. The RDD WARNING disposition (informational, no correction required) is reasonable on that basis, but for a different reason than the S3b case rather than by direct analogy, worth carrying forward explicitly if S4-desactivar-reactivar/S4-eliminar (which share `exigirCajeroObjetivo`) hit the same tradeoff.

### TDD Compliance

| Check | Result | Details |
|---|---|---|
| TDD Evidence reported | Yes | apply-progress.md Task 4.3 section has a RED/GREEN/REFACTOR table |
| RED confirmed | Yes (per apply-progress.md) | 8/9 passed, 1 failed for the right reason (`Se requiere rol admin.` on the affirmative against the old unconditional `exigirAdmin` gate), consistent with the same asymmetry pattern documented since S2b (negatives pass trivially against the old gate) |
| GREEN confirmed | Yes | reproduced live in this verification session as 10/10 (apply-progress.md undercounts as 9/9, see WARNING) |
| Triangulation adequate | Yes | Affirmative plus Gerente no-op plus 5 distinct negative branches (rol escalation x2, sucursal-input escalation, shared target, foreign target, malformed claim x2); negatives assert absence of effect so they are not vacuous |
| Safety net for modified files | Yes | Pre-existing `actualizarCajeroImpl` block (3 tests) ran unchanged in the same run |
| Known apply-time caveat honestly disclosed | Yes | apply-progress.md notes the same RED asymmetry pattern documented since S2b/S3a/S4-crear |

TDD Compliance: 6/6 checks fully passed (the RED/GREEN test-count figures in apply-progress.md are inaccurate by one test, see WARNING, but the TDD cycle itself, as reproduced live, is sound).

### Assertion Quality

Scanned the 2-file diff for banned patterns: no tautologies, no assertions skipping production-code calls, no ghost loops, no smoke-test-only patterns. Negatives use real Auth/Firestore emulator reads for absence asserts (spies on `auth.setCustomUserClaims`/`auth.revokeRefreshTokens`/`auth.getUser`, plus direct Firestore reads), not mocks of the code under test. Each negative discriminates a single reason (complete otherwise-valid input per AGENTS.md section 2).

Assertion quality: 0 CRITICAL, 0 WARNING

### Budget

`git diff --numstat` for task 4.3 2 files, reproduced independently in this verification: 11+2, 238+3 = 254 additions and deletions. Well under the 400-line hard limit, but does not match apply-progress.md own Budget section (226, forecast about 220), see Issues Found WARNING.

### Issues Found

CRITICAL: None.

WARNING:
1. apply-progress.md TDD Cycle Evidence / Files Changed / Closing Checks sections undercount the new wrapper tests as "6 new" / "9/9 passed", but the actual test file contains 7 new `it()` blocks in the authorization describe block and the focused run reproduces 10/10. Every one of the 7 tests maps to a COMPLIANT spec scenario in this report, this is a documentation-accuracy defect in apply-progress.md, not a functional or coverage gap.
2. apply-progress.md Budget section reports 226 total additions and deletions (11+2, 210+3), but `git diff --numstat` reproduced independently in this verification shows 254 (11+2, 238+3), a 28-line undercount on the test file, consistent with the same one-test miscount above (the missing test lines were not counted). Still well under the 400-line hard limit; not a budget-policy violation, but the recorded number in apply-progress.md does not match the candidate bytes.
3. (Carried forward, not re-opened) TOCTOU between `exigirCajeroObjetivo` Auth read and `actualizarCajeroImpl` Firestore write, see the dedicated comparison section above. RDD-approved informational finding; no correction required for this candidate, but the S3b-style in-transaction re-check is not portable here for the architectural reasons explained above.

SUGGESTION:
1. (Carried forward, not re-opened) No wrapper-level test exercises `exigirCajeroObjetivo` against a target uid absent from Auth (the not-found path) through `actualizarCajero.run(req)`. The underlying helper function IS unit-tested for exactly this path (exigir-admin.test.ts line 145, "rechaza not-found cuando el uid objetivo no existe en Auth", verified in verify-report-s4-foundation.md), so the code path itself has coverage; only the wrapper-level black-box case is missing. No spec scenario in gestion-cajeros requires this case for actualizarCajero specifically, so it is a legitimate low-priority follow-up, not a requirements gap.
2. apply-progress.md has no "Orchestrator addendum (S4-actualizar)" section recording an RDD lineage ID, unlike every prior slice in this change (S1 through S4-crear each have one). This verification proceeds on the task brief statement that the RDD receipt is already approved and acknowledged, per instructions not to re-litigate RDD review, but the artifact record for this slice is thinner than the established convention; recommend the orchestrator append the lineage/receipt reference to apply-progress.md for audit-trail parity with the other 7 slices before archive.

### RDD Receipt

Per task instructions, the RDD receipt for this candidate is already approved and acknowledged; this verification does not re-litigate the review. apply-progress.md does not itself record the lineage ID for this slice (see SUGGESTION 2 above), the receipt existence and disposition are taken as given per the task brief, not independently re-derived here.

### Verdict

PASS WITH WARNINGS -- S4-actualizar (task 4.3: actualizarCajero anti-escalation plus target-claims wiring) is functionally complete and correct: the wrapper enforces exigirAdminDeSucursal, then exigirCajeroDeAlcance (input), then exigirCajeroObjetivo (target current Auth claims) before any Auth/Firestore write, exactly per design.md Interfaces table. All 9 actualizarCajero scenario-instances are COMPLIANT, reproduced live (10/10 focused tests, exit 0). Typecheck clean across all 6 workspaces. Zero CRITICAL findings. Three WARNINGs: two are documentation-accuracy defects in apply-progress.md (test count and diff-line count both undercounted, with no functional consequence, all tests pass and are correctly mapped to spec scenarios), and one is the carried-forward, RDD-dispositioned TOCTOU finding assessed independently above (not portable to the S3b fix pattern, no code change recommended). One carried-forward SUGGESTION and one process SUGGESTION about the missing RDD-lineage addendum. S4-desactivar-reactivar (4.4) and S4-eliminar (4.5) remain correctly unimplemented and out of scope for this report, not failed.
