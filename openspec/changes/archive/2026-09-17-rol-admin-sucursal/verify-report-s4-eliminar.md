```yaml
schema: gentle-ai.verify-result/v1
evidence_revision: sha256:667320fba04e386b91261e9e6ce1b85f5196a02f4fc69c6c29364057584d98cd
verdict: pass_with_warnings
blockers: 0
critical_findings: 0
requirements: 1/1
scenarios: 5/5
test_command: (cd packages/functions && firebase emulators:exec --project demo-conteo-eficiente --only firestore,auth "npx vitest run test/callables/eliminar-cajero.test.ts")
test_exit_code: 0
test_output_hash: sha256:5dd4e20c59c8fb230ec5817767a97ba8483651cab7c137f029a561589125caa0
build_command: npm run typecheck (worktree root, all workspaces)
build_exit_code: 0
build_output_hash: sha256:2f3195dd2626c149fc17ec47a09bf8d8f5bc93d7548baf414d2587aa78902a65
```

## Verification Report

**Change**: rol-admin-sucursal
**Scope**: Slice S4-eliminar only (task 4.5: `eliminarCajero` target-claims wiring). S1 through S4-desactivar-reactivar are separate, already-verified slices (verify-report-s1.md through verify-report-s4-desactivar-reactivar.md, not re-litigated here). S5a-c, S6 and S7 are unimplemented and explicitly OUT OF SCOPE below (not failed). **This slice completes Phase 4.**

**Mode**: Strict TDD
**Verifier**: orchestrator, inline. The delegated `sdd-verify` run for this slice terminated early on an API session limit (HTTP 429) before producing a report; the orchestrator reproduced every command and finding directly rather than relaunching a cold agent. Every number below was measured in this session, not copied from `apply-progress.md`.

### Evidence revision, how it was computed

sha256 of the exact unified diff (`git diff`) restricted to the 2 files task 4.5 touches, in this fixed (alphabetical) order: `packages/functions/src/callables/eliminar-cajero.ts`, `packages/functions/test/callables/eliminar-cajero.test.ts`. Same method as the prior slice reports.

**Worktree**: `C:/Users/PC RYZEN/Documents/Proyectos/Sistema inventario-worktrees/feat-rol-admin-sucursal-eliminar-cajero`, branch `feat/rol-admin-sucursal-eliminar-cajero`, based on `d92a173` (S4-desactivar-reactivar commit). Candidate unstaged; `git status --short` showed exactly the 2 files the task names, before and after every command.

### Completeness (S4-eliminar only)

| Task | Claimed | Verified |
|---|---|---|
| 4.5 `eliminarCajero` target-claim wiring, decided before participaciones count / any side effect | complete | **Yes** |

Files changed, reproduced with `git diff --numstat`:

```
5	2	packages/functions/src/callables/eliminar-cajero.ts
176	3	packages/functions/test/callables/eliminar-cajero.test.ts
```

Total additions + deletions = **186** — matches the writer's claim exactly (forecast ~220, hard limit 400). No drift.

### Build and Tests Execution

| Command | Exit | Result |
|---|---|---|
| `(cd packages/functions && firebase emulators:exec ... "npx vitest run test/callables/eliminar-cajero.test.ts")` | 0 | **17/17 passed** (10 pre-existing + 7 new authorization cases) |
| `npm run typecheck` (worktree root) | 0 | Clean, all workspaces |

The writer additionally reported `npm run lint` clean and a full `npm test` run at 263/264, with one non-reproducing timeout in the unrelated `test/triggers/on-aporte-escrito.test.ts` (`D2/RNF-03`) that passed 11/11 standalone. That flake is pre-existing and already recorded against S3a; it is not caused by this slice and was not re-run here.

### Source inspection, implementation vs. design.md Interfaces block

design.md's Interfaces row reads: `desactivar/reactivar/eliminarCajero | wrapper: await exigirCajeroObjetivo(...). This runs before every side effect and before eliminar's participaciones count`.

The candidate's wrapper:

```ts
export const eliminarCajero = onCall({ region: "us-central1" }, async (req) => {
  const alcance = exigirAdminDeSucursal(req);
  const datos = validar(req.data, eliminarCajeroSchema);
  await exigirCajeroObjetivo(getAuth(), alcance, datos.uid);
  return eliminarCajeroImpl(getFirestore(), getAuth(), req.auth!.uid, datos);
});
```

`eliminarCajeroImpl` is byte-identical to `d92a173` — confirmed: the diff touches only the import line and the wrapper body. Placing the gate in the wrapper satisfies "before the participaciones count" structurally, because the entire Impl runs after it. **Contrast with S3b**: `eliminarCategoria` required an Impl-internal reorder because its check depended on data the Impl itself reads. Here the check reads only the target's Auth claims, independent of anything the Impl loads, so no reorder is needed. This is a real difference between the two slices, not an oversight.

### Spec Compliance Matrix (S4-eliminar scope only)

Spec: `specs/gestion-cajeros/spec.md`, requirement *"`eliminarCajero` is Gerente-only or admin_sucursal scoped to its own sucursal, decided before any side effect"* — 1 requirement, 5 enumerated scenarios.

| # | Scenario | Test | Status |
|---|---|---|---|
| 1 | Deleting a cajero assigned solely to own sucursal (affirmative) | `admin_sucursal elimina un cajero de su propia sucursal (afirmativo)` | COMPLIANT |
| 2 | Cajero shared with another sucursal rejected, no `deleteUser`, no Firestore delete | the count-ordering test (target seeded `[sucursalId, otraSucursalId]`) | COMPLIANT |
| 3 | Target with rol `admin` or `admin_sucursal` rejected before any side effect | `objetivo con custom claims admin/admin_sucursal ...` — asserts **both** claim values | COMPLIANT |
| 4 | Cajero of another sucursal entirely rejected | `objetivo de sucursal ajena es rechazado sin efectos` | COMPLIANT |
| 5 | Gerente unaffected, existing business guards still apply | `admin (Gerente) no se ve afectado por el alcance (regresión)` | COMPLIANT |

The requirement's orphan clause (*"The orphan-account path stays Gerente-only: `admin_sucursal` is denied there (fail closed)"*) is not an enumerated scenario but is pinned by two additional tests beyond the five — see below. Total new cases: **7**.

### Check 1 — does the count-ordering test genuinely discriminate?

**Yes.** The test seeds a target with `sucursalesAsignadas: [sucursalId, otraSucursalId]` (shared, therefore out of reach) AND a real `sesiones/{id}` document with `participantes: [uid]`, then asserts:

```ts
await expect(
  eliminarCajero.run(reqEliminarCajero("admin_sucursal", [sucursalId], { uid })),
).rejects.toMatchObject({ code: "permission-denied" });
expect(borrar).not.toHaveBeenCalled();          // auth.deleteUser spy
expect(perfil.exists).toBe(true);
```

If the gate ran *after* the participaciones `count()`, `eliminarCajeroImpl` would reach the count, find `n === 1`, and throw `failed-precondition` with the message `"No se puede eliminar: participó en 1 conteo."`. That is a different `code`, so `toMatchObject({ code: "permission-denied" })` would fail. The seeded participación is what makes this a discriminator rather than a tautology — without it both orderings would produce `permission-denied` and the test would prove nothing. This is the same technique S3b used for `eliminarCategoria`.

It also directly proves the leak the invariant exists to prevent: a denied caller never learns how many conteos reference the target.

### Check 2 — is the orphan fallback Gerente-only, per D3?

**Yes, and it matches D3 verbatim rather than regressing.** D3 states: *"The profile stays only in eliminar's existing orphan fallback, which is reachable for the Gerente only. For admin_sucursal, a missing Auth user returns `not-found`."*

`exigirCajeroObjetivo` maps `auth/user-not-found` to `HttpsError("not-found")`, so the wrapper now short-circuits an `admin_sucursal` caller before `eliminarCajeroImpl`'s orphan branch is reached. Two new tests, both through `eliminarCajero.run(req)`, pin exactly that:

| Test | Assertion | Verified |
|---|---|---|
| orphan target, `admin_sucursal` caller | rejects `not-found`; `usuarios/{uid}` still exists | Yes |
| orphan target, Gerente caller | `eliminado: true`; `usuarios/{uid}` gone | Yes |

The three pre-existing Impl-level orphan tests (lines 139–172, calling `eliminarCajeroImpl` directly) are untouched and still pass, so the fallback logic itself is unchanged — only who can reach it.

### Independent assessment of the three RDD dispositions

| Finding | Orchestrator's disposition | Verifier's conclusion |
|---|---|---|
| WARNING: rejected attempts may no longer be audited, versus a "coarser pre-change gate inside `eliminarCajeroImpl`" | Premise false | **Confirmed false.** `git show HEAD:packages/functions/src/callables/eliminar-cajero.ts` has exactly one `registrarAuditoria` call, inside the success transaction writing `USUARIO_ELIMINADO`. No rejection path wrote an audit record before this change, and none does after. No regression. Separately: that *no* callable audits rejected privilege-escalation attempts is a genuine pre-existing product gap system-wide, worth its own issue, and out of scope here. |
| SUGGESTION: no test for an `admin_sucursal` with several sucursales partially overlapping the target's | Structurally unreachable | **Confirmed.** `exigirAdminDeSucursal` throws unless an `admin_sucursal` token carries exactly 1 sucursal, so a multi-sucursal caller never reaches the target check. There is no overlap/subset semantics to probe: `exigirExclusivaDeSucursal` demands the target's `sucursales` equal exactly `[alcance]`. The caller-cardinality cases are unit-tested in S4-foundation (`test/lib/exigir-admin.test.ts`), and task 4.5's RED list — unlike 4.3's and 4.4's — does not ask for a malformed-claim case. Not a gap. |
| SUGGESTION: check-then-act race between the claims read and the deletion | Follow-up, cross-system | **Confirmed.** Same Auth-versus-Firestore TOCTOU dispositioned in S4-actualizar and S4-desactivar-reactivar; no Firestore transaction can span a Firebase Auth read. Recurring follow-up, not a slice defect. |

### Issues Found

| # | Severity | Finding |
|---|---|---|
| 1 | WARNING | Recurring cross-system TOCTOU between `exigirCajeroObjetivo`'s Auth read and the deletion path. Follow-up; not closable within this slice. |
| 2 | WARNING | No wrapper-level test for the Auth-`not-found` path as a *generic* condition (distinct from the orphan case, which IS covered here). Fourth callable with this gap; the consolidated cleanup slice recommended after Phase 4 should close all four. |
| 3 | SUGGESTION | Rejected privilege-escalation attempts are not audited anywhere in the system. Pre-existing and system-wide, not introduced here. |

### Verdict

**PASS WITH WARNINGS** — 1/1 requirements, 5/5 enumerated scenarios (plus 2 extra tests pinning the requirement's orphan clause), 0 CRITICAL, 0 blockers. Implementation matches design D3 and the Interfaces table exactly, with no deviations. Phase 4 (tasks 4.1–4.5) is complete.
