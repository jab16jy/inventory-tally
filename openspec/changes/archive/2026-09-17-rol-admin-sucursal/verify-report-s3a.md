```yaml
schema: gentle-ai.verify-result/v1
evidence_revision: sha256:8ab17ebe620c69d2d0ebe893d2aa804caa6e3cee3ca3608c2f9c2ef037e23a18
verdict: pass
blockers: 0
critical_findings: 0
requirements: 2/2
scenarios: 8/8
test_command: (cd packages/functions && firebase emulators:exec --project demo-conteo-eficiente --only firestore,auth "vitest run test/callables/crear-categoria.test.ts test/callables/actualizar-categoria.test.ts")
test_exit_code: 0
test_output_hash: sha256:370401e647a879030aefd642442cf437f8e1ea74d7a067e2d698f9cee7f4975b
build_command: npm run typecheck (worktree root)
build_exit_code: 0
build_output_hash: sha256:2f3195dd2626c149fc17ec47a09bf8d8f5bc93d7548baf414d2587aa78902a65
```

## Verification Report

**Change**: rol-admin-sucursal
**Scope**: Slice S3a only (task 3.1, crearCategoria + actualizarCategoria exclusive-write gate). S1/S2a/S2b are separate, already-verified slices (verify-report-s1.md, verify-report-s2a.md, verify-report-s2b.md, not re-litigated here). S3b (desactivarCategoria/reactivarCategoria/eliminarCategoria) and later phases are not implemented and out of scope; their spec scenarios are NOT counted below.
**Version**: N/A
**Mode**: Strict TDD

**Worktree**: C:/Users/PC RYZEN/Documents/Proyectos/Sistema inventario-worktrees/feat-rol-admin-sucursal-categoria-crear-actualizar, branch feat/rol-admin-sucursal-categoria-crear-actualizar, based on 69483e5 (S2b merge point). No commit made -- candidate is unstaged in the worktree; git status --short was identical (same 5 files) before and after every command run in this verification.

### Evidence revision -- how it was computed

sha256 of the exact unified diff (git diff) restricted to the 5 files task 3.1 touches, in this fixed order: docs/diseno/08-contratos-y-cloud-functions.md, packages/functions/src/callables/actualizar-categoria.ts, packages/functions/src/callables/crear-categoria.ts, packages/functions/test/callables/actualizar-categoria.test.ts, packages/functions/test/callables/crear-categoria.test.ts. Command: git diff -- 5-paths > candidate.diff then sha256sum candidate.diff. git diff --numstat on the same 5 paths: 8+0, 16+3, 5+2, 183+33, 77+2 = 329 additions+deletions, matching apply-progress.md reported budget exactly (forecast ~215, actual 329, still under the 400 hard limit) both before and after test/typecheck execution -- no tracked-file mutation.

### Completeness (S3a only)

| Metric | Value |
|--------|-------|
| Tasks total (this report scope) | 1 (task 3.1 / S3a) |
| Tasks complete per apply-progress.md | 1 |
| Tasks complete per tasks.md checkbox | 1 -- checkbox is [x] 3.1 S3a (correctly reflects completion). Task 3.2 (S3b) is correctly left [ ]. |

### Build and Tests Execution

Build: Passed
```text
npm run typecheck   (from worktree root)
all 6 workspaces (web, data, functions, shared, contracts, tools) pass
exit 0
```

Tests: 22 passed / 0 failed / 0 skipped (focused command, reproduced live in this session)
```text
cd packages/functions and firebase emulators:exec --project demo-conteo-eficiente --only firestore,auth "npx vitest run test/callables/crear-categoria.test.ts test/callables/actualizar-categoria.test.ts"
Test Files  2 passed (2)
     Tests  22 passed (22)
exit 0
```
Full packages/functions suite (204/205, 1 pre-existing unrelated flake documented in apply-progress.md) was already reported in apply-progress.md and was NOT re-run here per instructions (focused-only scope for this report).

Coverage: not available -- no coverage tool detected in packages/functions (informational only, not blocking per Strict TDD rules).

### Source inspection -- exclusive-ownership gate placement (task 3.1)

packages/functions/src/callables/crear-categoria.ts:

| Step | Order confirmed |
|---|---|
| const alcance = exigirAdminDeSucursal(req) | Role gate, before any read |
| const datos = validar(req.data, crearCategoriaSchema) | Schema validation |
| exigirExclusivaDeSucursal(alcance, datos.sucursalesAsignadas) | Ownership gate on the INPUT, before crearCategoriaImpl (no Firestore write yet) |
| crearCategoriaImpl(...) | Only reached after the gate passes |

packages/functions/src/callables/actualizar-categoria.ts:

| Step | Order confirmed |
|---|---|
| const alcance = exigirAdminDeSucursal(req) (wrapper) | Role gate, before any read |
| const datos = validar(...) | Schema validation |
| exigirExclusivaDeSucursal(alcance, datos.sucursalesAsignadas) (wrapper) | Ownership gate on the INPUT, before actualizarCategoriaImpl |
| tx.get(categoriaRef) (Impl, inside transaction) | Stored-value read |
| if (!categoria.exists) throw not-found | Existence check |
| exigirExclusivaDeSucursal(alcance, categoria.get(sucursalesAsignadas)) (Impl) | Ownership gate on the STORED value, before tx.update |
| tx.update(...) | Only reached after both gates pass |

exigirExclusivaDeSucursal(alcance, sucursales) (exigir-admin.ts:43-50, unchanged from S2a/S2b): alcance === null (Gerente) short-circuits with no restriction; otherwise throws permission-denied unless sucursales is an array of length 1 whose single element equals alcance.

Invariant holds as task 3.1 states it: admin_sucursal may create or update only a categoria whose sucursalesAsignadas is exactly [ownSucursal]; global/shared input or stored state is rejected unchanged (confirmed at runtime below, not just statically).

### Known intentional deviation -- actualizarCategoria checks INPUT sucursalesAsignadas unconditionally

Design.md Interfaces table literally says the same check as crearCategoria unconditional input check -- apply-progress.md documents this as the resolution to an ambiguity flagged by the task brief (actualizarCategoriaSchema.sucursalesAsignadas is optional). The Impl writes sucursalesAsignadas set to sucursalesAsignadas or FieldValue.delete(), so an update that OMITS the field CLEARS it, turning an exclusively-owned categoria global mid-transaction. Checking the input only when present would let an admin_sucursal who owns a categoria omit the field, pass the Impl stored-value check (still [own] at tx.get time), and have tx.update silently make the categoria global in the same transaction -- a privilege-escalation gap.

Judgment against the spec invariant: the spec (specs/admin-sucursal/spec.md, Categoria writes scoped to exclusively-owned categorias) states admin_sucursal MUST write ONLY a categoria whose stored sucursalesAsignadas equals exactly [ownSucursal] and that a categoria becoming global/shared MUST be rejected, unchanged. Rejecting an omitted-field update that would silently turn the categoria global is the invariant enforced more strictly, not weakened -- the alternative (accepting the omission) would let a caller produce exactly the forbidden end state (a global categoria) without ever passing an explicitly-rejected value. Verdict: consistent with the spec invariant, correctly closes a gap the literal scenario text does not explicitly anticipate. Functional side effect (documented, not a spec violation): an admin_sucursal must now always resend sucursalesAsignadas on every actualizarCategoria call, even when only editing unrelated fields such as etiqueta -- Gerente is unaffected (alcance === null short-circuits). This is covered by its own regression test (actualizar-categoria.test.ts, admin_sucursal que omite sucursalesAsignadas es rechazado, sin cambios).

### Spec Compliance Matrix (S3a scope, specs/admin-sucursal/spec.md, crear/actualizar-relevant scenarios only)

| Scenario | Test | Result |
|---|---|---|
| admin_sucursal acts on its own sucursal (affirmative) | crear: admin_sucursal crea exactamente en su propia sucursal (asserts stored sucursalesAsignadas); actualizar: admin_sucursal actualiza una categoria de su exclusiva propiedad (asserts updated etiqueta) | COMPLIANT |
| Gerente unaffected (regression) | crear: admin (Gerente) puede crear una categoria global; actualizar: admin (Gerente) no se ve afectado (regresion) | COMPLIANT |
| Malformed claim fails closed (negative) | crear: admin_sucursal con claim malformado (2+ sucursales) es rechazado; actualizar: admin_sucursal con claim malformado (0 sucursales) es rechazado | COMPLIANT |
| Update on exclusively-owned categoria (affirmative) | actualizar: same actualiza una categoria de su exclusiva propiedad test above (stored sucursalesAsignadas equals [own]) | COMPLIANT |
| Update on global categoria rejected (negative) | actualizar: admin_sucursal no puede actualizar una categoria global (negativo, sin cambios) -- asserts permission-denied AND etiqueta unchanged | COMPLIANT |
| Update on shared categoria rejected (negative) | actualizar: admin_sucursal no puede actualizar una categoria compartida (negativo, sin cambios) -- asserts permission-denied AND etiqueta unchanged | COMPLIANT |
| Creating a global or multi-sucursal categoria rejected (negative) | crear: admin_sucursal sin sucursalesAsignadas es rechazado, nada se crea, plus admin_sucursal con sucursalesAsignadas multi-sucursal es rechazado -- both assert collection size unchanged | COMPLIANT |
| Gerente unaffected (regression, 2nd requirement instance) | Same Gerente tests as above (creates/updates without restriction) | COMPLIANT |

Compliance summary: 8/8 scenario-instances compliant across the 2 in-scope requirements (Branch-scoped gate for sesion and categoria callables -- crear/actualizar portion only; Categoria writes scoped to exclusively-owned categorias). S3b three callables (desactivar/reactivar/eliminarCategoria) are explicitly out of scope for this report.

### Correctness (Static and Runtime Evidence)

| Behavior | Status | Notes |
|---|---|---|
| crearCategoria wrapper checks datos.sucursalesAsignadas via exigirExclusivaDeSucursal before any write | Implemented | crear-categoria.ts, after validar, before crearCategoriaImpl |
| actualizarCategoriaImpl gains required 4th param alcance of type AlcanceAdmin, no default | Implemented | actualizar-categoria.ts; TypeScript would reject any of the 5 pre-existing call sites if null were omitted |
| All 5 pre-existing actualizarCategoriaImpl call sites updated | Implemented | Confirmed via diff: all 5 in actualizar-categoria.test.ts now pass a trailing null |
| actualizarCategoria wrapper checks the INPUT unconditionally, Impl checks the STORED value inside the tx, before tx.update | Implemented | See Source inspection and Known intentional deviation sections above |
| Tests proven through the real onCall wrapper (crearCategoria.run and actualizarCategoria.run, D5), not just Impl, for all new D2/S3a scenarios | Implemented | All 11 new describe-block tests (5 + 6) call .run(req) |
| Doc 08 documents the crear/actualizar exclusive-ownership gate | Implemented | 8-line addition, matches the existing S2b-note convention exactly |

### Coherence (Design)

| Decision | Followed | Notes |
|---|---|---|
| D2 -- ownership = exigirExclusivaDeSucursal(alcance, sucursales), exact [alcance] match required, undefined denied | Yes | Reused verbatim from S2a, no new logic added |
| D5 -- test wrappers through callable.run(req) | Yes | All 11 new tests use .run(req) |
| Interfaces table: crearCategoria -- wrapper: exclusiva(alcance, datos.sucursalesAsignadas) | Yes | Exact match |
| Interfaces table: actualizarCategoria -- wrapper: the same check on the input, plus Impl inside tx after tx.get on the stored value | Yes | Exact match; ambiguity in the same check resolved unconditionally per the documented deviation above (consistent with the spec invariant, not a violation) |

### TDD Compliance

| Check | Result | Details |
|---|---|---|
| TDD Evidence reported | Yes | apply-progress.md Phase 3 section 3.1 has a RED/GREEN/REFACTOR table |
| RED confirmed | Yes (per apply-progress.md) | 20/22 passed, 2 failed for the right reason (old unconditional exigirAdmin rejected the admin_sucursal affirmative cases) against the OLD callables |
| GREEN confirmed | Yes | 22/22 passed, reproduced live in this verification session |
| Triangulation adequate | Partial | Affirmative (own), Gerente regression, malformed-claim negative, global/shared/omitted/multi negatives -- 4+ distinct outcomes per callable. Gap: no test isolates the single-element-but-foreign case (sucursalesAsignadas equals a single foreign sucursal) independently from the length-based branch -- see Issues Found (WARNING) |
| Safety net for modified files | Yes | 5 pre-existing actualizarCategoriaImpl tests + 6 pre-existing crearCategoriaImpl tests ran unchanged in the same 22/22 run |
| Known apply-time caveat honestly disclosed | Yes | apply-progress.md own Deviations section documents the unconditional-input-check resolution in full; this verification confirms the disclosure is accurate |

TDD Compliance: 5/6 checks fully passed, 1 partial (see WARNING below).

### Assertion Quality

Scanned the 5-file diff for banned patterns: no tautologies, no assertions skipping production-code calls, no ghost loops, no smoke-test-only patterns, no mocks (real Firestore/Auth emulator throughout both test files). The discriminating negative tests (global/shared update, omitted/multi create) each assert two independent facts (rejection code/type AND unchanged stored state or unchanged collection size), not a single bare check.

Assertion quality: 0 CRITICAL, 0 WARNING

### Budget

git diff --numstat for task 3.1 5 files: 8+0, 16+3, 5+2, 183+33, 77+2 = 329 additions+deletions. Under the 400-line hard limit; above the ~215 forecast in tasks.md Suggested Work Units table (apply-progress.md own Budget section already discloses this and marks it under the 400 hard limit).

### Issues Found

CRITICAL: None.

WARNING:
1. Missing negative test for the single-element-but-foreign-sucursal case (sucursalesAsignadas array of length 1, not omitted, not multi, but not equal to the caller own sucursal) in both crearCategoria and actualizarCategoria. exigirExclusivaDeSucursal condition rejects when the array is missing, when its length is not 1, or when its single element does not equal alcance -- every current negative test trips the length-based or non-array branch; none isolates the element-mismatch branch alone. By direct source inspection the check is implemented correctly, and no spec scenario literally requires this exact case, but the current test suite would not catch a regression that dropped only that final comparison.

SUGGESTION:
1. The unconditional-input check on actualizarCategoria means an admin_sucursal must resend sucursalesAsignadas on every update, even when only editing unrelated fields. This is a deliberate, tested, and correctly-justified trade-off (closes a real privilege-escalation gap -- see Known intentional deviation above), not a defect; flagging only so the client-side implementation (not yet built, per Phase 5) always echoes the current scope on every categoria edit form submission.

### Verdict

PASS -- S3a implementation (crearCategoria/actualizarCategoria exclusive-write gate, D2) is complete: the ownership gate runs before any write in both callables (input-level for crearCategoria; input-level in the wrapper plus stored-value-level inside the transaction for actualizarCategoria), the alcance parameter is required with no default, all 5 pre-existing actualizarCategoriaImpl call sites were updated, all 8 in-scope spec scenario-instances have passing covering tests reproduced live in this session (22/22), typecheck is green, and the diff is 329 lines (under the 400-line budget). The documented unconditional-input-check deviation on actualizarCategoria is judged consistent with, and a correct strengthening of, the spec exclusive-ownership invariant. One WARNING (a missing edge-case test for the single-foreign-sucursal branch, not a spec violation) and one informational SUGGESTION are recorded; neither blocks the verdict.
