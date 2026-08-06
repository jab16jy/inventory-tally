# Exploration — complete-cloud-functions

Phase: `sdd-explore` · Change: `complete-cloud-functions` · Store: `hybrid`
Engram topic key: `sdd/complete-cloud-functions/explore`

## A. Corrected gap inventory

`docs/diseno/08-contratos-y-cloud-functions.md` §2 specifies 9 Cloud Functions.
Verified against `packages/functions/src/` — **2 of 9 are implemented**. The audit
claim is confirmed.

| #   | Function              | Implementation                  | Zod contract                               |
| --- | --------------------- | ------------------------------- | ------------------------------------------ |
| 1   | `abrirSesion`         | `callables/abrir-sesion.ts`     | `contracts/schemas/abrir-sesion.schema.ts` |
| 2   | `onAporteEscrito`     | `triggers/on-aporte-escrito.ts` | n/a (trigger)                              |
| 3   | `cerrarSesion`        | **missing**                     | exists, unconsumed                         |
| 4   | `crearCajero`         | **missing**                     | exists, unconsumed                         |
| 5   | `actualizarCajero`    | **missing**                     | **missing**                                |
| 6   | `desactivarCajero`    | **missing**                     | **missing**                                |
| 7   | `recalcularResumenes` | **missing**                     | **missing**                                |
| 8   | `reconciliarLineas`   | **missing**                     | **missing**                                |
| 9   | `purgarAuditoria`     | **missing**                     | **missing**                                |

Correction to the initial audit: **3** zod contracts exist, not 2. `cerrar-sesion.schema.ts`
and `crear-cajero.schema.ts` are written and unit-tested but have no consumer — neither a
function implementation nor a client call site in `apps/web` or `packages/data`.

Whole implemented surface of `packages/functions/src`:

```
callables/abrir-sesion.ts
triggers/on-aporte-escrito.ts
lib/auditoria.ts
lib/exigir-admin.ts
lib/validar.ts
index.ts
```

## B. The `dirty` flag defect (confirmed at line level)

`packages/functions/src/triggers/on-aporte-escrito.ts:92`:

```ts
// El resumen monetario se recalcula agrupado (doc 05 §5): el trigger
// sólo marca la bandera, nunca escribe `resumen` directamente.
tx.set(resumenRef, { dirty: true }, { merge: true });
```

A repo-wide search for `dirty` across all `.ts` files returns exactly **one** hit — this
line. Nothing reads the flag, nothing clears it, and no code anywhere computes
`totalMonetario`, `totalUnidades`, or `porCategoria` on `sesiones/{id}/resumen/actual`.

Consequence: from the first `aporte` of every session onward, the summary document is
permanently `dirty` and the admin's monetary figures are never computed. This is a live
defect in shipped code, not merely a missing feature — it is the urgency driver for the
whole change.

## C. Dependency graph between the 7 missing functions

**HARD** — B cannot be correct without A:

- `cerrarSesion` → `recalcularResumen(db, sesionId)` **helper**. The doc-08 pseudocode has
  `cerrarSesion` recompute the summary inline rather than waiting for the cron, because the
  `historicos/{sesionId}` snapshot must be correct at the instant of freezing. The hard
  dependency is on the extracted helper, **not** on the deployed cron. This is the single
  most load-bearing finding for ordering.

**SOFT** — convenience or shared pattern only:

- `actualizarCajero` / `desactivarCajero` → `crearCajero`. No runtime dependency: tests can
  seed Auth users directly, mirroring how `abrir-sesion.test.ts` seeds `sucursales`. They do
  share the custom-claims and token-revocation pattern, so landing `crearCajero` first
  removes duplicated discovery work.
- The three crons share only the `onSchedule` export pattern; the first one to land
  establishes the wiring for the rest. No functional coupling between them.

**Outlier**: `purgarAuditoria` has zero prior art in the repo for Cloud Storage export, and
no design document specifies the export format.

## D. Shared infrastructure that must land first

- A `recalcularResumen` helper — reuses `packages/shared/src/services/calculadora.ts`, which
  already exports `subtotal`, `cantidadTotalDesdeAportes`, `totalUnidadesSesion`, and
  `totalMonetarioSesion`. `LineaConteo` field names match the Firestore `lineas` schema
  exactly, so no adapter layer is needed.
- `onSchedule` export wiring in `packages/functions/src/index.ts` — no scheduled function
  exists yet.
- Cloud Storage emulator wiring in `infra/firebase.json` — required only by
  `purgarAuditoria`; the current functions test script starts only `firestore,auth`.
- No new Firestore indexes are required for `recalcularResumenes`.

Testing convention already established in the repo: Cloud Function core logic is tested as
a plain async function (`abrirSesionImpl`, `procesarAporteEscrito`) against the
firestore/auth emulators, not through the functions emulator. New work follows this.

## E. Recommended implementation order and cut points

Delivery strategy `auto-chain`, budget 400 changed lines per PR (tests included).
Estimates calibrated against the real end-to-end size of the two existing functions:
`abrirSesion` ≈233 lines, `onAporteEscrito` ≈321 lines.

| Slice | Content                                                 | Est. lines | Rationale                                                                             |
| ----- | ------------------------------------------------------- | ---------- | ------------------------------------------------------------------------------------- |
| 1     | `recalcularResumen` helper + `recalcularResumenes` cron | ~350       | Fixes a live defect; hard prerequisite for slice 2                                    |
| 2     | `cerrarSesion`                                          | ~400       | Contract ready; hard-depends on slice 1's helper. At budget — flag for possible split |
| 3     | `crearCajero`                                           | ~290       | Contract ready; fully independent                                                     |
| 4     | `actualizarCajero` + `desactivarCajero`                 | ~390       | Share the claims/revoke pattern from slice 3; need new contracts                      |
| 5     | `reconciliarLineas`                                     | ~300       | Independent; needs query-scope decision                                               |
| 6     | `purgarAuditoria`                                       | ~350–450+  | Gated on design decisions; recommend a separate SDD change                            |

## F. Risks and open questions for the proposal phase

1. `purgarAuditoria` export format (CSV / NDJSON / native Firestore export) is undefined in
   every design document. Blocks sizing and correctness.
2. Testing `purgarAuditoria` requires a Storage emulator not wired into `infra/firebase.json`
   or the functions test script.
3. `reconciliarLineas` query scope is undocumented — all sessions, only closed ones, or a
   collection-group scan over all `aportes`? Affects both correctness and Firestore cost.
4. Slice 2 (`cerrarSesion`) sits exactly at the 400-line budget; `sdd-tasks` should receive
   "chained PRs recommended: Yes".
5. RF-16 synchronization verification in `cerrarSesion` depends on the sync trail written by
   `onAporteEscrito`; the exact staleness tolerance is not specified.

## Ready for proposal

Yes for slices 1–5. `purgarAuditoria` (slice 6) should be carved out into its own SDD change
once its export format and test infrastructure are decided.
