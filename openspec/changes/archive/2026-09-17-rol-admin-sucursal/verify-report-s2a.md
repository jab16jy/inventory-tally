```yaml
schema: gentle-ai.verify-result/v1
evidence_revision: sha256:bc5c848f7b3caf6ecbeebeec61511c65913e10f6b03dd9c8789abaf0e75e639d
verdict: pass_with_warnings
blockers: 0
critical_findings: 0
requirements: 1/1
scenarios: 4/4
test_command: cd packages/functions && npm test
test_exit_code: 0
test_output_hash: sha256:555e3d0832bafdefbb0fd9f996114ccadc83a25bf94ceff736f2c7efd65c0a99
build_command: npm run typecheck && npm run lint
build_exit_code: 0
build_output_hash: sha256:e177351db456fb177ed4f1821568f8f01af75714849bd2c891da80929b64a902
```

## Verification Report

**Change**: rol-admin-sucursal
**Scope**: Slice S2a only (task 2.1 - exigirAdminDeSucursal/exigirExclusivaDeSucursal + abrirSesion). S1 is a separate, already-committed slice (verified in verify-report-s1.md, not re-litigated here). S2b onward are not implemented and are out of scope for this report - their spec scenarios are NOT counted below.
**Version**: N/A
**Mode**: Strict TDD

**Worktree**: C:/Users/PC RYZEN/Documents/Proyectos/Sistema inventario-worktrees/feat-rol-admin-sucursal-alcance-helpers, branch feat/rol-admin-sucursal-alcance-helpers, based on c8d280d (issue #98 test-cleanup fix). No commit made - candidate is unstaged in the worktree.

### Evidence revision - how it was computed

sha256 of the exact unified diff (git diff) restricted to the 4 files task 2.1 touches, in this fixed order: packages/functions/src/callables/abrir-sesion.ts, packages/functions/src/lib/exigir-admin.ts, packages/functions/test/callables/abrir-sesion.test.ts, packages/functions/test/lib/exigir-admin.test.ts. Command: git diff -- <4 paths> > candidate.diff && sha256sum candidate.diff. Confirmed git status --short and git diff --numstat were byte-identical before and after every test/typecheck/lint run in this verification (no tracked-file mutation).

### Completeness (S2a only)
| Metric | Value |
|--------|-------|
| Tasks total (this report scope) | 1 (task 2.1 / S2a) |
| Tasks complete per apply-progress.md | 1 |
| Tasks complete per tasks.md checkbox | 0 - checkbox still unchecked (see WARNING below) |

### Build & Tests Execution

**Build**: Passed
```text
$ npm run typecheck && npm run lint   (from worktree root)
npm run typecheck --workspaces --if-present -> all 6 workspaces pass
eslint . -> no errors
exit 0
```

**Tests**: 187 passed / 0 failed / 0 skipped (full packages/functions suite, 32 files)
```text
$ cd packages/functions && npm test
Test Files  32 passed (32)
     Tests  187 passed (187)
   Duration 60.56s
exit 0
```
Focused subset for S2a - test/lib/exigir-admin.test.ts (14 tests) + test/callables/abrir-sesion.test.ts (16 tests) = 30/30 passed, both within the clean full-suite run above.
test/scheduled/reconciliar-lineas.test.ts ran in 1478ms (1.5s) - confirms the issue #98 fix (commit c8d280d, base of this worktree) holds; no timeout regression from S2a added abrirSesion.run tests.

**Coverage**: not available - no coverage tool detected in packages/functions (informational only, not blocking per Strict TDD rules).

### Spec Compliance Matrix (S2a scope only)
| Requirement | Scenario | Test | Result |
|-------------|----------|------|--------|
| Branch-scoped gate (abrirSesion sub-scope) | admin_sucursal acts on its own sucursal (affirmative) | abrir-sesion.test.ts: abrirSesion - autorizacion de sucursal - admin_sucursal abre sesion en su propia sucursal | COMPLIANT |
| Branch-scoped gate (abrirSesion sub-scope) | admin_sucursal acts on another sucursal (negative) | abrir-sesion.test.ts: admin_sucursal no puede abrir sesion en otra sucursal (asserts sesionAbiertaId stays null - no side effect) | COMPLIANT |
| Branch-scoped gate (abrirSesion sub-scope) | Gerente unaffected (regression) | abrir-sesion.test.ts: admin (Gerente) no se ve afectado | COMPLIANT |
| Branch-scoped gate (abrirSesion sub-scope) | Malformed claim fails closed (negative, 0- and 2-sucursal) | abrir-sesion.test.ts: claim malformado (0 sucursales) + (2+ sucursales), both assert no side effect; root cause also unit-proven in exigir-admin.test.ts: exigirAdminDeSucursal rechaza 0/2+ sucursales | COMPLIANT |

**Compliance summary**: 4/4 scenarios compliant (S2a scope). The other five callables named in the same spec requirement (crearCategoria, actualizarCategoria, desactivarCategoria, reactivarCategoria, eliminarCategoria) are S3a/S3b work, not yet implemented - correctly out of scope, not reported as failing.

### Correctness (Static Evidence) - helper-level, beyond the spec's own scenario wording
| Behavior | Status | Notes |
|------------|--------|-------|
| exigirAdminDeSucursal: admin returns null | Implemented | exigir-admin.ts lines 24-25; test: permite rol admin y devuelve alcance null |
| exigirAdminDeSucursal: valid 1-sucursal admin_sucursal returns that sucursal | Implemented | exigir-admin.ts lines 26-28; test: permite admin_sucursal con exactamente 1 sucursal |
| exigirAdminDeSucursal: empty-array claim rejected | Implemented | falls through to throw at exigir-admin.ts line 29; test: rechaza admin_sucursal con 0 sucursales |
| exigirAdminDeSucursal: 2-sucursal claim rejected | Implemented | same throw path; test: rechaza admin_sucursal con 2+ sucursales |
| exigirAdminDeSucursal: cajero rejected | Implemented | same throw path; test: rechaza rol cajero |
| exigirAdminDeSucursal: unauthenticated rejected | Implemented | delegates to autorizacionDe, which throws unauthenticated; test: rechaza sin autenticacion |
| exigirExclusivaDeSucursal: exact match passes | Implemented | exigir-admin.ts lines 33-35 early return / array check; test: pasa cuando el recurso pertenece exactamente |
| exigirExclusivaDeSucursal: undefined rejected | Implemented | Array.isArray guard; test: rechaza cuando el recurso no tiene sucursales |
| exigirExclusivaDeSucursal: mismatch rejected | Implemented | test: rechaza cuando el recurso pertenece a otra sucursal (also 2+-shared case tested, extra coverage) |
| exigirExclusivaDeSucursal: null alcance passes (Gerente no-op) | Implemented | exigir-admin.ts line 33, if alcance is null return; test: no aplica restriccion para el alcance Gerente |
| abrirSesion: role gate before validar/any read | Implemented | abrir-sesion.ts: alcance = exigirAdminDeSucursal(req) runs before validar(req.data,...), which runs before exigirExclusivaDeSucursal and abrirSesionImpl |
| abrirSesion: sucursal check before abrirSesionImpl | Implemented | exigirExclusivaDeSucursal(alcance, [datos.sucursalId]) is the last statement before return abrirSesionImpl(...) - no read/write happens between the check and the call |
| Proven through the real onCall wrapper, not just Impl | Implemented | all 5 new abrirSesion tests call abrirSesion.run(req) per D5, matching the design rationale that a forgotten wire is the real risk |

### Coherence (Design)
| Decision | Followed? | Notes |
|----------|-----------|-------|
| D1 - exigirAdminDeSucursal(req): AlcanceAdmin, reuses autorizacionDe | Yes | exigir-admin.ts imports and calls autorizacionDe from exigir-cajero-de-sesion.ts exactly as designed |
| D2 - exigirExclusivaDeSucursal(alcance, sucursales), undefined denied | Yes | signature and undefined-denial match verbatim |
| D4 (S2a portion) - input-only checks run in the onCall wrapper before Impl | Yes | both new checks are in the wrapper; abrirSesionImpl itself is untouched |
| D5 - test wrappers through callable.run(req) | Yes | all 5 new tests use abrirSesion.run(req) |
| Interfaces table: abrirSesion wrapper calls exclusiva(alcance, [datos.sucursalId]) | Yes | exact call shape in abrir-sesion.ts |

### TDD Compliance
| Check | Result | Details |
|-------|--------|---------|
| TDD Evidence reported | Yes | apply-progress.md Phase 2 section 2.1 has a RED/GREEN/REFACTOR table |
| All tasks have tests | Yes | 1/1 task (2.1) has test files (exigir-admin.test.ts, abrir-sesion.test.ts) |
| RED confirmed (tests exist) | Yes | both test files exist in the worktree with the new describe blocks |
| GREEN confirmed (tests pass) | Yes | 187/187 full suite, 30/30 focused subset, reproduced live in this session |
| Triangulation adequate | Yes | exigirAdminDeSucursal 6 cases, exigirExclusivaDeSucursal 5 cases, abrirSesion wrapper 5 cases - all assert distinct outcomes (null vs sucursal-string vs throw), no repeated trivial value |
| Safety Net for modified files | Yes | abrir-sesion.ts/exigir-admin.ts are modifications, not new files; pre-existing describe blocks in both test files (exigirAdmin, abrirSesionImpl) ran unchanged in the same 187/187 run |

**TDD Compliance**: 6/6 checks passed

---

### Test Layer Distribution (S2a-added tests only)
| Layer | Tests | Files | Tools |
|-------|-------|-------|-------|
| Unit | 11 | 1 (exigir-admin.test.ts, new describe blocks) | vitest |
| Integration | 5 | 1 (abrir-sesion.test.ts, new describe block, through .run() + Firestore emulator) | vitest + Firestore/Auth emulator |
| E2E | 0 | 0 | not applicable to this slice |
| Total | 16 new (+14 pre-existing in the two files, unchanged) | 2 | |

---

### Changed File Coverage
Coverage analysis skipped - no coverage tool detected in packages/functions (informational, not blocking).

---

### Assertion Quality
All assertions verify real behavior. Scanned both diffs (exigir-admin.test.ts, abrir-sesion.test.ts) for banned patterns: no tautologies, no assertions that skip production-code calls, no ghost loops, no smoke-test-only patterns, no CSS/implementation-detail coupling, no mocks used (real Firestore/Auth emulator throughout). Negative-path tests assert the actual HttpsError throw AND, for the abrirSesion wrapper cases, a companion side-effect check (sucursal.get sesionAbiertaId stays null) - not bare empty-collection checks.

**Assertion quality**: 0 CRITICAL, 0 WARNING

---

### Quality Metrics
**Linter**: No errors
**Type Checker**: No errors

### Budget
git diff --numstat for task 2.1's 4 files: 3+2, 34+0, 80+2, 58+1 = 180 additions+deletions. Well under the 400-line hard limit and matches the ~250 forecast in tasks.md Suggested Work Units table (actual came in lower after the redundant local session-cleanup was superseded by the separate issue #98 fix at the worktree base commit).

### Issues Found

**CRITICAL**: None.

**WARNING**:
1. openspec/changes/rol-admin-sucursal/tasks.md still shows task 2.1 as unchecked, while apply-progress.md reports it complete with full TDD evidence and this report independently reproduces GREEN (187/187, 30/30 focused). This is a bookkeeping gap between the two artifacts, not a functional gap - the orchestrator should update the checkbox before archiving this slice.

**SUGGESTION**: None.

### Verdict
**PASS WITH WARNINGS** - S2a implementation (exigirAdminDeSucursal, exigirExclusivaDeSucursal, abrirSesion wiring) is complete, correctly ordered, matches design D1/D2/D4/D5, all 4 in-scope spec scenarios have passing covering tests reproduced live in this session, typecheck/lint/tests are all green, and the diff is 180 lines (well under budget). The only issue is tasks.md checkbox for 2.1 not yet reflecting completion - non-blocking, orchestrator bookkeeping only.
