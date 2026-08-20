# Tiempo Real Specification

## Purpose

Realtime topology per #25 (CLOSED D1-D5), verified against current Supabase
Realtime docs (`ctx7-supabase-realtime.md`).

## Requirements

### Requirement: `postgres_changes` is the only mechanism; `broadcast` is not used

All live updates MUST use `postgres_changes` subscriptions. The system MUST NOT use
`broadcast` (#25 D1 — it would require hand-authorizing `realtime.messages` and an
emitting trigger, for no benefit at this scale).

#### Scenario: A subscribed client receives an INSERT event without any broadcast code existing (affirmative)

- GIVEN a client subscribed to `lineas` changes for its sesion
- WHEN a matching `aportes` INSERT updates `lineas`
- THEN the client receives a `postgres_changes` event, with no `realtime.messages` row ever written

### Requirement: Channel topology is one channel per screen

Exactly the following channels MUST exist: conteo (cajero) —`lineas`+`aportes` own;
cierre/sincronización (admin) — `sesion_participantes`; dashboard admin —
`sesiones`+`lineas`; catálogos — `sucursales`+`categorias`+`perfiles` (#25 D2 — ~12
Firestore listeners collapse to 4-5 channels).

#### Scenario: The conteo screen opens exactly one channel (affirmative)

- GIVEN a cajero opens the conteo screen
- WHEN its subscriptions are inspected
- THEN exactly one channel exists, multiplexing `.on('postgres_changes', ...)` for both `lineas` and `aportes`

### Requirement: `observarSucursales` uses one unfiltered channel, relying on RLS

The client MUST subscribe to `sucursales` with no per-row filter and no N-listeners-
per-document pattern (#25 D3 — abandons Firestore's F3-A workaround; RLS already
scopes the rows returned).

#### Scenario: A cajero's single channel only surfaces authorized sucursales (affirmative, ties to RLS)

- GIVEN a cajero authorized for 1 of 3 sucursales
- WHEN their unfiltered `sucursales` channel receives a change event for any of the 3
- THEN they only receive events for the sucursal `private.tiene_sucursal()` authorizes

### Requirement: `sesion_participantes.nombre` is denormalized, not joined

`nombre` MUST be written to `sesion_participantes` at INSERT time and read from that
column by Realtime consumers — `postgres_changes` payloads carry no join (#25 D4).

#### Scenario: A participant's payload includes nombre with no separate perfiles query (affirmative)

- GIVEN a `sesion_participantes` change event
- WHEN the admin dashboard consumes it
- THEN `nombre` is present in the payload directly, without an additional `perfiles` fetch

### Requirement: The own-aporte channel is fixed per session, not per open category

A cajero's own-aporte subscription MUST filter `sesion_id=eq.X` for the whole
session, not open/close per visible categoria (#25 D5).

#### Scenario: Switching categorias within a session does not reopen the channel (affirmative)

- GIVEN a cajero navigating between categorias within one open sesion
- WHEN they switch categorias
- THEN the existing `sesion_id`-filtered channel remains open — no new channel is opened or closed

### Requirement: RLS is enforced automatically on `postgres_changes`, no extra authorization code

The system MUST NOT reimplement row-level authorization for Realtime — Supabase
applies the same RLS policies to the replication stream
(`ctx7-supabase-realtime.md:67-71`; #25 H1).

#### Scenario: An unauthorized client receives no event for a row it cannot SELECT (affirmative)

- GIVEN a cajero not authorized for `suc_sur`
- WHEN a `sesiones` row for `suc_sur` changes
- THEN that client's `sesiones` channel receives no event for it

#### Scenario: An authorized client receives the event (negative counterpart, proves RLS isn't over-filtering)

- GIVEN the same cajero, authorized for `suc_norte`
- WHEN a `sesiones` row for `suc_norte` changes
- THEN they receive the event

### Requirement: DELETE payloads degrade to PK-only under RLS; no consumer depends on non-PK old values

No client-side logic MUST depend on non-primary-key columns of a `DELETE` event's
`old_record` — Supabase confirms RLS restricts `old_record` to PK-only columns even
with `REPLICA IDENTITY FULL` (`ctx7-supabase-realtime.md:45-65`; this is stricter
than #25 H4's framing "RLS does not apply to DELETE" — RLS does apply, it degrades
the payload rather than skipping the event).

#### Scenario: No hard-delete path relies on old_record's non-PK fields (affirmative — this migration has none)

- GIVEN the tables in `supabase_realtime` (`lineas`, `sesiones`, `sesion_participantes`, `perfiles`, `sucursales`, `categorias`)
- WHEN their consumers are inspected
- THEN none reads a `DELETE` event's `old_record` beyond its primary key — `purgarAuditoria` (the only hard-delete) targets `auditoria`, which is never published

## Non-goals

- The pending-per-participant replacement signal itself — see `esquema-postgres`,
  Requirement: Per-participant pending signal survives.
- Local write queue — see `cola-pendientes-offline`.
