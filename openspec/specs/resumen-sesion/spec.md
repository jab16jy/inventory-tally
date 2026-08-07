# Resumen Sesión Specification

## Purpose

Fixes the live defect at `on-aporte-escrito.ts:92`: `resumen/actual.dirty` is set but
never cleared, so `totalMonetario`, `totalUnidades`, and `porCategoria` are never
computed. Defines the `recalcularResumen(db, sesionId)` helper and its two callers:
the `recalcularResumenes` cron (every 30 s) and `cerrarSesion` (slice 2).

## Requirements

### Requirement: Cron scope is open sessions only

`recalcularResumenes` MUST only evaluate `sesiones` where `estado == "abierta"`.

#### Scenario: Open session is evaluated

- GIVEN a `SesionConteo` with `estado: "abierta"` and `resumen/actual.dirty: true`
- WHEN `recalcularResumenes` runs
- THEN the session's `resumen/actual` is recomputed

#### Scenario: Closed session is never touched

- GIVEN a `SesionConteo` with `estado: "cerrada"`
- WHEN `recalcularResumenes` runs
- THEN its `lineas`, `resumen/actual`, and `historicos` documents are neither read nor written

### Requirement: Non-dirty summaries are skipped

The cron MUST skip recomputation for a session whose `resumen/actual.dirty` is not
`true`, without querying `lineas` (doc 05 §5 cost control).

#### Scenario: Clean summary skipped

- GIVEN `resumen/actual.dirty == false`
- WHEN `recalcularResumenes` evaluates that session
- THEN no `lineas` query and no write to `resumen/actual` occurs

#### Scenario: Dirty summary is not skipped

- GIVEN `resumen/actual.dirty == true`
- WHEN `recalcularResumenes` evaluates that session
- THEN a `lineas` query MUST occur

### Requirement: Recomputation produces correct totals

`recalcularResumen` MUST compute `totalUnidades` as the sum of `cantidadTotal` across
`lineas`, `totalMonetario` as the sum of `cantidadTotal × valorUnitario` (reusing
`packages/shared/src/services/calculadora.ts`), and `porCategoria` with `cantidad`,
`subtotal`, and `actualizadaEn` per line.

#### Scenario: Totals match the seeded lineas

- GIVEN `lineas` with known `cantidadTotal` and `valorUnitario` per category
- WHEN `recalcularResumen(db, sesionId)` runs
- THEN `resumen/actual.totalUnidades` and `.totalMonetario` equal the values computed by `calculadora.ts` from the same `lineas`

### Requirement: `dirty` MUST NOT be cleared over a stale summary

The system MUST NOT persist `dirty: false` unless the written summary reflects every
`aporte` recorded for that session as of the moment `dirty` is cleared. The exact
mechanism (ordering, transaction, compare-and-clear) is a design decision; this is the
required outcome.

#### Scenario: No concurrent aporte — dirty clears correctly (affirmative)

- GIVEN no `aporte` is written to this session between the start and end of `recalcularResumen`
- WHEN it completes
- THEN `dirty` is `false` and the summary matches all `lineas`

#### Scenario: Concurrent aporte during recompute — dirty MUST NOT falsely clear (negative)

- GIVEN an `aporte` is written to this session's `lineas` after `recalcularResumen` begins reading `lineas` but before it finishes writing `resumen/actual`
- WHEN the write completes
- THEN either the persisted summary includes that `aporte`'s effect, or `dirty` remains/returns to `true` so a subsequent run recomputes it — the summary is never left `dirty: false` while excluding that `aporte`

### Requirement: `cerrarSesion` uses the helper synchronously, not the cron

`cerrarSesion` MUST invoke `recalcularResumen(db, sesionId)` directly and await its
completion before freezing the session; it MUST NOT rely on the 30 s cron cycle.

#### Scenario: Freeze reflects the final recompute

- GIVEN a session about to close with a `dirty` summary
- WHEN `cerrarSesion` runs
- THEN `recalcularResumen` executes and completes before the freeze transaction reads `resumen/actual`

## Non-goals

- RF-16 verification, the freeze transaction, and the `historicos` snapshot — see `cierre-sesion`.
- Inconsistency detection/correction of `lineas.cantidadTotal` against `aportes` — see `reconciliacion-lineas`.
- Authorization: `recalcularResumenes` is a scheduled function with no caller-supplied credentials; `exigirAdmin` does not apply to it. `cerrarSesion`'s authorization is specified in `cierre-sesion`.
