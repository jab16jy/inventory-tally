```yaml
schema: gentle-ai.verify-result/v1
evidence_revision: sha256:9e940fb3533a2bc51edc5d70a16ac7db003489dd9d559247135f490ca7c8d3c5
verdict: pass
blockers: 0
critical_findings: 0
requirements: 2/2
scenarios: 7/7
test_command: (cd packages/functions && firebase emulators:exec --project demo-conteo-eficiente --only firestore,auth "npx vitest run test/callables/desactivar-categoria.test.ts test/callables/reactivar-categoria.test.ts test/callables/eliminar-categoria.test.ts")
test_exit_code: 0
test_output_hash: sha256:6cb9ec37ec013c734c12cbd257bb89ad87fe4bacc729e4139798e4160e14dd6a
build_command: npm run typecheck (worktree root)
build_exit_code: 0
build_output_hash: sha256:2f3195dd2626c149fc17ec47a09bf8d8f5bc93d7548baf414d2587aa78902a65
```

## Verification Report

**Change**: rol-admin-sucursal
**Scope**: Slice S3b only (task 3.2, `desactivarCategoria` + `reactivarCategoria` + `eliminarCategoria` exclusive-write gate). S1/S2a/S2b/S3a are separate, already-verified slices (verify-report-s1.md, verify-report-s2a.md, verify-report-s2b.md, verify-report-s3a.md - not re-litigated here). S4+ is not implemented and out of scope; its spec scenarios are NOT counted below.
**Version**: N/A
**Mode**: Strict TDD

**Worktree**: C:/Users/PC RYZEN/Documents/Proyectos/Sistema inventario-worktrees/feat-rol-admin-sucursal-categoria-desactivar-eliminar, branch feat/rol-admin-sucursal-categoria-desactivar-eliminar, based on 0f97963 (S3a merge point). No commit made -- candidate is unstaged in the worktree; git status --short was identical (same 7 files) before and after every command run in this verification.

### Evidence revision -- how it was computed

sha256 of the exact unified diff (git diff) restricted to the 7 files task 3.2 touches, in this fixed order: docs/diseno/08-contratos-y-cloud-functions.md, packages/functions/src/callables/desactivar-categoria.ts, packages/functions/src/callables/eliminar-categoria.ts, packages/functions/src/callables/reactivar-categoria.ts, packages/functions/test/callables/desactivar-categoria.test.ts, packages/functions/test/callables/eliminar-categoria.test.ts, packages/functions/test/callables/reactivar-categoria.test.ts. Command: git diff -- 7-paths > candidate.diff then sha256sum candidate.diff.

git diff --numstat on the same 7 paths: 6+0, 12+3, 24+3, 12+3, 94+9, 116+9, 98+10 = 399 additions+deletions. apply-progress.md's own S3b Budget section reports 397 -- the 2-line discrepancy is explained and confirmed below (Orchestrator addendum section): the writer's candidate (eliminar-categoria.ts at 22+3) was extended by 2 lines (a comment + one exigirExclusivaDeSucursal call) for the TOCTOU re-check inside the delete transaction, per the task brief's stated orchestrator addition. 399 is still under the 400 hard limit, but with only 1 line of headroom -- informational, not a defect.

### Completeness (S3b only)

| Metric | Value |
|--------|-------|
| Tasks total (this report scope) | 1 (task 3.2 / S3b) |
| Tasks complete per apply-progress.md | 1 |
| Tasks complete per tasks.md checkbox | 1 -- checkbox is [x] 3.2 S3b (correctly reflects completion). Task 4.1 (S4-foundation, next phase) is correctly left [ ]. |

### Build and Tests Execution

Build: Passed
```text
npm run typecheck   (from worktree root)
all 6 workspaces (web, data, functions, shared, contracts, tools) pass
exit 0
```

Tests: 27 passed / 0 failed / 0 skipped (focused command, reproduced live in this session)
```text
cd packages/functions and firebase emulators:exec --project demo-conteo-eficiente --only firestore,auth "npx vitest run test/callables/desactivar-categoria.test.ts test/callables/reactivar-categoria.test.ts test/callables/eliminar-categoria.test.ts"
Test Files  3 passed (3)
     Tests  27 passed (27)
exit 0
```
Full packages/functions suite (reported clean in apply-progress.md: 117 files, 980 tests) was NOT re-run here per instructions (focused-only scope for this report, do not run the full suite).

Coverage: not available -- no coverage tool detected in packages/functions (informational only, not blocking per Strict TDD rules).
### Source inspection -- exclusive-ownership gate placement (task 3.2)

packages/functions/src/callables/desactivar-categoria.ts and reactivar-categoria.ts (identical shape):

| Step | Order confirmed |
|---|---|
| const alcance = exigirAdminDeSucursal(req) (wrapper) | Role gate, before any read |
| tx.get(categoriaRef) (Impl, inside transaction) | Stored-value read |
| if (!categoria.exists) throw not-found | Existence check |
| exigirExclusivaDeSucursal(alcance, categoria.get(sucursalesAsignadas)) (Impl) | Ownership gate on the STORED value, before tx.update |
| tx.update(...) | Only reached after the gate passes |

packages/functions/src/callables/eliminar-categoria.ts:

| Step | Order confirmed |
|---|---|
| const alcance = exigirAdminDeSucursal(req) (wrapper) | Role gate, before any read |
| if (alcance !== null) then pre-read + exigirExclusivaDeSucursal | Ownership gate BEFORE count() -- Gerente (alcance === null) skips this block entirely, original order preserved byte-for-byte |
| db.collectionGroup(lineas).where(...).count().get() | Usage-count aggregation -- never reached by a denied admin_sucursal caller |
| db.runTransaction(...) then tx.get(categoriaRef) then exigirExclusivaDeSucursal(alcance, categoria.get(sucursalesAsignadas)) (re-check) then tx.delete(categoriaRef) | TOCTOU re-check against the FRESH transactional read, right before the delete, reusing the read already required for the existence check (zero extra Firestore reads) |

exigirExclusivaDeSucursal(alcance, sucursales) (exigir-admin.ts, unchanged since S2a/S3a): alcance === null (Gerente) short-circuits with no restriction; otherwise throws permission-denied unless sucursales is an array of length 1 whose single element equals alcance.

Invariant holds as task 3.2 states it: same exclusive-ownership rule as S3a for desactivarCategoria/reactivarCategoria; eliminarCategoria additionally moves its ownership check before count() so a denied caller never learns usage counts (confirmed at runtime below, not just statically).

### Orchestrator-added TOCTOU re-check (beyond the writer's original candidate)

The task brief flags: the orchestrator added, after the writer, a re-check of exigirExclusivaDeSucursal inside eliminarCategoria's delete transaction (TOCTOU defense; the pre-read before count() stays for the usage-count leak). Confirmed present in the live diff (line-by-line, see Source inspection above): db.runTransaction's callback now calls exigirExclusivaDeSucursal(alcance, categoria.get(sucursalesAsignadas)) right after its pre-existing tx.get/exists check and right before tx.delete, with the inline comment "Revalida en la tx (TOCTOU): la pre-lectura solo evita filtrar el conteo." This is additive, 2 lines, on top of the pre-count pre-read that the writer already implemented -- matches the task note exactly.

What it defends against: the pre-read happens outside any transaction, before count(). Firestore's count() aggregation cannot itself run inside a transaction (documented as a pre-existing ponytail: comment in the same file, predating this slice). That leaves a window between the pre-read's authorization decision and the eventual tx.delete where another write could change the categoria's sucursalesAsignadas (e.g. a concurrent actualizarCategoria moving it from exclusive-to-suc_1 to shared or global). Without the re-check, a caller who passed the pre-read gate could still delete a categoria that is no longer exclusively theirs by the time the transaction commits. The re-check closes that window by re-evaluating the SAME predicate against the transaction's own fresh read, which Firestore transactions guarantee is consistent with what gets committed (a stale read triggers automatic transaction retry).

Test coverage of the race itself: none, confirmed by inspection of all 3 test files' diffs (eliminar-categoria.test.ts new describe block has 5 cases: affirmative, global-rejected, shared-in-use-rejected [proves pre-count ordering], malformed-claim-rejected, Gerente-regression -- no case simulates a value change between the pre-read and the transactional read). This is judged in the Issues Found section below.
### Spec Compliance Matrix (S3b scope, specs/admin-sucursal/spec.md, desactivar/reactivar/eliminar-relevant scenarios only)

| Scenario | Test | Result |
|---|---|---|
| admin_sucursal acts on its own sucursal / Update on exclusively-owned categoria (affirmative) | desactivar: "admin_sucursal desactiva una categoria de su exclusiva propiedad"; reactivar: "admin_sucursal reactiva una categoria de su exclusiva propiedad"; eliminar: "admin_sucursal elimina una categoria de su exclusiva propiedad" -- all 3 via .run(req), assert the stored state changed as expected | COMPLIANT |
| Gerente unaffected (regression) -- Branch-scoped gate requirement | desactivar/reactivar/eliminar: "admin (Gerente) no se ve afectado (regresion)" -- all 3, via .run(req) | COMPLIANT |
| Malformed claim fails closed (negative) | desactivar/reactivar/eliminar: "admin_sucursal con claim malformado (0 sucursales) es rechazado, sin cambios" -- all 3, asserting HttpsError AND unchanged stored state | COMPLIANT |
| Update on global categoria rejected (negative) | desactivar/reactivar/eliminar: "admin_sucursal no puede desactivar/reactivar/eliminar una categoria global (negativo, sin cambios)" -- all 3, asserting permission-denied AND unchanged stored state | COMPLIANT |
| Update on shared categoria rejected (negative) | desactivar/reactivar: "...categoria compartida (negativo, sin cambios)"; eliminar: "...categoria compartida EN USO" (additionally proves the rejection precedes count() -- the shared-and-in-use categoria is rejected with permission-denied, never the usage-count message) -- all 3 | COMPLIANT |
| Gerente unaffected (regression) -- Categoria writes requirement (2nd instance, same underlying tests as row 2) | Same 3 Gerente tests as above | COMPLIANT |
| eliminarCategoria rejection precedes usage-count disclosure (task-specific invariant, implied by the spec's "unchanged" wording + task 3.2's own invariant statement) | eliminar: "categoria compartida EN USO" test -- seeds a real line under the shared categoria, asserts permission-denied (not the "usada en N conteos" message), and asserts the categoria document still exists | COMPLIANT |

Compliance summary: 7/7 scenario-instances compliant across the 2 in-scope requirements (Branch-scoped gate for sesion and categoria callables -- desactivar/reactivar/eliminar portion only; Categoria writes scoped to exclusively-owned categorias). S4+ (cajero anti-escalation) is explicitly out of scope for this report.
### Correctness (Static and Runtime Evidence)

| Behavior | Status | Notes |
|---|---|---|
| desactivarCategoriaImpl/reactivarCategoriaImpl each gain a required 4th param alcance of type AlcanceAdmin, no default | Implemented | TypeScript would reject any pre-existing call site if null were omitted; typecheck passed clean |
| All pre-existing Impl call sites updated (4 in desactivar-categoria.test.ts, 2+2 in reactivar-categoria.test.ts, 4 in eliminar-categoria.test.ts) | Implemented | Confirmed via diff: every one now passes a trailing null |
| desactivarCategoria/reactivarCategoria wrappers call exigirAdminDeSucursal(req) and thread alcance into the Impl; ownership check moved inside the tx, right after tx.get, before tx.update | Implemented | Matches S3a's actualizarCategoria pattern exactly (reused, not reimplemented) |
| eliminarCategoriaImpl gains required 4th param alcance; pre-read + ownership check run BEFORE count() only when alcance is not null; Gerente path unchanged byte-for-byte | Implemented | Confirmed: the alcance-not-null guard wraps the entire pre-read block |
| eliminarCategoriaImpl's delete transaction re-validates ownership against the fresh tx.get before tx.delete (TOCTOU defense, orchestrator addition) | Implemented | 2-line addition, reuses the transaction's existing tx.get/exists read -- no extra Firestore read added |
| Tests proven through the real onCall wrapper (desactivarCategoria.run/reactivarCategoria.run/eliminarCategoria.run, D5), not just Impl, for all new D2/S3b scenarios | Implemented | All 15 new describe-block tests (5+5+5) call .run(req) |
| Doc 08 documents the desactivar/reactivar/eliminar exclusive-ownership gate and the pre-count reorder | Implemented, partially | 6-line addition, matches the existing S3a-note convention; documents the pre-count() reorder but does NOT mention the delete-transaction TOCTOU re-check -- see WARNING below |

### Coherence (Design)

| Decision | Followed | Notes |
|---|---|---|
| D2 -- ownership = exigirExclusivaDeSucursal(alcance, sucursales), exact match to alcance required, mismatch denied | Yes | Reused verbatim from S2a/S3a, no new logic added |
| D5 -- test wrappers through callable.run(req) | Yes | All 15 new tests use .run(req) |
| Interfaces table: desactivar/reactivarCategoria -- Impl inside tx after tx.get | Yes | Exact match |
| Interfaces table: eliminarCategoria -- Impl checks before count(), only when alcance is not null | Yes | Exact match |
| Task 3.2 invariant: eliminarCategoria additionally moves its ownership check before count so a denied caller never learns usage counts | Yes | Confirmed by the shared-and-in-use test asserting permission-denied, never the usage-count message |
| TOCTOU re-check inside the delete transaction | Present, but NOT documented in design.md's Interfaces table or tasks.md's task 3.2 description | Judged below (WARNING, not a spec violation -- it strengthens the invariant, does not weaken or contradict it) |
### TDD Compliance

| Check | Result | Details |
|---|---|---|
| TDD Evidence reported | Yes | apply-progress.md Phase 3 section 3.2 has a RED/GREEN/REFACTOR table |
| RED confirmed | Yes (per apply-progress.md) | 24/27 passed, 3 failed for the right reason (old unconditional exigirAdmin rejected the 3 affirmative admin_sucursal cases) against the OLD callables |
| GREEN confirmed | Yes | 27/27 passed, reproduced live in this verification session |
| Triangulation adequate | Partial | Affirmative (own), Gerente regression, malformed-claim negative, global/shared negatives -- 4+ distinct outcomes per callable, plus the shared-in-use pre-count-ordering proof for eliminar. Gaps: (1) same single-element-but-foreign-sucursal gap already flagged in verify-report-s3a.md, not closed here (out of scope for this slice -- same shared helper); (2) no test isolates the TOCTOU re-check's actual race condition (see WARNING) |
| Safety net for modified files | Yes | 4+2+2+4 pre-existing Impl tests ran unchanged in the same 27/27 run |
| Known apply-time caveat honestly disclosed | Yes | apply-progress.md's own Deviations/Issues sections are accurate; this verification found no undisclosed deviation beyond the documented TOCTOU addition |

TDD Compliance: 5/6 checks fully passed, 1 partial (see WARNING below).

### Assertion Quality

Scanned the 7-file diff for banned patterns: no tautologies, no assertions skipping production-code calls, no ghost loops, no smoke-test-only patterns, no mocks (real Firestore/Auth emulator throughout all 3 test files). The discriminating negative tests (global/shared/malformed) each assert two independent facts (rejection code AND unchanged stored state), and the eliminar shared-in-use test additionally asserts the rejection is NOT the usage-count message.

Assertion quality: 0 CRITICAL, 0 WARNING

### Budget

git diff --numstat for task 3.2's 7 files: 6+0, 12+3, 24+3, 12+3, 94+9, 116+9, 98+10 = 399 additions+deletions. Under the 400-line hard limit by 1 line; above the ~320 forecast in tasks.md's Suggested Work Units table. See "Evidence revision" section above for the 397 to 399 delta explanation.
### Issues Found

CRITICAL: None.

WARNING:
1. (Carried from verify-report-s3a.md, not newly introduced, not closed by this slice) Missing negative test for the single-element-but-foreign-sucursal case (sucursalesAsignadas array of length 1, not omitted, not multi, but not equal to the caller's own sucursal) in desactivarCategoria/reactivarCategoria/eliminarCategoria. exigirExclusivaDeSucursal rejects when the array is missing, when its length is not 1, or when its single element does not equal alcance -- every current negative test in this slice trips the length-based or non-array branch; none isolates the element-mismatch branch alone. By direct source inspection (shared helper, already exercised by S2a's own dedicated test suite for this exact branch) the check is implemented correctly; no spec scenario literally requires this exact case for these 3 callables. Same class of gap as S3a, same low-risk judgment: the helper itself IS unit-tested for this branch in exigir-admin.test.ts (S2a), so this is a missing integration-level regression net for these 3 callables specifically, not an unverified code path.
2. The orchestrator-added TOCTOU re-check inside eliminarCategoria's delete transaction has no test that exercises the actual race (a concurrent write changing sucursalesAsignadas between the pre-read and the transaction's own read). The line is exercised on every call (all 27 tests pass through it, including the no-op Gerente path), proving it does not break the non-race happy/negative paths, but the specific defense it exists for -- a value change mid-flight -- is untested. Judged ACCEPTABLE, not blocking: (a) it re-uses the already-unit-tested exigirExclusivaDeSucursal predicate verbatim, introducing no new authorization logic; (b) it adds zero extra Firestore reads (reuses the transaction's pre-existing tx.get); (c) Firestore's transaction consistency guarantee means a genuine race would be caught automatically via transaction retry against fresh data, independent of whether this specific line is unit-proven; (d) deterministically simulating a true concurrent-write race would require test-harness capabilities (mid-transaction write injection) not present in this repo's emulator-based suite, and building one is disproportionate to the risk for a 2-line defense-in-depth check. Recommend (non-blocking): update doc 08's S3b note to mention the delete-transaction re-check explicitly -- currently it documents only the pre-count() reorder, not this second guard, so the invariant is not discoverable from docs alone.

SUGGESTION:
1. Fold WARNING #2's doc-08 gap into a follow-up: add one sentence to docs/diseno/08-contratos-y-cloud-functions.md's S3b paragraph naming the delete-transaction TOCTOU re-check, matching the existing convention of documenting every authorization check placement for this callable family.
2. The 399/400 budget is within 1 line of the hard limit for this slice specifically because of the orchestrator's post-writer addition. Not actionable now (the slice is complete and under budget), but worth noting for any future amendment to this same diff -- any further addition to these 7 files would need a companion trim or a follow-up slice.

### Verdict

PASS -- S3b implementation (desactivarCategoria/reactivarCategoria/eliminarCategoria exclusive-write gate, D2, plus the pre-count() reorder and the orchestrator's delete-transaction TOCTOU re-check) is complete: the ownership gate runs on the stored value before any write in all 3 callables, eliminarCategoria's pre-count reorder is proven live (a denied caller gets permission-denied, never the usage-count message, even when the categoria is genuinely in use), the alcance parameter is required with no default across all 3 Impls, all pre-existing call sites were updated, all 7 in-scope spec scenario-instances have passing covering tests reproduced live in this session (27/27), typecheck is green, and the diff is 399 lines (under the 400-line budget by 1 line). The TOCTOU re-check is judged a correct, low-risk strengthening of the invariant beyond the literal design.md/tasks.md text, not a deviation that weakens or contradicts the spec. Two WARNINGs are recorded (an inherited, not-newly-introduced missing edge-case test shared with S3a's own finding, and an untested -- but low-risk and hard-to-test -- race defense) and two informational SUGGESTIONs; neither WARNING is a spec violation and neither blocks the verdict.
