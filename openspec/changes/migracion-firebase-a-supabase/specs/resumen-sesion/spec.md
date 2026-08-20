# Delta for Resumen Sesión

`resumen` becomes `vista_resumen`, an admin-only view computed live from `lineas` ×
`categorias.valor` (#23 D6). H1 (closed decision): no consumer ever read
`resumen/actual` directly — the panel always recomputed client-side, and
`cerrarSesion` overwrote it — so the cron/`dirty`/`marcaAportes` machinery existed
only to keep a document nobody read consistent with itself.

## REMOVED Requirements

### Requirement: Cron scope is open sessions only

(Reason: #23 D6 — `resumen` is a view computed on read; there is no cron to scope.)
(Migration: None. See `esquema-postgres`, Requirement: `vista_resumen` and
`vista_historicos` are admin-only views.)

### Requirement: Non-dirty summaries are skipped

(Reason: no `dirty` flag exists on a view.)
(Migration: None.)

### Requirement: `dirty` MUST NOT be cleared over a stale summary

(Reason: a view has no persisted state to leave stale — every read recomputes from
current `lineas`, so the compare-and-clear race this requirement guarded against
cannot occur.)
(Migration: None.)

## MODIFIED Requirements

### Requirement: `vista_resumen` computes totals live, not via a persisted document

`vista_resumen` MUST compute `total_unidades` as the sum of `cantidad_total` across
`lineas`, `total_monetario` as the sum of `cantidad_total × categorias.valor`, and
expose one row per `categoria` with `cantidad` and `subtotal` — as a live `SELECT`,
never a stored, periodically-refreshed document.

(Previously: computed by a `recalcularResumen(db, sesionId)` helper invoked by a 30s
cron and by `cerrarSesion`, persisted to `resumen/actual`.)

#### Scenario: Totals match the current lineas (affirmative)

- GIVEN `lineas` with known `cantidad_total` per categoria and `categorias.valor`
- WHEN `vista_resumen` is queried for that sesion
- THEN `total_unidades` and `total_monetario` equal the values computed directly
  from `lineas` × `categorias.valor`

#### Scenario: A just-committed aporte is visible on the very next read (negative counterpart to the old staleness window)

- GIVEN an `aporte` INSERT just committed, updating `lineas` via the trigger
- WHEN `vista_resumen` is queried immediately after
- THEN it reflects that aporte — there is no polling delay and nothing to be stale

### Requirement: `cerrarSesion` reads the aggregation synchronously, within its own transaction

`cerrar_sesion` (a Postgres RPC — see `cierre-sesion`) MUST read the same
`lineas` × `categorias.valor` aggregation `vista_resumen` exposes, inside the same
transaction that sets `estado = 'cerrada'`. There is no separate helper function to
call and no cron cycle to depend on.

(Previously: invoked `recalcularResumen(db, sesionId)` directly and awaited its
completion before freezing.)

#### Scenario: Close reads the current aggregation with no concurrent-write window (affirmative)

- GIVEN a sesion about to close via `cerrar_sesion`
- WHEN the RPC runs
- THEN it reads the aggregation inside the same transaction that flips `estado`, so
  no concurrent `aporte` can land between the read and the freeze

## Non-goals

- RF-16 verification and the close's authorization/blocking logic — see
  `cierre-sesion`.
- `lineas`/`aportes` inconsistency detection — removed in full, see
  `reconciliacion-lineas`.
