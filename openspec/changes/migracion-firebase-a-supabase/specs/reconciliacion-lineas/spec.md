# Delta for Reconciliación Líneas

`lineas` is now maintained by a synchronous Postgres trigger (see `esquema-postgres`,
Requirement: `lineas` is a real table maintained by a synchronous trigger). #23 D2:
a trigger running inside the same transaction as the `aportes` INSERT cannot
desynchronize from its source — the at-least-once/out-of-order problem this
capability existed to correct is a Firestore-specific defect that does not exist in
Postgres. This capability is **removed in full**.

## REMOVED Requirements

### Requirement: Scope is open sessions only

(Reason: #23 D2 — no drift is possible with a synchronous trigger; there is nothing
to scan.)
(Migration: None. See `esquema-postgres`.)

### Requirement: Inconsistency detection compares aportes-derived total to the stored total

(Reason: same synchronous-trigger guarantee.)
(Migration: None.)

### Requirement: Every correction writes a RECONCILIACION audit event, no admin alert

(Reason: no correction path exists, so no such event is ever written.)
(Migration: None — the `RECONCILIACION` event type is simply absent from the
migrated audit catalog.)

### Requirement: A correction marks the summary dirty again

(Reason: `resumen` becomes a view with no `dirty` flag — see `resumen-sesion`
delta.)
(Migration: None.)

### Requirement: Re-running after a correction is a no-op

(Reason: no correction path exists to re-run.)
(Migration: None.)

## ADDED Requirements

### Requirement: No reconciliation mechanism exists in the migrated schema

Because `lineas` cannot drift from `aportes` under a synchronous trigger (#23 D2),
the system MUST NOT define any scheduled job, RPC, or trigger function whose purpose
is reconciling `lineas.cantidad_total` against `aportes`.

#### Scenario: No reconciliation job is scheduled (affirmative)

- GIVEN the `cron.job` table (`pg_cron`) after migration
- WHEN it is inspected
- THEN no job references `lineas` reconciliation

#### Scenario: A manufactured mismatch is structurally impossible (negative counterpart — proves the deletion is safe, not just absent)

- GIVEN any sequence of `aportes` INSERTs within one sesion
- WHEN `lineas.cantidad_total` is compared to `SUM(aportes.cantidad)` for that
  `(sesion_id, categoria_id)`
- THEN they are always equal — the trigger computing `cantidad_total` runs in the
  same transaction as the INSERT, so no window for divergence exists
