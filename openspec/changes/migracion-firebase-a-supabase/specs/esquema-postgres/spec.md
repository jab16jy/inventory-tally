# Esquema Postgres Specification

## Purpose

The consolidated Postgres data model replacing Firestore, per #23 (CLOSED) D1-D9,
plus the `versiones[uid]` behavioral addendum (carve-out A — no closed ticket owns
it). Realtime publication membership follows #23 H3 (`postgres_changes` accepts
tables only, `ctx7-supabase-realtime.md:3-15`).

## Requirements

### Requirement: Money is separated by object, not column GRANT

Line-item quantities (`lineas`) and monetary aggregates (`vista_resumen`) MUST live
in separate database objects. The system MUST NOT collapse them into one table with
money hidden behind a column `GRANT` (#23 D1).

#### Scenario: lineas carries no monetary column (affirmative)

- GIVEN the `lineas` table schema
- WHEN it is inspected
- THEN no monetary column exists — money exists only in `vista_resumen`

### Requirement: `lineas` is a real table maintained by a synchronous trigger

`lineas` MUST be a table, updated by an `AFTER INSERT OR UPDATE ON aportes` trigger
running in the same transaction as the write. `version`, `versiones`, `aplicados`,
and the `retry` guard from `packages/functions/src/triggers/on-aporte-escrito.ts:54-60`
MUST NOT exist in the new schema (#23 D2 — Firestore idempotency plumbing only).
`num_aportantes` MUST survive as a trigger-maintained aggregate column, never
client-writable state — `packages/shared/src/services/riesgo.ts:19`'s
`promedioCategoria` still consumes it (`design.md` D-1).

#### Scenario: Aporte insert updates lineas in the same transaction (affirmative)

- GIVEN an open sesion with an existing `linea` row for a categoria
- WHEN a client INSERTs into `aportes` for that `(sesion_id, categoria_id, uid)`
- THEN `lineas.cantidad_total` reflects the new sum before that transaction commits

#### Scenario: num_aportantes updates via the same trigger (affirmative)

- GIVEN a `linea` with `num_aportantes = 3`
- WHEN a new `aporte` from a new `uid` is inserted for that categoria
- THEN `num_aportantes` becomes `4` in the same transaction — computed by the
  trigger, never written by the client

#### Scenario: lineas has no client-writable path (negative counterpart)

- GIVEN any authenticated client
- WHEN they attempt a direct UPDATE on `lineas`
- THEN it is rejected — only the trigger (table owner) writes `lineas`
  (see `autorizacion-supabase`, Requirement: GRANT decides the verb)

### Requirement: `perfiles` is FK-backed to `auth.users`

`perfiles.id` MUST be a `uuid` foreign key to `auth.users(id)`. `perfil_sucursales`
MUST be a join table with a real foreign key to `sucursales`, not a JSONB array
(#23 D3).

#### Scenario: Assigning a nonexistent sucursal fails referential integrity (affirmative)

- GIVEN an INSERT into `perfil_sucursales (perfil_id, sucursal_id)`
- WHEN `sucursal_id` does not exist in `sucursales`
- THEN the insert fails on the foreign key constraint

### Requirement: IDs are mixed by table stability

`sucursales.id`/`categorias.id` MUST be `text` slugs; `sesiones.id` MUST be `uuid`.
The Firestore `ses_{fecha}_{sucursal}_{corr}` pattern MUST NOT be reproduced —
`abierta_en` and `sucursal_id` are real columns (#23 D4).

#### Scenario: Two same-day sesiones for different sucursales get distinct uuids (affirmative)

- GIVEN two `abrirSesion` calls for `suc_norte` and `suc_sur` on the same date
- WHEN both succeed
- THEN each `sesiones.id` is a distinct `uuid` with no encoded date/sucursal

### Requirement: `auditoria` uses indexed columns plus a JSONB detail

`auditoria` MUST expose `tipo`, `sucursal_id`, `usuario_id`, `sesion_id`,
`ocurrido_en` as real columns; all event-specific fields go in `detalle jsonb`,
never filtered on (#23 D5).

#### Scenario: Query by sucursal and date range uses an indexed column (affirmative)

- GIVEN 12 distinct `tipo` values in `auditoria`
- WHEN a query filters `WHERE sucursal_id = X AND ocurrido_en BETWEEN a AND b`
- THEN it resolves via the composite index, not a JSONB scan

### Requirement: `vista_resumen` and `vista_historicos` are admin-only views

`resumen`/`historicos` MUST be views, not tables (#23 D6/D7). `vista_resumen`
aggregates `lineas` × `categorias.valor` live; `vista_historicos` is
`DISTINCT ON (sucursal_id) ... ORDER BY cerrada_en DESC` over closed `sesiones`,
replacing the N+1 fan-out of `AdminRepository.ultimoHistoricoPorSucursal`.

#### Scenario: vista_historicos returns one row per sucursal in one query (affirmative)

- GIVEN 3 closed sesiones for `suc_norte` and 1 for `suc_sur`
- WHEN `vista_historicos` is queried
- THEN it returns exactly 2 rows, each the most recently closed per sucursal

### Requirement: One open sesion per sucursal, enforced by a partial unique index

`CREATE UNIQUE INDEX ON sesiones (sucursal_id) WHERE estado = 'abierta'` MUST
exist. `sucursales.sesion_abierta_id` MUST NOT exist (#23 D8).

#### Scenario: Second concurrent open attempt fails at the index (affirmative)

- GIVEN `suc_norte` already has an `abierta` sesion
- WHEN a second `abrirSesion` targets `suc_norte`
- THEN the INSERT violates the partial unique index and the RPC errors, with no
  compensation logic required

### Requirement: `sesion_participantes` is one row per participant

`sesion_participantes` MUST have a `(sesion_id, uid)` primary key, replacing the
nested-map `sincronizacion/estado.participantes{uid}` (#23 D9).

#### Scenario: Each participant's confirmation is an independent row (affirmative)

- GIVEN two participants in the same sesion
- WHEN one confirms via `confirmado_en`
- THEN only that participant's row changes

### Requirement: Realtime publication includes only UI-observed tables

`supabase_realtime` MUST include exactly `lineas`, `sesiones`,
`sesion_participantes`, `perfiles`, `sucursales`, `categorias`, `aportes` — no
more, no less. `aportes` is required by the own-aporte channel (#25 D5;
`tiempo-real`, Requirement: The own-aporte channel is fixed per session; `design.md`
D-3) — #23's earlier publication list predates that decision and is superseded
here.

#### Scenario: auditoria is never published (negative — admin-only, never live)

- GIVEN the `supabase_realtime` publication
- WHEN table membership is inspected
- THEN `auditoria` is absent

#### Scenario: aportes is published, enabling the own-aporte channel (affirmative)

- GIVEN the `supabase_realtime` publication
- WHEN table membership is inspected
- THEN `aportes` is present

### Requirement: Per-participant pending signal survives (carve-out A addendum)

The system MUST provide, per `(sesion_id, categoria_id, uid)`, an observable signal
answering "has this participant's contribution for this categoria reached the
server" — replacing the deleted `lineas.versiones[uid]` map. #23 D2 deletes it as
idempotency plumbing; it was also the sole source for four live behaviors no closed
ticket owns. The signal MUST be derivable from `aportes` (keyed
`(sesion_id, categoria_id, uid)`), the own-aporte Realtime channel
(`tiempo-real`), and/or the local queue (`cola-pendientes-offline`) —
**`sdd-design` MUST justify any new column against these three before adding one;
none is presumed here.**

Behaviors that MUST be preserved exactly: `estaPendiente` ("sólo pendientes"
filter, `packages/shared/src/services/progreso.ts:18-19`), `siguientePendiente`
(keyboard auto-advance, `progreso.ts:30-40`), the progress bar count
(`apps/web/src/ui/primitivos/BarraProgreso.tsx:5`), and `aporteConfirmado` (RF-16
cross-device confirmation, `packages/shared/src/services/sincronizacion.ts:18-21`).

#### Scenario: A category with no aporte from this uid is pending (affirmative)

- GIVEN a `linea` with no `aporte` row for `uid_ana`
- WHEN `estaPendiente(linea, uid_ana)` is evaluated
- THEN it returns `true`

#### Scenario: A category with a server-confirmed aporte is not pending (negative counterpart)

- GIVEN an `aporte` row for `(sesion_id, categoria_id, uid_ana)` has reached the server
- WHEN `estaPendiente(linea, uid_ana)` is evaluated
- THEN it returns `false`

#### Scenario: Cross-device confirmation reflects the server, not a stale local value (affirmative, RF-16)

- GIVEN `uid_ana` submitted an aporte from device A that reached the server
- WHEN device B (same uid) evaluates `aporteConfirmado` for that categoria
- THEN it observes the server-confirmed state, not device A's local optimistic value

## Non-goals

- RLS/GRANT text for these tables — see `autorizacion-supabase`.
- RPC/trigger/Edge Function bodies — see `operaciones-servidor`.
- Channel topology — see `tiempo-real`.
