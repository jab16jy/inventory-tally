```yaml
schema: gentle-ai.verify-result/v1
evidence_revision: sha256:0a58bedb5a5538f78e9b8da7c8457d6d5791d35c1943d39514a80d5e15824cfd
verdict: pass
blockers: 0
critical_findings: 0
requirements: 2/2
scenarios: 8/8
test_command: npm run test:rules
test_exit_code: 0
test_output_hash: sha256:aa69af343a18696f5872ccb1793fb0225df8c24bc40cb26c4a52a1168f8f0d8c
build_command: npm run typecheck && npm run lint
build_exit_code: 0
build_output_hash: sha256:e177351db456fb177ed4f1821568f8f01af75714849bd2c891da80929b64a902
```

## Verification Report

**Change**: rol-admin-sucursal (slice S1 only, Rules read scope, task 1.1)
**Version**: N/A
**Mode**: Strict TDD

### Scope note

This report verifies ONLY slice S1 (task 1.1, Rules read scope) of rol-admin-sucursal.
Slices S2 through S7 (sesion gate, categoria exclusive writes, cajero anti-escalation,
scoped admin panel, labels, hide-Gerente-affordances) are not implemented yet in this
worktree and are intentionally out of scope for this verdict; they are not reported as
missing.

**evidence_revision computation**: sha256:0a58bedb5a5538f78e9b8da7c8457d6d5791d35c1943d39514a80d5e15824cfd
is the SHA-256 digest of the exact bytes of `git -C <worktree> diff` (unified diff of the
uncommitted worktree against main at f4f6f24), i.e. the complete candidate change
verified in this report: 6 files, 303 lines changed (`git diff --numstat`).

### Completeness (S1 only)

| Metric | Value |
|--------|-------|
| Tasks total (Phase 1) | 1 |
| Tasks complete | 1 (1.1 S1) |
| Tasks incomplete | 0 |

Note: task 1.1 checkbox in openspec/changes/rol-admin-sucursal/tasks.md is still
unchecked even though apply-progress.md marks it done and no open items remain. This is
a document sync gap, not a code or test gap, flagged as WARNING below.

### Build & Tests Execution

**Build**: PASS (`npm run typecheck && npm run lint`, exit 0, all workspaces, no errors or warnings)

**Tests**: PASS, `npm run test:rules` (Firestore + Auth emulator): 5 test files, 81 tests,
0 failed. infra/test/reglas.test.ts alone: 70 tests, 0 failed (54 pre-existing + 16 new
for D6/S1, confirmed against `git diff main -- infra/test/reglas.test.ts`, which shows
exactly 16 added it() blocks and 0 removed).

```text
$ npm run test:rules
...
 [PASS] infra/test/reglas.test.ts (70 tests) 11353ms
 [PASS] infra/test/rnf-01-latencia-sincronizacion.test.ts (1 test)
 [PASS] infra/test/aporte-repositorio-real.test.ts (1 test)
 [PASS] infra/test/indices.test.ts (3 tests)
 [PASS] infra/test/percentiles.test.ts (6 tests)

 Test Files  5 passed (5)
      Tests  81 passed (81)
+ Script exited successfully (code 0)
```

**Coverage**: Not available, no coverage tool configured for the rules-emulator test
runner (informational only, not blocking per strict-tdd-verify rules).

### Spec Compliance Matrix

| Requirement | Scenario | Test | Result |
|-------------|----------|------|--------|
| Rules read scope, money/audit confined to own sucursal | Read own sucursal historicos and resumen (affirmative) | reglas.test.ts > D6 > historicos y resumen (monetario) > admin_sucursal SI lee historicos / SI lee resumen | COMPLIANT |
| Rules read scope, money/audit confined to own sucursal | Read another sucursal historicos or auditoria rejected (negative) | reglas.test.ts > D6 > admin_sucursal NO lee historicos de otra sucursal / NO lee auditoria de otra sucursal | COMPLIANT |
| Rules read scope, money/audit confined to own sucursal | Admin and cajero unaffected (regression) | pre-existing A-10 suite (admin SI / cajero NO on resumen and historicos), untouched by this diff | COMPLIANT |
| usuarios get/list scoped to a shared sucursal | Get a usuario of the shared sucursal (affirmative) | reglas.test.ts > D6 > usuarios get y list > admin_sucursal SI obtiene un usuario que comparte su sucursal | COMPLIANT |
| usuarios get/list scoped to a shared sucursal | Get a usuario of another sucursal only (negative) | admin_sucursal NO obtiene un usuario de otra sucursal unicamente | COMPLIANT |
| usuarios get/list scoped to a shared sucursal | Unfiltered list rejected (negative, highest leak risk) | RED, maxima fuga: admin_sucursal NO puede listar usuarios sin filtro | COMPLIANT |
| usuarios get/list scoped to a shared sucursal | Filtered list on own sucursal succeeds (affirmative) | admin_sucursal SI lista usuarios filtrando por su propia sucursal | COMPLIANT |
| usuarios get/list scoped to a shared sucursal | Gerente unaffected (regression) | Gerente sigue listando y leyendo cualquier usuario (regresion) | COMPLIANT |

**Compliance summary**: 8/8 scenarios compliant.

Additional coverage beyond the minimum scenario list (not required by spec but present
and correct): usuarios NO listar filtrando por otra sucursal (foreign-filter negative),
cajero sigue sin poder listar usuarios (regression), 0- and 2+-sucursal malformed-claim
negatives on historicos, and an auditoria list-with-filter affirmative. All pass and
reinforce D6's fail-closed posture without weakening the matrix above.

### Correctness (Static Evidence)

| Requirement | Status | Notes |
|------------|--------|-------|
| puedeVerSucursal(sucursalId) = esAdmin() OR (esAdminSucursal() AND sucursalId in token.sucursales) | Implemented | infra/firestore.rules lines 23-25; byte-identical logic (modulo comments) in docs/diseno/09-seguridad-y-auditoria.md section 3 |
| esAdminSucursal() requires rol == admin_sucursal AND sucursales.size() == 1 (0 or 2+ fails closed) | Implemented | infra/firestore.rules lines 17-20; matches D6/D8/ADR-27; covered by malformed-claim tests |
| veUsuario() = esAdminSucursal() AND sucursales[0] in resource.data.sucursalesAsignadas | Implemented | infra/firestore.rules lines 27-30 |
| usuarios get/list route through veUsuario() | Implemented | infra/firestore.rules lines 44-45 |
| historicos/resumen reads route through puedeVerSucursal | Implemented | infra/firestore.rules lines 57, 129 |
| auditoria reads additionally allow admin_sucursal via puedeVerSucursal, cajero branch unchanged | Implemented | infra/firestore.rules lines 168-169 |
| puedeVerSucursal never admits cajero (D6) | Implemented | No esCajero() reference inside puedeVerSucursal; cajero's separate auditoria access is its own pre-existing branch, unchanged |
| Doc 09 sections 2/3 mirror the rules file exactly | Implemented | git diff of docs/diseno/09-seguridad-y-auditoria.md is textually identical (helpers, usuarios/historicos/resumen/auditoria blocks) to the corresponding infra/firestore.rules diff |
| Doc 01 roles/matrix, doc 03 enum widen, ADR-27 consistent with spec | Implemented | Doc 01 explicitly marks the matrix as target-design with a note that only the S1 read-scope slice is live; doc 03 widens the ER rol enum string; ADR-27 restates D6/D8 rationale (cardinality-1 fail-closed, cajero exclusion) matching design.md verbatim in substance |

### Coherence (Design)

| Decision | Followed? | Notes |
|----------|-----------|-------|
| D6, puedeVerSucursal excludes cajero | Yes | Verified in rules source; cajero auditoria access stays on its own pre-existing branch |
| D8, cardinality-1 rule for admin_sucursal (mirrored as esAdminSucursal) | Yes | sucursales.size() == 1 enforced, 0 and 2+ tested |
| Migration/Rollout, S1 precedes S5, does not affect Gerente | Yes | Only new predicates plus 4 read-path wirings; esAdmin()/esCajero() paths in the diff are unchanged; full pre-existing suite still passes |
| Query-provability open question in design.md | Resolved | apply-progress.md records that the "in" form paired with a client array-contains filter passed on first try in the emulator; no hasAny fallback needed, matches the rules diff exactly |

### TDD Compliance

| Check | Result | Details |
|-------|--------|---------|
| TDD Evidence reported | Yes | Found in apply-progress.md (RED/GREEN/REFACTOR table) |
| All tasks have tests | Yes | 1/1 task (S1) has a test file (infra/test/reglas.test.ts) |
| RED confirmed (tests exist) | Yes | Test file exists; 16 new it() blocks confirmed via git diff main -- infra/test/reglas.test.ts |
| GREEN confirmed (tests pass) | Yes | Independently re-run: 70/70 in reglas.test.ts, 81/81 across test:rules, exit 0 |
| Triangulation adequate | Yes | Every scenario has an affirmative/negative pair; usuarios additionally covers a foreign-filter negative and a malformed-claim pair beyond the spec minimum |
| Safety Net for modified files | Yes | infra/firestore.rules and reglas.test.ts are both pre-existing, modified files; the pre-existing 54 tests in reglas.test.ts (and the other 4 rules-suite files) all still pass unmodified, proving the safety net held |

**TDD Compliance**: 6/6 checks passed

**Discrepancy note (WARNING, not blocking)**: apply-progress.md's narrative evidence
(RED: 5 failed, 74 passed; GREEN: 79/79) does not reconcile with the actual,
independently-verified state: infra/test/reglas.test.ts has 70 it() blocks (54
pre-existing plus 16 added by this diff, confirmed via git diff main), and the full
test:rules run is 81/81 across 5 files, not 79/79. The GREEN claim (tests pass) is
independently confirmed true by this verify run; only the specific historical counts in
the progress narrative are inaccurate or stale. Recommend the apply phase correct these
counts before archive; this does not affect the pass verdict since current evidence was
independently re-executed and confirms 100 percent pass.

---

### Test Layer Distribution

| Layer | Tests | Files | Tools |
|-------|-------|-------|-------|
| Integration (security-rules, real emulator) | 81 | 5 | firebase rules-unit-testing, Firestore+Auth emulator |
| Unit | 0 | 0 | N/A, this slice is rules-only |
| E2E | 0 | 0 | not installed for this slice |
| Total | 81 | 5 | |

S1's 8 spec scenarios are all covered at the integration layer (real emulator, real rule
evaluation), the correct layer for security-rules logic. No SUGGESTION needed.

---

### Changed File Coverage

Coverage analysis skipped, no coverage instrumentation configured for the
firebase emulators:exec vitest rules-test harness (informational only, not a failure).

---

### Assertion Quality

Scanned all 16 new test cases in infra/test/reglas.test.ts (D6 describe block) for the
Strict TDD banned-pattern list (tautologies, orphan empty checks, ghost loops,
implementation-detail coupling, mock-heavy tests, smoke-test-only).

**Assertion quality**: All assertions verify real behavior. Every test calls
assertSucceeds/assertFails around a real Firestore read or query against the live
emulator with the actual rules file loaded, no mocks, no tautologies, no loops over
possibly-empty collections, no CSS or implementation-detail coupling (N/A for security
rules). Each affirmative test has a companion negative test asserting the opposite
outcome under a varied claim or target (real triangulation, not same-value repetition).

---

### Quality Metrics

**Linter**: No errors (npm run lint, eslint ., exit 0)
**Type Checker**: No errors (npm run typecheck, all workspaces, exit 0)

### Budget

git diff --numstat (worktree vs main at f4f6f24): 303 total additions plus deletions
across 6 files, under the 400-line hard limit and under the per-slice S1 forecast
(about 305 in tasks.md; apply-progress.md reported 285, a minor undercount vs the
independently re-measured 303, see Issues below).

### Issues Found

**CRITICAL**: None.

**WARNING**:
1. openspec/changes/rol-admin-sucursal/tasks.md task 1.1 checkbox is still unchecked
   while apply-progress.md marks the same task complete and reports it done.
   Documentation sync gap only, code and tests are complete and passing.
2. apply-progress.md's TDD Cycle Evidence narrative counts (5 failed / 74 passed at RED,
   79/79 at GREEN) do not match the independently re-verified actual state (70 tests in
   reglas.test.ts, 81/81 across test:rules). The GREEN pass claim is independently
   confirmed true right now; only the specific historical counts are stale.
3. apply-progress.md's reported budget (285 total lines) undercounts the actual
   git diff --numstat total (303) by 18 lines. Both are well under the 400 hard limit,
   so this does not change the verdict, but the reported figure should be corrected.

**SUGGESTION**: None.

### Verdict
PASS
All 2 S1 spec requirements and 8 scenarios have passing covering tests (81/81 total,
independently re-run), typecheck and lint are clean, docs 09/01/03/ADR-27 match the
rules diff exactly, and the change is under the 400-line budget (303 lines). The 3
WARNINGs are documentation-accuracy issues in apply-progress.md and tasks.md, not code
or test defects.
