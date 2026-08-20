# Operaciones Servidor Specification

## Purpose

Server-side operation surface per #27 (CLOSED D1-D7): one Edge Function (3 ops),
three `SECURITY DEFINER` RPCs, four direct PostgREST writes, audit triggers, and one
`pg_cron` job. `packages/functions/src/**` measures **1292 lines / 20 files**
(re-measured; #27's own text says "1143 líneas") — of it, only the Edge Function's
three user-management operations survive; everything else becomes schema.

## Requirements

### Requirement: The Edge Function verifies the caller's role via their own row, not the request payload

The Edge Function MUST build a client scoped to the caller's JWT and execute
`select rol from perfiles where id = auth.uid()` under RLS before doing anything
else. Only if that row's `rol = 'admin'` does it construct a second client with
`service_role` (#27 D7). It MUST NOT trust any admin flag supplied by the caller.

#### Scenario: Admin caller's own-row check passes and unlocks service_role (affirmative)

- GIVEN a caller whose own `perfiles.rol = 'admin'`
- WHEN the Edge Function runs
- THEN the own-row SELECT (RLS-scoped) returns `'admin'` and a `service_role` client is constructed

#### Scenario: Cajero caller's own-row check blocks service_role use (negative counterpart)

- GIVEN a caller whose own `perfiles.rol = 'cajero'`
- WHEN the Edge Function runs
- THEN the own-row SELECT returns `'cajero'` and the function returns an error before any `service_role` call

### Requirement: The Edge Function covers exactly the three operations requiring `service_role`

`crearCajero`, `desactivarCajero`, `reactivarCajero` MUST be the Edge Function's
operations — the only ones needing `auth.admin.*` (#27 D1, H2). No other operation
MUST be added to it without a documented `service_role` requirement.

#### Scenario: crearCajero routes through the Edge Function (affirmative)

- GIVEN a client invoking `supabase.functions.invoke('gestion-cajeros', { op: 'crearCajero', ... })`
- WHEN it executes
- THEN it is the only surface calling `auth.admin.createUser`

### Requirement: RPCs cover multi-table transactions without `service_role`

`abrirSesion`, `cerrarSesion`, `actualizarCajero` MUST be Postgres RPCs
(`SECURITY DEFINER`, owner-executed) invoked via `supabase.rpc(...)`, never as Edge
Functions (#27 D1).

#### Scenario: abrirSesion succeeds without a service_role key ever reaching the client (affirmative)

- GIVEN a cajero-side client with only the `anon`/`authenticated` key
- WHEN `abrir_sesion` is called
- THEN it succeeds — the RPC runs as owner, no `service_role` key is needed client-side

### Requirement: `abrirSesion` seeds `lineas` inside its own transaction

The RPC MUST `INSERT INTO lineas SELECT ... FROM categorias WHERE activa` as part of
the same transaction that creates the `sesion` row. No compensation/rollback logic
(`abrir-sesion.ts:97-109`, deleted) is needed, because Postgres has no 500-operation
batch limit forcing the seed outside the transaction (#27 D4).

#### Scenario: A failed seed leaves no orphaned sesion (affirmative — atomicity replaces compensation)

- GIVEN a seed step that would fail (e.g. no active categorias)
- WHEN `abrir_sesion` runs
- THEN either both the `sesiones` row and its `lineas` rows exist, or neither does —
  the transaction rolls back as a whole, with no manual delete-and-release step

### Requirement: Four operations write directly via PostgREST, authorized by RLS+CHECK alone

`crearSucursal`, `actualizarSucursal`, `crearCategoria`, `desactivarCategoria` MUST
be plain `supabase.from(table).insert/update(...)` calls with no server-side function
— RLS `WITH CHECK (private.es_admin())` and table `CHECK` constraints are the entire
authorization surface (#27 D1).

#### Scenario: Admin creates a sucursal with a direct insert (affirmative)

- GIVEN an admin client
- WHEN it calls `supabase.from('sucursales').insert({...})`
- THEN the row is created with no RPC or Edge Function involved

### Requirement: Every table write is audited by a trigger, never a manual call

`AFTER INSERT OR UPDATE OR DELETE` audit triggers MUST exist on every audited table,
deriving the changed-fields list from `OLD`/`NEW` (#27 D2 — a write that bypasses
application code, e.g. a direct PostgREST call, MUST still be audited; an omittable
manual call is not acceptable once writes no longer all pass through one code path).

#### Scenario: A direct PostgREST write is still audited (affirmative — proves the trigger, not app code, is the source)

- GIVEN an admin's direct `UPDATE sucursales ...`
- WHEN the transaction commits
- THEN an `auditoria` row exists for that change, with no application code having called an audit function

#### Scenario: No write path exists that skips the trigger (negative counterpart)

- GIVEN any write to an audited table, via RPC, Edge Function, or direct PostgREST
- WHEN it commits
- THEN the trigger fires in every case — there is no code path (`AFTER` triggers fire for every committed write on the table, not conditionally per caller)

### Requirement: `purgarAuditoria` runs via `pg_cron`, does not replace the external keep-alive cron

A single `pg_cron` entry MUST run
`delete from auditoria where ocurrido_en < now() - interval '12 months'` (#27 D3).
This MUST NOT be treated as satisfying the external keep-alive cron requirement
(#29/#30) — `pg_cron` does not execute while the project is paused; both mechanisms
are required.

#### Scenario: Purge deletes only records older than 12 months (affirmative)

- GIVEN `auditoria` rows both older and younger than 12 months
- WHEN the `pg_cron` job runs
- THEN only the older rows are deleted, in one statement, with no batching loop

## Verification Gate (blocked on #33, OPEN)

RPC, trigger, and `pg_cron` correctness scenarios above are specified but **not
executable as automated tests** until #33 selects pgTAP or local-Postgres
integration tests. The surviving Edge Function is the one component with a plausible
Deno-test path today. Authoring may proceed; "done" (strict TDD) cannot be claimed
for RPC/trigger/`pg_cron` requirements until #33 closes.

## Non-goals

- RLS/GRANT text — see `autorizacion-supabase`.
- Table/view shape — see `esquema-postgres`.
- `cerrarSesion`'s RF-16 logic in detail — see `cierre-sesion`.
- `crearCajero`/`desactivarCajero`/`reactivarCajero`/`actualizarCajero` request
  contracts in detail — see `gestion-cajeros`.
