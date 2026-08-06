# Tasks — complete-cloud-functions

Phase: `sdd-tasks` · Store: `hybrid` · Engram: `sdd/complete-cloud-functions/tasks`
Depends on: `proposal.md`, `specs/*/spec.md`, `design.md`.

> Size note: exceeds the skill's 530-word default — the launch prompt requires 6
> explicit slices, TDD-paired tests (with negative/affirmative counterparts), a
> mandatory doc-correction task per divergence (AGENTS.md §0), and full work-unit
> evidence per slice. Explicitly requested detail is not debt.

## Review Workload Forecast

| Field                   | Value                                                                           |
| ----------------------- | ------------------------------------------------------------------------------- |
| Estimated changed lines | ≈1705 total (350+185+220+290+360+300)                                           |
| 400-line budget risk    | Medium — slice 1 (350) and slice 4 (360) are tight; no single slice exceeds 400 |
| Chained PRs recommended | Yes                                                                             |
| Suggested split         | PR 1 → PR 2a → PR 2b → PR 3 → PR 4 → PR 5                                       |
| Delivery strategy       | auto-chain                                                                      |
| Chain strategy          | pending                                                                         |

```text
Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: pending
400-line budget risk: Medium
```

`Decision needed before apply: Yes` because `chain_strategy` (stacked-to-main vs.
feature-branch-chain) has not been collected — the orchestrator must collect it
before `sdd-apply` starts slice 1, per the launch prompt.

### Suggested Work Units

| Unit | Goal                                        | PR    | Focused test command                                                                                                                                                                                                                                            | Runtime harness                                                  | Rollback boundary                                                                                                                                                                                                                                                   |
| ---- | ------------------------------------------- | ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | `calcularResumen` + `marcaAportes` + cron   | PR 1  | `cd packages/shared && npm test`; `cd packages/functions && firebase emulators:exec --config ../../infra/firebase.json --project demo-conteo-eficiente --only firestore,auth "vitest run test/lib/resumen.test.ts test/scheduled/recalcular-resumenes.test.ts"` | Same `emulators:exec` — real firestore+auth emulator, not mocked | Revert removes `lib/resumen.ts`, `scheduled/recalcular-resumenes.ts`, the trigger's `marcaAportes` line, the `calculadora.ts` widening, the index export, and the 3 doc edits — restores current (defective) never-cleared-`dirty` state. No dependents merged yet. |
| 2a   | `verificarSincronizacion` (RF-16 predicate) | PR 2a | `firebase emulators:exec --config ../../infra/firebase.json --project demo-conteo-eficiente --only firestore,auth "vitest run test/lib/sincronizacion.test.ts"`                                                                                                 | Same `emulators:exec`                                            | Revert removes `lib/sincronizacion.ts` and its test — unused by anything else yet (lands with no caller, same shape as an already-shipped ahead-of-consumer contract).                                                                                              |
| 2b   | `cerrarSesion` freeze + snapshot            | PR 2b | `firebase emulators:exec ... "vitest run test/callables/cerrar-sesion.test.ts"`                                                                                                                                                                                 | Same `emulators:exec`                                            | Revert removes `callables/cerrar-sesion.ts`, its index export, and the doc edits — sessions remain open-only closable via no path (current state), no data written by this callable to roll back.                                                                   |
| 3    | `crearCajero`                               | PR 3  | `cd contracts && npm test -- crear-cajero.schema.test.ts`; `firebase emulators:exec ... "vitest run test/callables/crear-cajero.test.ts"`                                                                                                                       | Same `emulators:exec`                                            | Revert removes `callables/crear-cajero.ts`, the schema's digit-regex, its index export, and the doc edit — no cajeros created via this path yet to migrate.                                                                                                         |
| 4    | `actualizarCajero` + `desactivarCajero`     | PR 4  | `cd contracts && npm test -- actualizar-cajero.schema.test.ts desactivar-cajero.schema.test.ts`; `firebase emulators:exec ... "vitest run test/callables/actualizar-cajero.test.ts test/callables/desactivar-cajero.test.ts"`                                   | Same `emulators:exec`                                            | Revert removes both callables, both schemas + their `contracts/schemas/index.ts` exports, `USUARIO_ACTUALIZADO`, and the two index exports — independent of slice 3's `crearCajero` at the data level.                                                              |
| 5    | `reconciliarLineas`                         | PR 5  | `firebase emulators:exec ... "vitest run test/scheduled/reconciliar-lineas.test.ts"`                                                                                                                                                                            | Same `emulators:exec`                                            | Revert removes `scheduled/reconciliar-lineas.ts`, its index export, and the two doc edits — a scheduled-only cron with no other caller.                                                                                                                             |

---

## Slice 1 — `calcularResumen` + `marcaAportes` + `recalcularResumenes` (~350 lines, no dependency)

- [x] 1.1 RED: `packages/functions/test/lib/resumen.test.ts` — totals-match-seeded-lineas (affirmative, spec "Recomputation produces correct totals"), empty session, extremes, a category whose `cantidadTotal` drops to 0 is dropped from `porCategoria` (D-2 full-overwrite rationale).
- [x] 1.2 GREEN: create `packages/functions/src/lib/resumen.ts` — `calcularResumen(lineas: readonly QueryDocumentSnapshot[])` per D-2: reuses `calculadora.ts`, inline ~8-line `categoriaMayor`/`categoriaMenor` loop, `numCategoriasConConteo = lineas.length`, no new abstraction.
- [x] 1.3 Widen `packages/shared/src/services/calculadora.ts`: add `type LineaSumable = Pick<LineaConteo, "cantidadTotal" | "valorUnitario">`, widen `subtotal`/`totalUnidadesSesion`/`totalMonetarioSesion` to accept it (behaviour-identical, existing callers/tests untouched).
- [x] 1.4 Modify `packages/functions/src/triggers/on-aporte-escrito.ts:92` — `tx.set(resumenRef, { dirty: true, marcaAportes: FieldValue.increment(1) }, { merge: true })` (invariant I-M). Own RED/GREEN pair added in `test/triggers/on-aporte-escrito.test.ts` (I-M scenario) beyond what this line item names.
- [x] 1.5 RED (race pair, deterministic interleaving via `vi.spyOn`, same technique as `abrir-sesion.test.ts:90`): extend `packages/functions/test/scheduled/recalcular-resumenes.test.ts` — open-session-evaluated / closed-session-never-touched (spec "Cron scope"), clean-summary-skipped / dirty-summary-not-skipped (spec "Non-dirty summaries are skipped"), no-concurrent-aporte-clears-correctly (**affirmative**), concurrent-aporte-during-recompute-dirty-must-not-falsely-clear (**negative**: mutate a `linea` + bump `marcaAportes` between step 2 and step 3 → assert nothing written, `dirty` stays `true`). Verified this negative test genuinely fails against a naive implementation that skips the compare (manually disabled the compare, confirmed the test goes red, reverted). Also added an extra affirmative test (not in the original task text) proving a corrupted sibling session cannot block recompute of other open sessions — needed once the impl gained the per-session try/catch below.
- [x] 1.6 GREEN: create `packages/functions/src/scheduled/recalcular-resumenes.ts` — `recalcularResumenesImpl(db)` implementing D-1's 3-step compare-and-clear (`get resumen→M` / `get lineas` outside tx / `runTransaction` compare `marcaAportes===M`); `onSchedule({ schedule: "every 1 minutes", region: "us-central1" }, ...)` (OQ-1 decision — 30 s is not a valid Cloud Scheduler granularity). Also wraps each session's recompute in try/catch (AGENTS.md §1 "error handling that prevents loss of counts") so one corrupted/malformed session can never block the recompute of every other open session in the same cron run — logged, not thrown; `dirty` stays `true` and the next cycle retries.
- [x] 1.7 Add export line for `recalcularResumenes` to `packages/functions/src/index.ts`.
- [x] 1.8 Doc correction: `docs/diseno/08-contratos-y-cloud-functions.md` §4 lines 283–323 (wrong pseudocode → D-1's 3-step rule) and §2 (cadence "30 s" → "every 1 minutes", OQ-1).
- [x] 1.9 Doc correction: `docs/diseno/04-modelo-de-datos-firestore.md` §3 `resumen/actual` — add `marcaAportes` field.
- [x] 1.10 Doc correction: `docs/diseno/05-concurrencia-offline-tiempo-real.md` §3 line 162 trigger snippet — add the `marcaAportes` bump + state invariant I-M; §7 T-5 acceptance test "< 60 s" → "< 90 s" (OQ-1 fallout, 1-minute cron cannot guarantee 60 s).
- [x] 1.11 Pre-close: `npm run typecheck && npm run lint && npm test` (root, covers `shared` + `functions`). All green — see apply-progress notes for the verbatim run.
- [ ] 1.12 Commit (`fix(functions): calcula resumen de sesión y limpia dirty vía marcaAportes monotónico`) — NOT done by sdd-apply; RDD review + commit owned by the orchestrator per launch prompt.

## Slice 2a — `verificarSincronizacion` / RF-16 predicate (~185 lines, depends on Slice 1)

- [x] 2a.1 RED (full matrix, negative/affirmative pairs): `packages/functions/test/lib/sincronizacion.test.ts` — confirmed-never-recontributed (**affirmative**), confirmed-then-recontributed-stale (**negative**, discriminates the naive `confirmadoEn`-truthy check doc 08 currently has), never-confirmed-unsynchronized (**affirmative**), deactivated-participant-excluded (**affirmative**), active-but-unsynchronized-still-blocks (**negative counterpart**, proves the exclusion is keyed on `activo`, not on being unsynchronized). Confirmed RED against a missing module, then re-verified the discriminating case alone by temporarily swapping the predicate for a naive `!!confirmadoEn` check: only that one test failed (4/5 still passed), reverted immediately. A sixth case was added during orchestrator verification: every case in the matrix above uses a single participant, so none of them can fail if `db.getAll(...)` ever stopped returning snapshots in the requested order — the one assumption the implementation cannot prove in the type system. The added multi-participant case discriminates that too (verified by temporarily reversing the index correspondence: only the new test failed, 5/6 still passed).
- [x] 2a.2 GREEN: create `packages/functions/src/lib/sincronizacion.ts` — `verificarSincronizacion(db, sesionId, participantes) → { sinConfirmar, excluidosPorInactivo }` per D-3: predicate `confirmadoEn != null && confirmadoEn >= (ultimoAporteServidor ?? 0)`; one `db.getAll(...usuarios refs)` for names + `activo`.
- [x] 2a.3 Doc correction: `docs/diseno/08-contratos-y-cloud-functions.md` lines 209–212 — replace the `confirmadoEn`-truthiness check with the two-part predicate, and document the `usuarios/{uid}.activo === false` exclusion.
- [x] 2a.4 Doc correction: `docs/diseno/04-modelo-de-datos-firestore.md` §3 `sincronizacion/estado` — one line defining the synchronized predicate.
- [x] 2a.5 Pre-close: `npm run typecheck && npm run lint && npm test`. All green (typecheck: 0 errors across all workspaces; lint: 0 errors; test: 234/234 passed — functions 35/35 incl. the new 5/5 in `sincronizacion.test.ts`).
- [ ] 2a.6 Commit (`feat(functions): agrega verificarSincronizacion con predicado RF-16 corregido`).

## Slice 2b — `cerrarSesion` freeze + snapshot (~220 lines, depends on Slice 2a)

- [ ] 2b.1 RED (affirmative/negative pairs per `cierre-sesion` spec): `packages/functions/test/callables/cerrar-sesion.test.ts` — unauthenticated / non-admin rejected, admin-proceeds (**affirmative**), missing-`sesionId` rejected, `forzar`-defaults-false (**affirmative**), already-closed rejected + no write (idempotent-safe), open-session-proceeds (**affirmative**), blocked-without-`forzar` + `CIERRE_BLOQUEADO` audit, forced-close-overrides-and-audited (**affirmative**), no-unsynchronized-closes-without-forzar (**negative counterpart**), snapshot-matches-final-recompute (**affirmative**), retried-close-after-success-rejected / retried-close-after-failure-reruns-cleanly (D-4 idempotency, `vi.spyOn` interleaving).
- [ ] 2b.2 GREEN: create `packages/functions/src/callables/cerrar-sesion.ts` — Phase A outside any tx (`exigirAdmin` → `validar(cerrarSesionSchema)` → get sesión/estado check → `verificarSincronizacion` → block+audit `CIERRE_BLOQUEADO` if `sinConfirmar.length && !forzar`); Phase B one `db.runTransaction` (re-check `estado`, `tx.get(lineasQuery)`, `calcularResumen`, update `sesion`+`sucursal`, `tx.create(historicosRef)`, full-overwrite `resumenRef` with `dirty:false`, `registrarAuditoria(tx, db, {tipo:"SESION_CERRADA", forzado, sinConfirmar, excluidosPorInactivo})`) per D-4.
- [ ] 2b.3 Add export line for `cerrarSesion` to `packages/functions/src/index.ts`.
- [ ] 2b.4 Doc correction: `docs/diseno/08-contratos-y-cloud-functions.md` lines 227–248 — replace inline-recompute-before-freeze with the Phase A / Phase B shape; correct the `registrarAuditoria(db, {...})` pseudocode call to the real transactional signature `registrarAuditoria(tx, db, evento)` (`packages/functions/src/lib/auditoria.ts`, doc 09 §5).
- [ ] 2b.5 Pre-close: `npm run typecheck && npm run lint && npm test`.
- [ ] 2b.6 Commit (`feat(functions): implementa cerrarSesion con verificación RF-16 y snapshot atómico`).

## Slice 3 — `crearCajero` (~290 lines, independent of 1/2; keep before Slice 4)

- [ ] 3.1 RED (negative/affirmative pair, digit rule): extend `contracts/schemas/crear-cajero.schema.test.ts` — `passwordTemporal` of 8+ chars with no digit rejected (**negative**, discriminates the new rule), 8+ chars with a digit passes (**affirmative counterpart**).
- [ ] 3.2 GREEN: modify `contracts/schemas/crear-cajero.schema.ts:7` — `passwordTemporal: z.string().min(8).regex(/\d/)` per doc 09 §2 ("mínimo 8 caracteres con al menos un número"); this schema stays the single enforcement point named by the doc ("validado en la callable" — the callable's `validar()` call _is_ this schema check, no separate manual check added).
- [ ] 3.3 RED (per `gestion-cajeros` spec + D-6 compensation): `packages/functions/test/callables/crear-cajero.test.ts` — unauthenticated/cajero-caller rejected, admin-proceeds (**affirmative**), valid-input-creates-cajero (**affirmative**: claims + `usuarios/{uid}.activo` + `USUARIO_CREADO` audit), duplicate-email rejected with zero side effects, invalid-input rejected before touching Auth/Firestore, compensation (`vi.spyOn` forces the post-`createUser` step to throw → assert `auth.deleteUser(uid)` ran and a retry with the same email succeeds).
- [ ] 3.4 GREEN: create `packages/functions/src/callables/crear-cajero.ts` — `exigirAdmin` → `validar(crearCajeroSchema)` → `auth.createUser` → `try { setCustomUserClaims; one Firestore tx: tx.create(usuarios/{uid}) + registrarAuditoria(USUARIO_CREADO) } catch { auth.deleteUser(uid); rethrow }` per D-6 (same compensation shape as `abrir-sesion.ts:99-109`).
- [ ] 3.5 Add export line for `crearCajero` to `packages/functions/src/index.ts`.
- [ ] 3.6 Doc correction: `docs/diseno/08-contratos-y-cloud-functions.md` `crearCajero` snippet — add the `auth.deleteUser` compensation on post-create failure.
- [ ] 3.7 Pre-close: `npm run typecheck && npm run lint && npm test`.
- [ ] 3.8 Commit (`feat(functions): implementa crearCajero con compensación y valida contraseña con dígito`).

## Slice 4 — `actualizarCajero` + `desactivarCajero` (~360 lines, independent of 1/2; depends on Slice 3 for the claims/token pattern)

> **Spec/design conflict — RESOLVED by the user: full replacement wins.** `design.md`'s
> Interfaces section (all 4 fields required, "full replacement, not a partial patch") is
> the binding contract. The `gestion-cajeros` spec has been corrected to match: every
> field is required and its negative scenarios now supply a complete, otherwise-valid
> object so each fails for exactly one reason. Rationale: `setCustomUserClaims` replaces
> the entire claims object, so a partial update would need a read-modify-write spanning
> Auth and Firestore and would break D-6's convergent-retry recovery rule. Token
> revocation still fires only on an actual `rol`/`sucursalesAsignadas` change, so a
> name-only edit does not force a re-login.

- [ ] 4.1 RED: `contracts/schemas/actualizar-cajero.schema.test.ts` — complete object `{uid, nombre, rol, sucursalesAsignadas}` passes (**affirmative**), partial `{uid, nombre}` rejected (**negative**, discriminates full replacement), invalid `rol` with all other fields valid rejected (**negative**, discriminates the enum alone), oversized `sucursalesAsignadas` (11 ids) with all other fields valid rejected (**negative**, discriminates the max bound alone). Every negative case supplies a complete, otherwise-valid object — a case missing several fields at once would also fail with the rule under test removed and would discriminate nothing (`AGENTS.md` §2).
- [ ] 4.2 GREEN: create `contracts/schemas/actualizar-cajero.schema.ts` — `{ uid: z.string().min(1), nombre: z.string().min(1), rol: z.enum(["admin","cajero"]), sucursalesAsignadas: z.array(z.string()).max(10) }`. All required; `correo` excluded (changing the sign-in address is a separate operation, threat A-6).
- [ ] 4.3 RED: `contracts/schemas/desactivar-cajero.schema.test.ts` — valid `{uid}` passes (**affirmative**), empty `uid` rejected (**negative counterpart**).
- [ ] 4.4 GREEN: create `contracts/schemas/desactivar-cajero.schema.ts` — `{ uid: z.string().min(1) }` only (no `motivo`/`fecha`/flag — YAGNI, not in any design doc).
- [ ] 4.5 Add both schemas + inferred types as export pairs to `contracts/schemas/index.ts`.
- [ ] 4.6 Add `USUARIO_ACTUALIZADO` to `TipoEventoAuditoria` in `packages/functions/src/lib/auditoria.ts` (OQ-2 resolved: add it — RNF-08 / doc 09 "Completa" requires every profile modification audited).
- [ ] 4.7 Doc correction: `docs/diseno/04-modelo-de-datos-firestore.md` §3 auditoria event catalog — add `USUARIO_ACTUALIZADO` alongside `USUARIO_CREADO`/`USUARIO_DESACTIVADO`.
- [ ] 4.8 RED (per spec, negative/affirmative pair): `packages/functions/test/callables/actualizar-cajero.test.ts` — unauthenticated/cajero-caller rejected, admin-proceeds (**affirmative**), role-change-revokes-tokens (**affirmative**: complete object whose `rol` differs from stored → claims become `{rol:"admin",...}`, `revokeRefreshTokens` called), name-only-change-does-not-revoke (**negative counterpart**: complete object where ONLY `nombre` differs from stored → claims unchanged, `revokeRefreshTokens` NOT called), unknown-`uid` rejected `not-found`.
- [ ] 4.9 GREEN: create `packages/functions/src/callables/actualizar-cajero.ts` — `exigirAdmin` → `validar(actualizarCajeroSchema)` → read `usuarios/{uid}` (`not-found` if absent) → compare submitted `rol`/`sucursalesAsignadas` against stored → if either differs: `setCustomUserClaims({rol, sucursales})` (total overwrite) + `revokeRefreshTokens(uid)` → one Firestore tx: overwrite `nombre`/`rol`/`sucursalesAsignadas` on `usuarios/{uid}` + `registrarAuditoria(USUARIO_ACTUALIZADO, {campos: <actually changed keys>})`. The submitted object is complete, but the comparison against stored values is what gates revocation — a name-only edit must not force a re-login.
- [ ] 4.10 RED (per spec, negative/affirmative pair): `packages/functions/test/callables/desactivar-cajero.test.ts` — unauthenticated/cajero-caller rejected, admin-proceeds (**affirmative**), deactivation-revokes-active-session (**affirmative**: `disabled`, tokens revoked, `activo:false`, `USUARIO_DESACTIVADO` audited), unknown-`uid` rejected `not-found`, deactivating-open-session-participant-succeeds-participantes-unchanged (**affirmative**, spec "Deactivating a participant of an open session does not fail").
- [ ] 4.11 GREEN: create `packages/functions/src/callables/desactivar-cajero.ts` — `exigirAdmin` → `validar(desactivarCajeroSchema)` → `auth.updateUser(uid,{disabled:true})` → `auth.revokeRefreshTokens(uid)` → one Firestore tx: `usuarios/{uid}.activo=false` + `registrarAuditoria(USUARIO_DESACTIVADO)` per D-6 (profile written last; claims untouched — `disabled` + revoked tokens already deny everything).
- [ ] 4.12 Add export lines for `actualizarCajero`/`desactivarCajero` to `packages/functions/src/index.ts`.
- [ ] 4.13 Pre-close: `npm run typecheck && npm run lint && npm test`.
- [ ] 4.14 Commit (`feat(functions): implementa actualizarCajero y desactivarCajero con auditoría de modificación`).

## Slice 5 — `reconciliarLineas` (~300 lines, independent of 1–4)

- [ ] 5.1 RED (negative/affirmative pairs per `reconciliacion-lineas` spec): `packages/functions/test/scheduled/reconciliar-lineas.test.ts` — open-session-mismatch-corrected (**affirmative**), closed-session-never-touched (**negative counterpart**), matching-totals-untouched-no-op (**affirmative**), mismatched-totals-corrected (**negative counterpart**: asserts `cantidadTotal` AND `aplicados`/`versiones`/`numAportantes` all rewritten — D-5's "naive fix re-breaks" case), correction-audited-no-other-side-effect (**affirmative**, `RECONCILIACION` with `cantidadAnterior`/`cantidadNueva`), correction-marks-summary-dirty (**affirmative**, `dirty:true` + `marcaAportes` bump, I-M), rerun-after-correction-is-noop (**negative counterpart**: no second `RECONCILIACION` event, no second write).
- [ ] 5.2 GREEN: create `packages/functions/src/scheduled/reconciliar-lineas.ts` — `reconciliarLineasImpl(db)` per D-5: scope `sesiones` where `estado=="abierta"`; per línea one transaction (`tx.get(sesionRef)` re-check `"abierta"` else return, `tx.get(lineaRef)` + `tx.get(aportesCollection)`, `esperado = cantidadTotalDesdeAportes(aportes)` — reuse `calculadora.ts`, no new function — exact-equality compare; on mismatch: `tx.update(lineaRef, {cantidadTotal, aplicados, versiones, numAportantes, actualizadaEn, actualizadaPor:"reconciliacion"})` (full replacement, not `merge`) + `tx.update(sesionRef, {totalUnidades: increment(esperado-cantidadTotal)})` + `tx.set(resumenRef, {dirty:true, marcaAportes:increment(1)}, {merge:true})` (I-M) + `registrarAuditoria(RECONCILIACION)`); `onSchedule({schedule:"every monday 03:00", region:"us-central1"})`, no `timeZone`.
- [ ] 5.3 Add export line for `reconciliarLineas` to `packages/functions/src/index.ts`.
- [ ] 5.4 Doc correction: `docs/diseno/08-contratos-y-cloud-functions.md` §4 `reconciliarLineas` — document the `aplicados`/`versiones` rewrite, `totalUnidades` delta, and I-M re-mark (currently just says "corrige recalculando").
- [ ] 5.5 Doc correction: `docs/diseno/09-seguridad-y-auditoria.md` §5 "Detección de inconsistencias" — same completeness correction as 5.4.
- [ ] 5.6 Pre-close: `npm run typecheck && npm run lint && npm test`.
- [ ] 5.7 Commit (`feat(functions): implementa reconciliarLineas con reescritura completa de aplicados y versiones`).

---

## Not in scope (explicit)

- No `infra/firestore.rules` or `infra/firestore.indexes.json` change any slice (verified: all queries single-field, all writes via Admin SDK). `npm run test:rules` is not triggered.
- No on-demand recompute callable (OQ-1 resolution is cadence-only).
- No `apps/web` client work.
