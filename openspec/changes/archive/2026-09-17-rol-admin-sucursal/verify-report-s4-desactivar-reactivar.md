```yaml
schema: gentle-ai.verify-result/v1
evidence_revision: sha256:94f486b7d0ac04665090def6c4a04d7001bdfef03583bab69a7ac50097d121ec
verdict: pass_with_warnings
blockers: 0
critical_findings: 0
requirements: 2/2
scenarios: 11/11
test_command: (cd packages/functions && firebase emulators:exec --project demo-conteo-eficiente --only firestore,auth "npx vitest run test/callables/desactivar-cajero.test.ts test/callables/reactivar-cajero.test.ts")
test_exit_code: 0
test_output_hash: sha256:976d0ee5c34d1b390c664e449d699ce9ced342e40a1ff5536f519aeb3579abf6
build_command: npm run typecheck (worktree root, all workspaces)
build_exit_code: 0
build_output_hash: sha256:2f3195dd2626c149fc17ec47a09bf8d8f5bc93d7548baf414d2587aa78902a65
```

## Verification Report

**Change**: rol-admin-sucursal
**Scope**: Slice S4-desactivar-reactivar only (task 4.4: `desactivarCajero` + `reactivarCajero` target-claims wiring). S1/S2a/S2b/S3a/S3b/S4-foundation/S4-crear/S4-actualizar are separate, already-verified slices (verify-report-s1.md through verify-report-s4-actualizar.md, not re-litigated here). S4-eliminar (task 4.5, `eliminarCajero`) is NOT implemented in this slice and is explicitly OUT OF SCOPE below (not failed). S5 through S7 are unimplemented and out of scope.

**Version**: N/A
**Mode**: Strict TDD

**Worktree**: C:/Users/PC RYZEN/Documents/Proyectos/Sistema inventario-worktrees/feat-rol-admin-sucursal-desactivar-reactivar-cajero, branch feat/rol-admin-sucursal-desactivar-reactivar-cajero, based on 8d4c8b9 (S4-actualizar commit). No commit made, candidate is unstaged in the worktree; `git status --short` showed exactly the 4 files apply-progress.md claims, before and after every command run in this verification.

### Evidence revision, how it was computed

sha256 of the exact unified diff (`git diff`) restricted to the 4 files task 4.4 touches, in this fixed (alphabetical) order: `packages/functions/src/callables/desactivar-cajero.ts`, `packages/functions/src/callables/reactivar-cajero.ts`, `packages/functions/test/callables/desactivar-cajero.test.ts`, `packages/functions/test/callables/reactivar-cajero.test.ts`.

`git diff --numstat` on the same 4 paths, reproduced independently in this verification: 5+2, 7+2, 155+3, 161+2 = 337 additions and deletions. This MATCHES apply-progress.md's own Budget section (337, forecast ~280) exactly, no drift, unlike S4-actualizar. Well under the 400-line hard limit.

### Completeness (S4-desactivar-reactivar only)

| Metric | Value |
|--------|-------|
| Tasks total (this report scope) | 1 (task 4.4 / S4-desactivar-reactivar) |
| Tasks complete per apply-progress.md | 1 |
| Tasks complete per tasks.md checkbox | 0, checkbox is `[ ]` for 4.4, not yet checked. Consistent with the convention observed across every prior slice: tasks.md gets checked at commit time (post-verify), and no commit has been made for this slice yet, matching the instruction not to mark tasks.md here. Not a blocking discrepancy. |

### Build and Tests Execution

Build: Passed
```text
npm run typecheck   (from worktree root)
all 6 workspaces (web, data, functions, shared, contracts, tools) pass
exit 0
```

Tests: reproduced live in this session (focused command from tasks.md row 4.4):
```text
(cd packages/functions && firebase emulators:exec --project demo-conteo-eficiente --only firestore,auth "npx vitest run test/callables/desactivar-cajero.test.ts test/callables/reactivar-cajero.test.ts")
Test Files  2 passed (2)
     Tests  20 passed (20)
exit 0
```

Independently reproduced test-file counts match apply-progress.md exactly: `desactivar-cajero.test.ts` 9 total (3 pre-existing Impl/session tests + 6 new authorization tests), `reactivar-cajero.test.ts` 11 total (5 pre-existing Impl tests + 6 new authorization tests). No count drift this time (contrast with S4-actualizar's WARNING).

Full monorepo suite was not re-run in this verification (focused-only scope for this report, per S4-actualizar/S4-crear precedent). apply-progress.md reports it green (functions 32 files/257 tests, shared 120/120, contracts 71/71, web/data scrolled past capture but no failures reported).

Coverage: not available, no coverage tool detected in packages/functions (informational only, not blocking per Strict TDD rules).

### Source inspection, implementation vs. design.md Interfaces block

`packages/functions/src/callables/desactivar-cajero.ts` (wrapper only, 5+2) and `packages/functions/src/callables/reactivar-cajero.ts` (wrapper only, 7+2):

| Before | After (both callables, identical shape) |
|---|---|
| `exigirAdmin(req)` then `validar` then `Impl` | `const alcance = exigirAdminDeSucursal(req)` then `validar` then `await exigirCajeroObjetivo(getAuth(), alcance, datos.uid)` then `Impl` |

Matches design.md Interfaces row `desactivar/reactivar/eliminarCajero | wrapper: await exigirCajeroObjetivo(...). This runs before every side effect` verbatim. Both `Impl` functions are byte-identical (untouched, confirmed via diff, zero hunks inside either function body). `exigirCajeroObjetivo` runs before any Auth/Firestore write in either callable.

No input-level `exigirCajeroDeAlcance` call in either wrapper, confirmed correct against the spec and design, not a gap: both `desactivarCajeroSchema`/`reactivarCajeroSchema` payloads carry only `{ uid }` (no `rol`/`sucursalesAsignadas` to anti-escalate at the input level, unlike `crearCajero`/`actualizarCajero`). The entire authorization surface for these two callables is target-claims-based, per D3's Interfaces table row, which lists only `exigirCajeroObjetivo` for this row (no accompanying `exigirCajeroDeAlcance` input call, unlike the `actualizarCajero` row). Confirmed against `contracts/schemas/desactivar-cajero.schema.ts`/`reactivar-cajero.schema.ts`, neither carries a `rol` or `sucursalesAsignadas` field.

`exigirCajeroObjetivo` (packages/functions/src/lib/exigir-admin.ts, unchanged by this slice, inspected for correctness): no-ops on Gerente (`alcance === null`) without reading Auth; else calls `auth.getUser(uid)`, converts `auth/user-not-found` to `HttpsError("not-found", "Cajero inexistente")`, and delegates the claim check to `exigirCajeroDeAlcance(alcance, objetivo.customClaims?.rol, objetivo.customClaims?.sucursales)`, reading the target's CURRENT Auth custom claims exclusively, never `usuarios/{uid}`, exactly per D3.

### Spec Compliance Matrix (S4-desactivar-reactivar scope only)

**Requirement 1 (MODIFIED, `desactivarCajero` portion only)**: gestion-cajeros, "All three callables are Gerente-only or admin_sucursal scoped to its own sucursal, with anti-escalation."

| Scenario | Test | Result |
|---|---|---|
| Gerente caller proceeds regardless of sucursal (affirmative, regression) | "admin (Gerente) no se ve afectado por el alcance (regresion)" | COMPLIANT |
| admin_sucursal deactivates a cajero assigned solely to its own sucursal (affirmative) | "admin_sucursal desactiva un cajero de su propia sucursal (afirmativo)" | COMPLIANT |
| admin_sucursal attempts to deactivate a cajero shared with another sucursal (negative, decision #2) | "objetivo con sucursal compartida es rechazado sin efectos" | COMPLIANT |
| admin_sucursal attempts to deactivate a cajero of another sucursal entirely (negative) | "objetivo de sucursal ajena es rechazado sin efectos" | COMPLIANT |
| Malformed claim fails closed (negative) | "claim del llamante malformado (0 o 2 sucursales) es rechazado antes de leer el objetivo" (2 asserts) | COMPLIANT |

Bonus coverage beyond a discrete Scenario header in this MODIFIED requirement: "objetivo con custom claims admin/admin_sucursal es rechazado sin efectos (negativo, anti-escalada del objetivo)" (2 asserts) exercises the requirement's own prose ("any user with rol admin/admin_sucursal is out of reach for admin_sucursal") through `desactivarCajero.run(req)` end-to-end, not itemized as a separate Scenario header for this MODIFIED requirement (that discrete header only exists in the ADDED `reactivarCajero` requirement below), but directly satisfies the requirement text and is not a gap.

**Requirement 2 (ADDED, full)**: gestion-cajeros, "`reactivarCajero` is Gerente-only or admin_sucursal scoped to its own sucursal."

| Scenario | Test | Result |
|---|---|---|
| Reactivating a cajero assigned solely to own sucursal (affirmative) | "admin_sucursal reactiva un cajero desactivado de su propia sucursal (afirmativo)", also asserts customClaims survive deactivation, confirming the design note that `desactivarCajeroImpl` never clears claims | COMPLIANT |
| Reactivating a cajero shared with another sucursal rejected (negative, decision #2) | "objetivo con sucursal compartida es rechazado sin efectos" | COMPLIANT |
| Reactivating a target with rol admin or admin_sucursal rejected (negative, anti-escalation) | "objetivo con custom claims admin/admin_sucursal es rechazado sin efectos" (2 asserts) | COMPLIANT |
| Reactivating a cajero of another sucursal entirely rejected (negative) | "objetivo de sucursal ajena es rechazado sin efectos" | COMPLIANT |
| Gerente unaffected (affirmative, regression) | "admin (Gerente) no se ve afectado por el alcance (regresion)" | COMPLIANT |
| Malformed claim fails closed (negative, shared MODIFIED-requirement scenario, applies here too per its own text "any of the three callables") | "claim del llamante malformado (0 o 2 sucursales) es rechazado antes de leer el objetivo" (2 asserts) | COMPLIANT |

Compliance summary: 11/11 scenario-instances compliant (5 for desactivarCajero's MODIFIED-requirement portion + 6 for reactivarCajero's ADDED requirement, including its shared malformed-claim instance), all reproduced live in this session (12 new wrapper `it()` blocks total across both files, 6 per file; the escalation and malformed-claim pairs in each file share one test with two sequential denies, same convention as prior slices).

Explicitly OUT OF SCOPE for this report (not failed, later slice per tasks.md ordering):

| Requirement (gestion-cajeros) | Why out of scope | Slice that closes it |
|---|---|---|
| `eliminarCajero` target-claim wiring before any side effect (ADDED requirement) | Callable wiring not present, `git diff --stat` on `eliminar-cajero.ts` returns empty | S4-eliminar (4.5) |

The spec's Unauthenticated/Cajero-caller scenarios for `desactivarCajero`/`reactivarCajero` are unchanged behavior, transitively covered by `exigirAdminDeSucursal`'s own tests (S2a), not re-proven at wrapper level here (same convention as S2b/S3a/S3b/S4-crear/S4-actualizar, documented in the test files' own header comments).

### Orphan / reverse-orphan not-found behavior, independent check

Traced both callables' `not-found` paths against the pre-existing `Impl` behavior to determine whether the new wrapper changes observable `not-found` semantics.

**`desactivarCajero`**: NO observable change. `desactivarCajeroImpl` (untouched) already threw `HttpsError("not-found", "Cajero inexistente")` when `auth.updateUser(uid, { disabled: true })` failed with `auth/user-not-found`, i.e. its only not-found condition was already keyed on the Auth user being missing, the exact same condition and exact same code plus message `exigirCajeroObjetivo` now checks earlier. For an `admin_sucursal` caller against an orphan target (Auth deleted, Firestore profile present), the new wrapper simply front-loads the identical rejection (same `HttpsError` code and message) before `revokeRefreshTokens`/the Firestore transaction, with zero side effects in both before-and-after states, since the old code's first write attempt was `auth.updateUser` itself, which was also the first thing to fail. A reverse-orphan target (Auth present, Firestore profile missing) is unaffected either way: `exigirCajeroObjetivo` reads Auth claims (which exist) and, if they match, defers to `Impl`, which then hits the same Firestore `tx.update`-on-missing-doc failure a Gerente caller would hit, behavior identical for both roles.

**`reactivarCajero`**: YES, one observable divergence exists, isolated to the orphan case (Auth user deleted, Firestore profile still present), and only for `admin_sucursal` callers, since Gerente (`alcance === null`) skips `exigirCajeroObjetivo` entirely and is unaffected by this slice. `reactivarCajeroImpl` (untouched) decides `not-found` solely on the Firestore profile (`tx.get(perfilRef)`, `!perfil.exists`) and never checks Auth until its final, uncaught `auth.updateUser(uid, { disabled: false })` call, which runs after the Firestore transaction has already committed `activo: true` plus an audit event. So for an orphan target: a Gerente caller (pre-existing, out-of-scope behavior, not touched by this slice) would partially reactivate Firestore, then fail with an uncaught (non-`HttpsError`) Auth error on the final line, a messier, partial-side-effect outcome that already existed before this change and is unrelated to task 4.4. An `admin_sucursal` caller, by contrast, now hits `exigirCajeroObjetivo`'s `auth.getUser(uid)` call first, gets `auth/user-not-found`, and is rejected with a clean `HttpsError("not-found", "Cajero inexistente")` before the transaction ever runs, zero side effects. This is a new asymmetry between the two caller roles for this one condition, introduced by this slice's wrapper wiring, but it does not contradict any spec scenario (the delta spec has no scenario describing orphan/Auth-vs-Firestore desync targets for either role) and it is strictly the fail-closed direction: `admin_sucursal` ends up safer (no partial write) than Gerente's pre-existing behavior in the identical edge case. A reverse-orphan target (Auth present, Firestore profile deleted) shows no divergence: `exigirCajeroObjetivo` reads the intact Auth claims, passes if they still match, and `Impl`'s own `!perfil.exists` check then produces the identical clean `not-found` rejection for both `admin_sucursal` and Gerente, consistent with D3's design (Auth claims are authoritative for the authorization decision; the Firestore document's existence is `Impl`'s own separate, unrelated concern).

Neither divergence is exercised by any test in this slice (the same untested-not-found-path WARNING already dispositioned for prior slices) and neither is a spec compliance gap, the delta spec assigns no scenario to orphan states. Flagged below as a WARNING for documentation/parity, not a blocker.

### Task-level invariant verification (task 4.4's own RED-test contract)

| Required case (per callable, task 4.4) | Test present (desactivar) | Test present (reactivar) | Result |
|---|---|---|---|
| own-sucursal target affirmative | "admin_sucursal desactiva un cajero de su propia sucursal (afirmativo)" | "admin_sucursal reactiva un cajero desactivado de su propia sucursal (afirmativo)" | PASS |
| shared-sucursal rejected, no write | "objetivo con sucursal compartida es rechazado sin efectos" | "objetivo con sucursal compartida es rechazado sin efectos" | PASS |
| escalation target (admin/admin_sucursal) rejected, no side effect | "objetivo con custom claims admin/admin_sucursal es rechazado sin efectos" | "objetivo con custom claims admin/admin_sucursal es rechazado sin efectos" | PASS |
| foreign target rejected | "objetivo de sucursal ajena es rechazado sin efectos" | "objetivo de sucursal ajena es rechazado sin efectos" | PASS |
| malformed claim rejected | "claim del llamante malformado (0 o 2 sucursales)" | "claim del llamante malformado (0 o 2 sucursales)" | PASS |
| Gerente regression | "admin (Gerente) no se ve afectado por el alcance" | "admin (Gerente) no se ve afectado por el alcance" | PASS |

All 6 required RED-test cases from tasks.md's own row for 4.4 are present and passing, identically shaped in both files (12 `it()` blocks total, since escalation and malformed-claim each split into one test with two sequential denies, same convention as prior slices).

### Correctness (Static and Runtime Evidence)

| Behavior | Status | Notes |
|---|---|---|
| Wrapper calls `exigirAdminDeSucursal` before `validar`, `exigirCajeroObjetivo` before either `Impl` | Implemented | Confirmed via source read; no Auth/Firestore write precedes the gate in either callable |
| Target check reads CURRENT Auth custom claims exclusively, never `usuarios/{uid}` | Implemented | `exigirCajeroObjetivo` calls `auth.getUser(uid)` and reads `customClaims`, never touches Firestore |
| Every negative asserts absence of effect (no `auth.updateUser`/`revokeRefreshTokens` call, no `activo` change) | Implemented | All negative tests spy on the relevant Auth call and/or read `activo` directly |
| `desactivarCajeroImpl` never clears custom claims (design precondition for reactivar's target check) | Confirmed | Reactivar's affirmative test asserts `customClaims` intact after a prior `desactivarCajeroImpl` call |
| New tests clean up everything they create | Implemented | Local `afterEach` deletes Auth user, perfil doc, and auditoria events per created uid, in both files |
| Pre-existing `Impl` tests unaffected | Implemented | 3/3 (desactivar) + 5/5 (reactivar) pass unchanged in the same run |

### Coherence (Design)

| Decision | Followed | Notes |
|---|---|---|
| D3, target check reads Auth custom claims, not `usuarios/{uid}`, for both callables | Yes | `exigirCajeroObjetivo(getAuth(), alcance, datos.uid)` wired identically in both wrappers |
| D3, no input-level anti-escalation needed (payload is `{ uid }`-only) | Yes | Confirmed against both schemas, correctly omitted, matching the Interfaces table row which lists only `exigirCajeroObjetivo` for this row |
| D1, role gate before any read | Yes | `exigirAdminDeSucursal` is the first wrapper call in both |
| D5, wrapper proven through `.run(req)` | Yes | all 12 new tests use `desactivarCajero.run(req)`/`reactivarCajero.run(req)` |
| Task 4.4 scope discipline (4 files, no helpers, no docs) | Yes | Confirmed, diff touches only the 4 claimed files |

TOCTOU: same architectural situation as S4-actualizar (Auth read cannot share a Firestore transaction with the write). RDD-approved informational finding, no correction required, no new analysis needed beyond what S4-actualizar already established for the shared `exigirCajeroObjetivo` helper.

### TDD Compliance

| Check | Result | Details |
|---|---|---|
| TDD Evidence reported | Yes | apply-progress.md Task 4.4 section has a RED/GREEN/REFACTOR table |
| RED confirmed | Yes (per apply-progress.md) | 18/20 passed, 2 failed for the right reason (`Se requiere rol admin.` on each callable's own-sucursal affirmative), consistent with the same asymmetry pattern documented since S2b (negatives pass trivially against the old gate) |
| GREEN confirmed | Yes | reproduced live in this verification session as 20/20, matching apply-progress.md exactly (no undercount this time) |
| Triangulation adequate | Yes | Per callable: affirmative plus Gerente no-op plus 4 distinct negative branches (target escalation, shared target, foreign target, malformed claim); negatives assert absence of effect so they are not vacuous |
| Safety net for modified files | Yes | Pre-existing Impl test blocks (3 + 5 tests) ran unchanged in the same run |
| Known apply-time caveat honestly disclosed | Yes | apply-progress.md notes the same RED asymmetry pattern documented since S2b/S3a/S4-crear/S4-actualizar |

TDD Compliance: 6/6 checks fully passed.

### Assertion Quality

Scanned the 4-file diff for banned patterns: no tautologies, no assertions skipping production-code calls, no ghost loops, no smoke-test-only patterns. Negatives use real Auth/Firestore emulator reads for absence asserts (spies on `auth.updateUser`/`auth.getUser`, plus direct Firestore reads of `activo`/`customClaims`), not mocks of the code under test. Each negative discriminates a single reason (complete otherwise-valid input per AGENTS.md section 2).

Assertion quality: 0 CRITICAL, 0 WARNING

### Budget

`git diff --numstat` for task 4.4's 4 files, reproduced independently in this verification: 5+2, 7+2, 155+3, 161+2 = 337 additions and deletions. Matches apply-progress.md's own Budget section exactly. Well under the 400-line hard limit.

### Issues Found

CRITICAL: None.

WARNING:
1. No wrapper-level test exercises `exigirCajeroObjetivo` against a target uid absent from Auth (the not-found path) through either `desactivarCajero.run(req)` or `reactivarCajero.run(req)`. The underlying helper function IS unit-tested for exactly this path (`exigir-admin.test.ts`, verified in verify-report-s4-foundation.md), so the code path itself has coverage; only the wrapper-level black-box case is missing for both callables, same carried-forward observation as S4-actualizar's SUGGESTION, now applying to 2 callables instead of 1. No spec scenario in gestion-cajeros requires this case for either callable, so it remains informational, not a requirements gap. Matches the RDD reviewer's own WARNING x2 disposition per the task brief.
2. `reactivarCajero` exhibits a new, previously nonexistent asymmetry between `admin_sucursal` and Gerente callers specifically for an orphan target (Auth user deleted, Firestore profile present): `admin_sucursal` now fails cleanly and early (`not-found`, zero side effects) via `exigirCajeroObjetivo`, while Gerente (unaffected by this slice, pre-existing behavior) still reaches `reactivarCajeroImpl`, partially commits the Firestore transaction, and only then fails on an uncaught (non-`HttpsError`) error from the final `auth.updateUser` call. See the dedicated "Orphan / reverse-orphan not-found behavior" section above for the full trace. Not a spec violation (no scenario covers orphan targets) and not a regression in the harmful direction, since the new path is strictly more fail-closed than the pre-existing Gerente path it diverges from, but it is a genuine, undocumented behavioral difference worth recording for anyone reasoning about `not-found` parity between the two roles.
3. Carried forward, not re-opened: TOCTOU between `exigirCajeroObjetivo`'s Auth read and either `Impl`'s Firestore write, same architectural situation already analyzed in verify-report-s4-actualizar.md for the shared helper. RDD-approved informational finding; no correction required, not portable to the S3b in-transaction-recheck pattern for the reasons already established there.

SUGGESTION: None new for this slice. S4-actualizar's SUGGESTION 2, about a missing "Orchestrator addendum" section, does not apply here, apply-progress.md's Task 4.4 section follows the established Files Changed / Budget / Status shape consistently with other slices, and the RDD receipt is stated as already approved and acknowledged per the task brief.

### RDD Receipt

Per task instructions, the RDD receipt for this candidate is already approved and acknowledged; this verification does not re-litigate the review. The reviewer's three informational findings (WARNING x2 on the untested not-found path per callable, SUGGESTION on the check-then-act TOCTOU window) are independently assessed above: the TOCTOU disposition (follow-up, no correction) is confirmed consistent with S4-actualizar's own independent architectural analysis of the same shared helper; the not-found-path WARNING is confirmed consistent (unit-tested at the helper level, not spec-required at the wrapper level for either callable). The orphan/reverse-orphan asymmetry found independently in this verification (WARNING 2 above) is a new observation not previously listed among the RDD reviewer's three findings, it does not block this candidate (no spec scenario contradicted, fail-closed direction only) but should be carried into any downstream follow-up alongside the RDD-dispositioned WARNINGs.

### Verdict

PASS WITH WARNINGS -- S4-desactivar-reactivar (task 4.4: `desactivarCajero` + `reactivarCajero` target-claims wiring) is functionally complete and correct: both wrappers enforce `exigirAdminDeSucursal` then `await exigirCajeroObjetivo` (target's current Auth claims) before any Auth/Firestore write, exactly per design.md's Interfaces table row for this callable group, with no input-level anti-escalation call needed or present (both payloads are `{ uid }`-only, confirmed correct against the schemas). All 11 scenario-instances (5 desactivarCajero MODIFIED-requirement portion + 6 reactivarCajero ADDED requirement) are COMPLIANT, reproduced live (20/20 focused tests, exit 0, matching apply-progress.md's own counts exactly with no drift on tests or budget lines this time). Typecheck clean across all 6 workspaces. Zero CRITICAL findings. Three WARNINGs: two are carried-forward/RDD-dispositioned (untested not-found wrapper path x2 callables; TOCTOU, no correction portable), and one is a new independent finding from this verification, `reactivarCajero` now diverges from Gerente's pre-existing orphan-target behavior in the fail-closed direction, not a spec violation and not previously listed among the RDD reviewer's findings, but worth carrying forward as documentation. S4-eliminar (4.5) remains correctly unimplemented and out of scope for this report, not failed.
