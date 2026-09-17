```yaml
schema: gentle-ai.verify-result/v1
evidence_revision: sha256:a5167ed2387e3ca632bd1890e94f262808465d3001fabe6501e28f0cb77fcfde
verdict: pass
blockers: 0
critical_findings: 0
requirements: 1/1
scenarios: 6/6
test_command: (cd packages/functions && firebase emulators:exec --project demo-conteo-eficiente --only firestore,auth "vitest run test/callables/cerrar-sesion.test.ts test/lib/exigir-cajero-de-sesion.test.ts")
test_exit_code: 0
test_output_hash: sha256:acbac7ae12c1763675b09e697eb813d9e0e8f8e360bcc4589b86132557f1def6
build_command: npm run typecheck (worktree root)
build_exit_code: 0
build_output_hash: sha256:2f3195dd2626c149fc17ec47a09bf8d8f5bc93d7548baf414d2587aa78902a65
```

## Verification Report

**Change**: rol-admin-sucursal
**Scope**: Slice S2b only (task 2.2, cerrarSesion two-stage gate). S1/S2a are separate, already-verified slices (verify-report-s1.md, verify-report-s2a.md, not re-litigated here). S3+ are not implemented and out of scope; their spec scenarios are NOT counted below.
**Version**: N/A
**Mode**: Strict TDD

**Worktree**: C:/Users/PC RYZEN/Documents/Proyectos/Sistema inventario-worktrees/feat-rol-admin-sucursal-cierre-sesion, branch feat/rol-admin-sucursal-cierre-sesion, based on cb8267b (S2a merge point). No commit made -- candidate is unstaged in the worktree; git status --short was identical before and after every command run in this verification.

### Evidence revision -- how it was computed

sha256 of the exact unified diff (git diff) restricted to the 4 files task 2.2 touches, in this fixed order: docs/diseno/08-contratos-y-cloud-functions.md, packages/functions/src/callables/cerrar-sesion.ts, packages/functions/test/callables/cerrar-sesion.test.ts, packages/functions/test/lib/exigir-cajero-de-sesion.test.ts. Command: git diff -- <4 paths> > candidate.diff && sha256sum candidate.diff. git diff --numstat on the same 4 paths matched apply-progress.md reported budget exactly (9+0, 12+3, 143+24, 20+0 = 211 additions+deletions) both before and after test/typecheck execution -- no tracked-file mutation.

### Completeness (S2b only)

| Metric | Value |
|--------|-------|
| Tasks total (this report scope) | 1 (task 2.2 / S2b) |
| Tasks complete per apply-progress.md | 1 |
| Tasks complete per tasks.md checkbox | 1 -- checkbox is [x] 2.2 S2b (correctly reflects completion; no bookkeeping gap this time) |

### Build and Tests Execution

**Build**: Passed
```text
$ npm run typecheck   (from worktree root)
all 6 workspaces (web, data, functions, shared, contracts, tools) pass
exit 0
```

**Tests**: 25 passed / 0 failed / 0 skipped (focused command, reproduced twice live in this session)
```text
$ (cd packages/functions && firebase emulators:exec --project demo-conteo-eficiente --only firestore,auth "npx vitest run test/callables/cerrar-sesion.test.ts test/lib/exigir-cajero-de-sesion.test.ts")
Test Files  2 passed (2)
     Tests  25 passed (25)
exit 0
```
Full packages/functions suite (194/194) was already reported green in apply-progress.md and was NOT re-run here per instructions (focused-only scope for this report).

**Coverage**: not available -- no coverage tool detected in packages/functions (informational only, not blocking per Strict TDD rules).

### Gate-ordering invariant (task 2.2) -- verified by direct source inspection

packages/functions/src/callables/cerrar-sesion.ts:

| Step | Line | Order confirmed |
|---|---|---|
| sesionAntes = await sesionRef.get() | 47 | Sesion read |
| if (!sesionAntes.exists) throw not-found | 48-50 | Immediately after the read |
| exigirExclusivaDeSucursal(alcance, [sesionAntes.get("sucursalId")]) | 54 | Sucursal gate -- right after the exists check |
| estado !== "abierta" check | 55-57 | AFTER the gate |
| verificarSincronizacion (RF-16) | 61-65 | AFTER the gate |
| CIERRE_BLOQUEADO audit write | 67-81 | AFTER the gate |
| Freeze transaction | 83-127 | AFTER the gate |

cerrarSesionImpl 4th parameter alcance: AlcanceAdmin (line 42) has no default value -- TypeScript enforces the wire at every call site (D4: fails closed on a forgotten wire, not silently grants Gerente scope). The wrapper (lines 132-136) resolves alcance via exigirAdminDeSucursal(req) before validar, matching D4 placement of input-only/lookup role gate before Impl.

**Invariant holds exactly as task 2.2 states it**: the gate runs after the sesion read but strictly before RF-16, CIERRE_BLOQUEADO, and the freeze transaction; a foreign-sucursal caller produces zero side effects (confirmed at runtime below, not just statically).

### Spec Compliance Matrix (S2b scope, specs/cierre-sesion/spec.md, all 6 scenarios)

| Scenario | Test | Result |
|---|---|---|
| Unauthenticated caller rejected (unchanged) | Not re-tested in cerrar-sesion.test.ts by design (file header comment, lines 5-9): cerrarSesion wrapper delegates the role gate to exigirAdminDeSucursal, already covered generically in exigir-admin.test.ts (rechaza sin autenticacion, confirmed present, line 37) -- same convention as abrirSesion | COMPLIANT |
| Cajero caller rejected (unchanged) | Same delegation -- exigir-admin.test.ts rechaza rol cajero (line 41), confirmed present | COMPLIANT |
| Gerente caller proceeds regardless of sucursal (affirmative, unchanged) | cerrar-sesion.test.ts: admin (Gerente) no se ve afectado por el alcance (regresion) -- cerrarSesion.run(reqCerrarSesion("admin", undefined, sesionId)), asserts estado === "cerrada" | COMPLIANT |
| admin_sucursal of the sesion own sucursal proceeds (affirmative, NEW) | admin_sucursal cierra la sesion de su propia sucursal (afirmativo) -- asserts resultado.sesionId and estado === "cerrada" | COMPLIANT |
| admin_sucursal of another sucursal rejected after lookup, before any side effect (negative, NEW -- discriminates gate ordering) | admin_sucursal de otra sucursal es rechazado tras la lectura, sin CIERRE_BLOQUEADO ni RF-16 -- seeds sinConfirmar (a condition that would trigger CIERRE_BLOQUEADO if the gate ran late), asserts permission-denied, estado stays abierta, AND CIERRE_BLOQUEADO event count is 0 | COMPLIANT |
| Malformed claim fails closed before any read (negative, NEW) | Two tests, [] and 2-sucursal claims, both invoked against a non-existent sesionId and asserting permission-denied (not not-found) -- proves the role gate in the wrapper rejects before Impl (and thus before any read) even runs | COMPLIANT |

**Compliance summary**: 6/6 scenarios compliant. The exigirAdminOCajeroDeSesion admin_sucursal-membership pair (design item 3, test-only coverage per D3) is also present and passing (exigir-cajero-de-sesion.test.ts: own-sucursal passes, foreign-sucursal rejected) -- confirms the design own note that no code change was needed there.

### Correctness (Static and Runtime Evidence)

| Behavior | Status | Notes |
|---|---|---|
| cerrarSesionImpl gains required 4th param alcance: AlcanceAdmin, no default | Implemented | cerrar-sesion.ts line 42; TypeScript would reject any of the 11 call sites if null were omitted |
| All 11 pre-existing cerrarSesionImpl call sites updated | Implemented | Confirmed via grep: exactly 11 occurrences of cerrarSesionImpl( in cerrar-sesion.test.ts, all passing null |
| Sucursal gate placed right after exists check, before estado/RF-16/CIERRE_BLOQUEADO/freeze tx | Implemented | Direct source read, see Gate-ordering table above |
| Wrapper resolves role gate via exigirAdminDeSucursal, replacing unconditional exigirAdmin | Implemented | cerrar-sesion.ts line 133 |
| Tests proven through the real onCall wrapper (cerrarSesion.run(req)), not just Impl, for all new D4/S2b scenarios | Implemented | All 5 new describe-block tests call .run(req) (D5) |
| exigirAdminOCajeroDeSesion admits admin_sucursal by claim membership, no code change needed | Confirmed | exigir-cajero-de-sesion.ts diff is empty; only its test file changed |
| Doc 08 section 5 documents the two-stage gate | Implemented | 9-line addition, matches D4 exactly (own-sucursal/foreign, Gerente-exempt wording) |

### Coherence (Design)

| Decision | Followed | Notes |
|---|---|---|
| D4 -- required trailing alcance param, no default, gate placement right after the read | Yes | Exact match, see Gate-ordering table |
| D5 -- test wrappers through callable.run(req) | Yes | All 5 new tests use cerrarSesion.run(req) |
| Interfaces table: cerrarSesion, Impl right after the exists check, BEFORE the estado check, verificarSincronizacion and CIERRE_BLOQUEADO | Yes | Line 54 placement matches verbatim |
| D3 / design note: exigirAdminOCajeroDeSesion already admits admin_sucursal, needs a test only | Yes | Confirmed -- zero production-code diff in exigir-cajero-de-sesion.ts |

### TDD Compliance

| Check | Result | Details |
|---|---|---|
| TDD Evidence reported | Yes | apply-progress.md Phase 2 section 2.2 has a RED/GREEN/REFACTOR table |
| RED confirmed | Yes (per apply-progress.md) | 24/25 passed, 1 failed for the right reason (old exigirAdmin rejected the admin_sucursal affirmative case) against the OLD cerrar-sesion.ts |
| GREEN confirmed | Yes | 25/25 passed, reproduced twice live in this verification session |
| Triangulation adequate | Yes | Affirmative (own-sucursal), negative (foreign, with a would-trigger-CIERRE_BLOQUEADO condition), 2 malformed-claim negatives, Gerente regression -- 5 distinct outcomes, no repeated trivial value |
| Safety net for modified files | Yes | 11 pre-existing cerrarSesionImpl tests (Fase A/B invariants, idempotency, concurrency) ran unchanged in the same 25/25 run |
| Known apply-time caveat honestly disclosed | Yes | apply-progress.md own Issues Found section for 2.2 notes the negative/malformed/regression cases also pass against the OLD gate trivially -- only the affirmative admin_sucursal case is a true discriminator; this verification confirms that disclosure is accurate and does not treat it as a gap, since the negative scenarios still assert the correct absence of side effects |

**TDD Compliance**: 6/6 checks passed

### Assertion Quality

Scanned the 4-file diff for banned patterns: no tautologies, no assertions skipping production-code calls, no ghost loops, no smoke-test-only patterns, no mocks (real Firestore/Auth emulator throughout cerrar-sesion.test.ts). The discriminating negative test (foreign-sucursal) asserts three independent facts (permission-denied, estado unchanged, CIERRE_BLOQUEADO count 0) rather than a single bare check -- directly proves the ordering invariant, not just the final HTTP code.

**Assertion quality**: 0 CRITICAL, 0 WARNING

### Budget

git diff --numstat for task 2.2 4 files: 9+0, 12+3, 143+24, 20+0 = **211** additions+deletions. Under the 400-line hard limit and close to the ~200 forecast in tasks.md Suggested Work Units table.

### Issues Found

**CRITICAL**: None.

**WARNING**: None.

**SUGGESTION**: None.

### Verdict

**PASS** -- S2b implementation (cerrarSesion two-stage gate, D4) is complete, the sucursal gate runs at the exact source line required (right after the sesion read, strictly before the estado check, RF-16, CIERRE_BLOQUEADO, and the freeze transaction), the alcance parameter is required with no default, all 11 pre-existing call sites were updated, all 6 in-scope spec scenarios have passing covering tests reproduced live in this session (25/25, twice), typecheck is green, and the diff is 211 lines (well under budget). No issues found.
