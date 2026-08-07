# Reconciliación Líneas Specification

## Purpose

`reconciliarLineas` — weekly cron. `aportes` are the source of truth (doc 08 §4); a
mismatch between a `linea.cantidadTotal` and the real sum of its `aportes` indicates a
failed trigger. Corrects the total and leaves a `RECONCILIACION` audit trail.

## Requirements

### Requirement: Scope is open sessions only

`reconciliarLineas` MUST only scan `sesiones` where `estado == "abierta"`. A session
with its `sucursales/{id}/historicos/{sesionId}` snapshot already written (i.e.,
frozen) MUST NEVER be read or mutated by this cron.

#### Scenario: Open session with a seeded mismatch is corrected (affirmative)

- GIVEN an open session's `linea.cantidadTotal == 50` but its `aportes` sum to `53`
- WHEN `reconciliarLineas` runs
- THEN that `linea` is included in the scan and corrected

#### Scenario: Closed session is never touched (negative counterpart)

- GIVEN a closed session (`estado: "cerrada"`, `historicos/{sesionId}` exists) with the same kind of manufactured mismatch in one of its `lineas`
- WHEN `reconciliarLineas` runs
- THEN that session's `lineas`, `resumen`, and `historicos` documents are neither read nor written, and the mismatch remains uncorrected

### Requirement: Inconsistency detection compares aportes-derived total to the stored total

For each `linea`, the system MUST recompute the sum of `cantidad` across its `aportes`
subcollection and compare it to `lineas/{categoriaId}.cantidadTotal`.

#### Scenario: Matching totals are left untouched (affirmative)

- GIVEN `linea.cantidadTotal` equals the sum of its `aportes`
- WHEN `reconciliarLineas` evaluates that `linea`
- THEN no write occurs and no `RECONCILIACION` event is created

#### Scenario: Mismatched totals are corrected (negative counterpart)

- GIVEN `linea.cantidadTotal` differs from the sum of its `aportes`
- WHEN `reconciliarLineas` evaluates that `linea`
- THEN `cantidadTotal` is set to the aportes-derived sum

### Requirement: Every correction writes a `RECONCILIACION` audit event, no admin alert

A correction MUST write a `RECONCILIACION` audit event (per doc 04 §3's event
catalog) recording `sesionId`, `categoriaId`, the previous and corrected
`cantidadTotal`. Correcting a line MUST NOT trigger any admin-facing alert or
notification beyond that audit record.

#### Scenario: Correction is audited (affirmative)

- GIVEN a corrected `linea` (50 → 53)
- WHEN the correction is written
- THEN a `RECONCILIACION` event exists with `cantidadAnterior: 50` and `cantidadNueva: 53` (or equivalent field names) and no other side effect

### Requirement: A correction marks the summary dirty again

Because `resumen/actual` is derived from `lineas`, correcting a `linea.cantidadTotal`
MUST mark `resumen/actual.dirty = true` so the next `recalcularResumenes` cycle picks
up the corrected value.

#### Scenario: Corrected line dirties the summary

- GIVEN `resumen/actual.dirty == false` before a correction
- WHEN `reconciliarLineas` corrects one of that session's `lineas`
- THEN `resumen/actual.dirty` becomes `true`

### Requirement: Re-running after a correction is a no-op

Running `reconciliarLineas` again with no new `aportes` since the last correction MUST
NOT write a second `RECONCILIACION` event or change `cantidadTotal` again.

#### Scenario: Second run after correction changes nothing (negative counterpart to correction scenario)

- GIVEN a `linea` was just corrected and no `aporte` has been written since
- WHEN `reconciliarLineas` runs again
- THEN no write and no new `RECONCILIACION` event occur for that `linea`

## Non-goals

- Closed/frozen session mutation of any kind.
- `purgarAuditoria` — separate future SDD change.
- Authorization: `reconciliarLineas` is a scheduled function with no caller-supplied credentials; `exigirAdmin` does not apply.
