# Proposal — complete-cloud-functions

Phase: `sdd-propose` · Store: `hybrid` · Engram: `sdd/complete-cloud-functions/proposal`

## Intent

`on-aporte-escrito.ts:92` sets `dirty: true` on `sesiones/{id}/resumen/actual`. Nothing
reads it, clears it, or computes `totalMonetario` / `totalUnidades` / `porCategoria`.
**Every session's admin monetary summary is permanently uncomputed** — a live defect in
shipped code, not a missing feature. The admin sees no money figure, ever.

Why now: 7 of 9 functions in doc 08 §2 are missing. Without them the admin cannot close a
session (RF-12/RF-16), cannot create or manage cajeros (RF-02), and inconsistent totals
from a failed trigger are never detected or corrected.

## Scope

| #   | Slice                                                          | Est. | Note                                      |
| --- | -------------------------------------------------------------- | ---- | ----------------------------------------- |
| 1   | `recalcularResumen` helper + `recalcularResumenes` cron (30 s) | ~350 | Fixes the defect; hard prerequisite for 2 |
| 2   | `cerrarSesion`                                                 | ~400 | Contract exists; AT budget                |
| 3   | `crearCajero`                                                  | ~290 | Contract exists                           |
| 4   | `actualizarCajero` + `desactivarCajero`                        | ~390 | Need new zod contracts + co-located tests |
| 5   | `reconciliarLineas` (weekly cron)                              | ~300 | Open sessions only                        |

**Ordering is load-bearing**: `cerrarSesion` hard-depends on the extracted
`recalcularResumen(db, sesionId)` **helper**, not on the deployed cron. Doc 08 recomputes
inline before freezing because the `sucursales/{id}/historicos/{sesionId}` snapshot must be
correct at the instant of the freeze; a 30 s cron cannot guarantee that. Cron and
`cerrarSesion` are two callers of one helper. Slices 3–5 are independent (shared pattern only).

### Non-goals

- `purgarAuditoria` — separate future SDD change (export format undefined in every design
  doc; needs a Storage emulator not wired into `infra/firebase.json`).
- Mutating frozen sessions: `reconciliarLineas` scans **open sessions only**. A session with
  its `historicos` snapshot written is never touched by a cron.
- Any `apps/web` client work. Server side only.

## Constraints

- **RF-16 blocks by default with explicit admin override.** Reject the close naming the
  unsynchronized participants; `forzar` allows it. Every forced close is audited
  (`SESION_CERRADA` with `forzado: true` + the `sinConfirmar` list; blocked attempts as
  `CIERRE_BLOQUEADO`).
- Reuse only: `packages/shared/src/services/calculadora.ts` (field names already match the
  `lineas` schema — no adapter), `lib/auditoria.ts`, `lib/validar.ts`, `lib/exigir-admin.ts`.
  New abstractions must justify why these cannot carry the work.
- `HttpsError` codes per doc 08 §3; trigger idempotency via `version`; Node 22; region
  `us-central1`; zod contracts in `contracts/schemas/` with co-located `.test.ts`.
- Tests run core logic as plain async functions against the firestore+auth emulators:
  `firebase emulators:exec --config ../../infra/firebase.json --project demo-conteo-eficiente --only firestore,auth "vitest run"`.

## Capabilities

### New

- `resumen-sesion`: monetary/unit summary recomputation, `dirty` lifecycle, cron cadence.
- `cierre-sesion`: RF-16 verification, override policy, RF-12 freeze + historical snapshot.
- `gestion-cajeros`: create / update / deactivate, custom claims, token revocation (RF-02).
- `reconciliacion-lineas`: inconsistency detection and correction, `RECONCILIACION` audit.

### Modified

- None. `openspec/specs/` is empty.

## Approach

Extract `recalcularResumen(db, sesionId)` as the single computation path, then wire the two
callers (cron, `cerrarSesion`). Everything else follows the established shape of
`abrir-sesion.ts`: `exigirAdmin` → `validar` → transaction → `registrarAuditoria`.

## Affected areas

| Area                                               | Impact   | What                                                                      |
| -------------------------------------------------- | -------- | ------------------------------------------------------------------------- |
| `packages/functions/src/lib/recalcular-resumen.ts` | New      | Shared computation                                                        |
| `packages/functions/src/scheduled/`                | New      | `recalcularResumenes`, `reconciliarLineas`                                |
| `packages/functions/src/callables/`                | New      | `cerrar-sesion`, `crear-cajero`, `actualizar-cajero`, `desactivar-cajero` |
| `contracts/schemas/`                               | New      | `actualizar-cajero`, `desactivar-cajero` + tests                          |
| `packages/functions/src/index.ts`                  | Modified | Exports (first `onSchedule` wiring)                                       |

## Open questions for `sdd-design`

1. **RF-16 predicate.** `cerrar-sesion.schema.ts` **already carries `forzar`** — verified, no
   contract change needed. But doc 08 only tests `confirmadoEn` truthiness, while
   `onAporteEscrito` also writes `ultimoAporteServidor`. Is a participant with
   `ultimoAporteServidor > confirmadoEn` (confirmed, then contributed again) synchronized?
   Is there a staleness tolerance? Undefined.
2. **`reconciliarLineas` inconsistency rule.** What counts as inconsistent (exact mismatch vs.
   tolerance), what it writes to correct (`cantidadTotal` only? `actualizadaEn`?), whether it
   also clears/sets `dirty`, and the `RECONCILIACION` event payload shape.
3. **`recalcularResumen` transactionality.** Doc 08's cron reads `lineas` then writes outside a
   transaction. Concurrent `aportes` during the read window can produce a stale summary marked
   `dirty: false`. Needs an explicit ordering rule (read `dirty` marker before `lineas`, or
   compare-and-clear).
4. **`desactivarCajero` and open sessions.** Deactivating a participant of an open session
   leaves them in `participantes` and unable to confirm sync — interacts directly with the
   RF-16 block. Policy undefined.

## Risks

| Risk                                                  | Likelihood | Mitigation                                                                                                             |
| ----------------------------------------------------- | ---------- | ---------------------------------------------------------------------------------------------------------------------- |
| Slice 2 sits exactly at the 400-line budget           | High       | `sdd-tasks` must forecast `Chained PRs recommended: Yes` and pre-plan a split (RF-16 verification vs. freeze+snapshot) |
| 30 s cron on open sessions raises Firestore read cost | Low        | Cron skips non-`dirty` summaries on the first query (doc 08 §4)                                                        |
| Q3 race writes a stale summary and clears `dirty`     | Med        | Resolve in design before slice 1 — it is the defect being fixed                                                        |
| Custom-claim propagation lag (~1 h) after slice 4     | Med        | `revokeRefreshTokens` + client `idTokenChanges` per doc 08 §3                                                          |

## Delivery

`auto-chain`, 400 changed lines per PR. Total ≈1730 lines across 5 slices — **chained PRs are
expected, not a contingency**. `chain_strategy` is not yet collected. Strict TDD and RDD gate
every commit; conventional commits in Spanish, no AI attribution.

## Rollback

Each slice is a separate PR with an isolated rollback: revert the PR and redeploy. Slices 3–5
add new functions only — reverting removes capability without touching existing behavior.
Slice 1 restores the current (defective) state. Slice 2 must be reverted before slice 1;
after it, `cerrarSesion` loses its computation path. No schema migration, no data backfill.

## Success criteria

- [ ] No session's `resumen/actual` stays `dirty: true` for more than one cron cycle.
- [ ] `totalMonetario`, `totalUnidades` and `porCategoria` are populated for every open session.
- [ ] `cerrarSesion` rejects a close with unsynchronized participants and names them; `forzar`
      overrides it and the forced close plus the `sinConfirmar` list is in `auditoria`.
- [ ] `sucursales/{id}/historicos/{sesionId}` matches the summary at the instant of the freeze.
- [ ] The admin can create, update and deactivate a cajero; deactivation revokes tokens.
- [ ] `reconciliarLineas` detects a seeded inconsistency in an open session, corrects it, and
      writes a `RECONCILIACION` event — and leaves closed sessions untouched.
- [ ] Every slice: `npm run typecheck && npm run lint && npm test` green.
