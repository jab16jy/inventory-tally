# Delta for Gestión Cajeros

Per #27 D1/D7 and #24 D1: the three callables requiring `service_role` move to one
Edge Function; `actualizarCajero` moves to an RPC; no operation writes claims.

## MODIFIED Requirements

### Requirement: Cajero management operations are split by authorization surface

`crearCajero`, `desactivarCajero`, and `reactivarCajero` MUST run in the single Edge
Function (`service_role` required — `auth.admin.*` operations). `actualizarCajero`
MUST run as a Postgres RPC (`SECURITY DEFINER`, no `service_role` — it only touches
`perfiles`/`perfil_sucursales`). Both surfaces MUST verify the caller is admin by
SELECTing their own `perfiles.rol` row under the caller's own RLS-scoped connection
before proceeding (#27 D1, D7).

(Previously: all three (crearCajero, actualizarCajero, desactivarCajero) were Cloud
Functions `onCall` callables gated uniformly by `exigirAdmin(req)` reading
`req.auth.token.rol`.)

#### Scenario: Unauthenticated caller rejected (each surface)

- GIVEN a request with no valid Supabase session
- WHEN any of the four operations (crearCajero, desactivarCajero, reactivarCajero,
  actualizarCajero) is invoked
- THEN it is rejected before any table read

#### Scenario: Cajero caller rejected via own-row check (negative discriminator — proves the SELECT-based check, not a trusted claim)

- GIVEN an authenticated cajero whose own `perfiles.rol = 'cajero'`
- WHEN they invoke the Edge Function or `actualizar_cajero` RPC
- THEN the own-row SELECT returns `'cajero'`, and the operation is rejected before
  using `service_role` or `SECURITY DEFINER` privileges

#### Scenario: Admin caller proceeds (affirmative)

- GIVEN an authenticated admin
- WHEN any of the four operations is invoked with valid input
- THEN the own-row check passes and the operation proceeds

### Requirement: `crearCajero` creates the Auth user and profile rows, no claims

The Edge Function's `crearCajero` operation MUST call
`auth.admin.createUser({ email, password, email_confirm: true })` (no SMTP
dependency, #24 D2), then INSERT one `perfiles` row and one `perfil_sucursales` row
per assigned sucursal, then rely on the audit trigger for the audit event. It MUST
NOT call any claims-setting mechanism — `custom_access_token_hook` is explicitly not
used (#24 D1).

(Previously: created the Firebase Auth user, called
`setCustomUserClaims({ rol, sucursales })`, wrote `usuarios/{uid}` with
`activo: true`, and manually wrote a `USUARIO_CREADO` audit event.)

#### Scenario: Valid input creates the cajero (affirmative)

- GIVEN a unique email, a temporary password (8+ chars), `rol = 'cajero'`, and ≤10
  sucursal assignments
- WHEN `crearCajero` runs
- THEN `auth.users` gains a row, `perfiles` gains a matching row with
  `rol = 'cajero'`, `perfil_sucursales` gains one row per sucursal, and the audit
  trigger produces a `USUARIO_CREADO` event — no claims are set anywhere

#### Scenario: Duplicate email rejected

- GIVEN an email already registered in `auth.users`
- WHEN `crearCajero` runs
- THEN it returns an error and writes no `auth.users`, `perfiles`, or
  `perfil_sucursales` row

### Requirement: `actualizarCajero` is a full-replacement RPC, validated by parameters and CHECK

`actualizar_cajero(uid uuid, nombre text, rol text, sucursales text[])` MUST require
all four parameters — a partial update is not expressible by the RPC signature.
`rol` MUST be constrained to `('admin', 'cajero')` by a `CHECK` constraint on
`perfiles.rol`.

(Previously: validated against a zod `actualizarCajeroSchema` contract requiring the
same four fields as a full replacement — `contracts/schemas/actualizar-cajero.schema.ts`
and its test are removed by #27 D5.)

#### Scenario: Complete update passes (affirmative)

- GIVEN valid `uid`, `nombre`, `rol = 'cajero'`, `sucursales = ['suc_1']`
- WHEN `actualizar_cajero` is called
- THEN `perfiles` and `perfil_sucursales` are updated to match

#### Scenario: Invalid rol rejected by CHECK (negative, discriminates the enum — replaces the old zod enum test)

- GIVEN `rol = 'superadmin'`
- WHEN `actualizar_cajero` is called
- THEN the `perfiles.rol` `CHECK` constraint rejects the write and no row changes

### Requirement: `actualizarCajero` updates profile rows; no token revocation on privilege change

`actualizar_cajero` MUST overwrite `nombre`, `rol`, and the `perfil_sucursales` rows
to match the submitted `sucursales`. Because no JWT claims exist to go stale (#24
D1), it MUST NOT call any token-revocation mechanism — the next RLS-evaluated query
for that user reads the updated `perfiles`/`perfil_sucursales` rows directly, so a
privilege change takes effect on the next request, not on next token refresh.

(Previously: compared submitted `rol`/`sucursalesAsignadas` against stored values
and, only on a change, called `setCustomUserClaims` followed by
`revokeRefreshTokens(uid)`; a name-only change did not revoke.)

#### Scenario: Role change takes effect on the next query, no revocation call exists (affirmative)

- GIVEN a cajero updated to `rol = 'admin'`
- WHEN they next make any RLS-governed request, even with their pre-existing access
  token still valid
- THEN `private.es_admin()` evaluates against the current `perfiles` row and returns
  `true` — no `revokeRefreshTokens`-equivalent call was needed or made

#### Scenario: Unknown uid rejected

- GIVEN `uid` with no matching `perfiles` row
- WHEN `actualizar_cajero` runs
- THEN it returns a not-found error and writes nothing

### Requirement: `desactivarCajero` bans the Auth user and deactivates the profile, in order

The Edge Function's `desactivarCajero` operation MUST call
`auth.admin.updateUserById(uid, { ban_duration })` first, then set
`perfiles.activo = false`, preserving the original two-step order (#24 D3 — writing
the profile last keeps `activo: false` a conservative signal).

(Previously: called `auth.updateUser(uid, { disabled: true })`, then
`auth.revokeRefreshTokens(uid)`, then set `usuarios/{uid}.activo = false`, then
wrote `USUARIO_DESACTIVADO` manually.)

#### Scenario: Deactivation bans then deactivates, in that order (affirmative)

- GIVEN an active cajero
- WHEN `desactivarCajero` runs
- THEN the Auth user is banned (`ban_duration` set) before `perfiles.activo`
  becomes `false`, and the audit trigger records `USUARIO_DESACTIVADO`

#### Scenario: A failure between the two steps leaves activo = true, never the reverse (negative counterpart, proves the order is load-bearing)

- GIVEN the ban call succeeds but the profile UPDATE fails
- WHEN the operation is retried
- THEN `perfiles.activo` is still `true` at the failure point — never `false` while
  the Auth user remains unbanned

#### Scenario: Unknown uid rejected

- GIVEN `uid` with no matching Auth user
- WHEN `desactivarCajero` runs
- THEN it returns a not-found error

### Requirement: Deactivating a participant of an open session does not fail

`desactivarCajero` MUST succeed even when the target `uid` is a
`sesion_participantes` row of a currently open sesion; it does not remove them from
`sesion_participantes` and does not itself block or alter the session. RF-16
exclusion of deactivated participants is specified in `cierre-sesion`.

(Previously stated in terms of `sesiones/{id}.participantes`; now
`sesion_participantes`.)

#### Scenario: Deactivating an open session's participant succeeds (affirmative)

- GIVEN `uid_luis` has a `sesion_participantes` row for an open sesion
- WHEN `desactivarCajero({ uid: "uid_luis" })` runs
- THEN it succeeds and that `sesion_participantes` row is unchanged

## ADDED Requirements

### Requirement: `reactivarCajero` reverses a deactivation

The Edge Function MUST expose a `reactivarCajero` operation that calls
`auth.admin.updateUserById(uid, { ban_duration: 'none' })` and sets
`perfiles.activo = true`, admin-only, following the same own-row authorization check
as the other three operations (#27 H2).

#### Scenario: Reactivating a banned cajero restores access (affirmative)

- GIVEN a cajero with `ban_duration` active and `perfiles.activo = false`
- WHEN an admin calls `reactivarCajero({ uid })`
- THEN the ban is lifted and `perfiles.activo` becomes `true`

#### Scenario: Reactivating an already-active cajero is a no-op success (negative counterpart)

- GIVEN a cajero with `perfiles.activo = true` and no ban
- WHEN `reactivarCajero` is called
- THEN it succeeds without error and no state changes

## REMOVED Requirements

### Requirement: `actualizarCajero` has a new zod contract

(Reason: #27 D5 — validation for RPC-shaped operations moves to Postgres parameter
types and `CHECK` constraints; a zod contract for a full RPC replacement duplicates
what the RPC signature already enforces.)
(Migration: `perfiles.rol` `CHECK ('admin', 'cajero')` replaces the enum test; the
RPC's four required parameters replace the "full replacement, not partial patch"
requirement structurally.)

## Non-goals

- `cerrarSesion` — see `cierre-sesion`.
- `reconciliarLineas` — removed in full, see `reconciliacion-lineas`.
- Password reset / self-service flows — declared parity gap, see
  `autorizacion-supabase`.
- Sucursales or categorías de valor management — see `operaciones-servidor`.
- Any `apps/web` client work.
