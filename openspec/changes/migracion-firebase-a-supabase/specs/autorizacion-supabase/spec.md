# Autorización Supabase Specification

## Purpose

Identity and authorization per #24 (CLOSED D1-D5) and RLS/GRANT per #28 (CLOSED
D1-D6, incl. the D1 correction). Covers `perfiles` as sole identity source, `private`
schema helpers, the `GRANT`-verb/RLS-rows split, default-deny, and threat coverage
A-1…A-11. Two gaps are declared, not fixed (ruling: migration translates, does not
improve).

## Requirements

### Requirement: `rol`/`sucursales` are read from tables, never from JWT claims

RLS and the client MUST read authorization state from `perfiles`/`perfil_sucursales`.
The system MUST NOT use `custom_access_token_hook` (#24 D1) — a JWT is a photo, and
`sucursales` is a mutable security edge that must revoke instantly.

#### Scenario: Revoking a sucursal takes effect on the next request, not next token refresh (affirmative)

- GIVEN a cajero authorized for `suc_norte` with a still-valid access token
- WHEN an admin removes their `perfil_sucursales` row for `suc_norte`
- THEN their very next request against that sucursal is denied by RLS, before token expiry

#### Scenario: A stale claim cannot exist because none is written (negative counterpart)

- GIVEN the migrated system
- WHEN a JWT issued to any user is decoded
- THEN it carries no `rol`/`sucursales` claim to go stale

### Requirement: RLS recursion is broken by `private`-schema `SECURITY DEFINER` helpers

`private.es_admin()`, `private.tiene_sucursal(sucursal_id)`, and
`private.sesion_abierta(sesion_id)` MUST be `SECURITY DEFINER` with
`set search_path = ''`, in the `private` schema (not exposed by PostgREST) (#24 D4,
#28 D1 note; `ctx7-supabase-rls.md:9-33,136-156`).

#### Scenario: A policy referencing perfil_sucursales does not recurse (affirmative)

- GIVEN a policy on `sesiones` using `private.tiene_sucursal(sucursal_id)`
- WHEN it evaluates for a cajero
- THEN it returns a result without Postgres reporting infinite recursion

#### Scenario: `private.es_admin` is not callable from the client (negative counterpart)

- GIVEN an authenticated client using `supabase-js`
- WHEN it attempts `supabase.rpc('es_admin')` or a PostgREST call into `private.*`
- THEN it fails — the schema is not exposed

### Requirement: Admin onboarding uses a temporary password, no email dependency

`auth.admin.createUser({ email, password, email_confirm: true })` MUST be used, with
no `inviteUserByEmail`/SMTP dependency (#24 D2).

#### Scenario: A cajero is created and can sign in immediately (affirmative)

- GIVEN an admin creates a cajero with a temporary password
- WHEN the cajero signs in with that password
- THEN authentication succeeds with no email confirmation step pending

### Requirement: The temporary password never rotates or expires — declared gap

The system MUST NOT add password expiration, a forced first-login change flow, or
rotation — this is a deliberate parity gap (#24 D5, H4: the weakness exists today and
is not corrected by this migration).

#### Scenario: Admin-assigned password remains valid indefinitely (affirmative parity)

- GIVEN a cajero created with a temporary password
- WHEN they sign in weeks later without ever changing it
- THEN authentication still succeeds

#### Scenario: No "must change password" state exists anywhere in the migrated system (negative counterpart — corrects the false claim in doc 09 §3)

- GIVEN the migrated auth flow
- WHEN a newly-created cajero's first sign-in is inspected
- THEN no UI state, RPC, or Edge Function forces a password change

### Requirement: Deactivation is two ordered steps

`desactivarCajero` MUST call `auth.admin.updateUserById(uid, { ban_duration })`
first, then set `perfiles.activo = false` — never the reverse order (#24 D3: keeps
`activo: false` a conservative signal).

#### Scenario: A failure between the two steps never leaves activo = false while still unbanned (negative counterpart, proves order matters)

- GIVEN the ban call succeeds and the profile UPDATE fails
- WHEN the failure is observed
- THEN the cajero is banned but `perfiles.activo` is still `true` — never the inverse

### Requirement: `GRANT` decides the verb, RLS decides the rows — per table

No `GRANT` for write to `authenticated` exists on `perfiles`, `sesiones`, `lineas`,
`auditoria` — only `SECURITY DEFINER` RPC/Edge Function/triggers (owner) write them
(A-1, A-2, A-5). `sucursales`/`categorias` carry `GRANT INSERT/UPDATE` to
`authenticated` gated by `WITH CHECK (private.es_admin())`. `aportes` and
`sesion_participantes` carry `GRANT` plus row-scoped RLS (#28 D1, corrected).

#### Scenario: A cajero cannot INSERT into auditoria even though no policy denies it (affirmative, A-2 — proves revocation beats a false-policy)

- GIVEN a cajero client
- WHEN they attempt `INSERT INTO auditoria ...`
- THEN PostgREST rejects it for lack of `GRANT`, before any RLS policy is evaluated

#### Scenario: A cajero cannot self-promote to admin (affirmative, A-5)

- GIVEN a cajero client
- WHEN they attempt `UPDATE perfiles SET rol = 'admin' WHERE id = auth.uid()`
- THEN it is rejected for lack of `GRANT` — only the `actualizar_cajero` RPC (owner) writes `perfiles`

#### Scenario: Admin can create a sucursal; cajero cannot (affirmative + negative pair, sucursales)

- GIVEN one admin and one cajero client
- WHEN both attempt `INSERT INTO sucursales (...)`
- THEN the admin's insert succeeds (`WITH CHECK (private.es_admin())` passes) and the cajero's is rejected (`WITH CHECK` fails)

### Requirement: Default-deny is three pieces, verified by a `pg_class` test

Default-deny MUST be: (1) revoke base `public` schema privileges from `anon`/
`authenticated` plus `ALTER DEFAULT PRIVILEGES`, (2) `ENABLE ROW LEVEL SECURITY` on
every `public` table, (3) a test that scans `pg_class` and fails if any `public`
table has `relrowsecurity = false` (#28 D2 — Postgres has no declarative
catch-all). `FORCE ROW LEVEL SECURITY` MUST NOT be used — it would break the
`SECURITY DEFINER` helpers and RPCs that depend on running as owner
(`ctx7-supabase-rls.md:174-187`).

#### Scenario: A future table without RLS fails the pg_class test (affirmative)

- GIVEN a new table is added to `public` without `ENABLE ROW LEVEL SECURITY`
- WHEN the `pg_class` test runs
- THEN it fails, naming that table

#### Scenario: An owner-executed RPC still writes despite RLS being enabled everywhere (negative counterpart — proves FORCE is correctly omitted)

- GIVEN `sesiones` has RLS enabled and no client `GRANT`
- WHEN the `abrir_sesion` RPC (owner, `SECURITY DEFINER`) writes to `sesiones`
- THEN the write succeeds — RLS does not block the table owner absent `FORCE`

### Requirement: `aportes` write authorization — ownership, sucursal, open session, value range

`WITH CHECK (uid = auth.uid() AND private.tiene_sucursal(...) AND
private.sesion_abierta(sesion_id))` MUST gate `aportes` writes (A-3, A-4). `GRANT
INSERT/UPDATE` MUST be column-scoped to the writable set only, translating
Firestore's `hasOnly` as a permission, not a value check (#28 D3).
`CHECK (cantidad >= 0 AND cantidad <= 100000)` MUST enforce the value range (A-7).
`aportes` MUST have no `GRANT DELETE` for `authenticated`.

#### Scenario: Aporte to own sucursal, open sesion, in range — accepted (affirmative)

- GIVEN `uid_ana` authorized for `suc_norte`, an open sesion there, `cantidad = 40`
- WHEN she INSERTs an `aporte`
- THEN it succeeds

#### Scenario: Aporte to a sucursal she isn't authorized for — rejected (negative, A-3)

- GIVEN `uid_ana` is not authorized for `suc_sur`
- WHEN she attempts an `aporte` in a `suc_sur` sesion
- THEN `WITH CHECK` rejects it

#### Scenario: Aporte to a closed sesion — rejected (negative, A-4)

- GIVEN a sesion with `estado = 'cerrada'`
- WHEN `uid_ana` attempts an `aporte` there
- THEN `private.sesion_abierta()` evaluates false and the write is rejected

#### Scenario: Negative or oversized cantidad — rejected (negative, A-7)

- GIVEN `cantidad = -5` or `cantidad = 100001`
- WHEN the INSERT is attempted
- THEN the `CHECK` constraint rejects it

### Requirement: `sesion_participantes` UPDATE requires a matching SELECT policy

`GRANT UPDATE (confirmado_en)` plus `USING (uid = auth.uid())
WITH CHECK (uid = auth.uid())` MUST gate writes (A-11). A matching `SELECT` policy
MUST also exist — `ctx7-supabase-rls.md:191-207` confirms an UPDATE silently no-ops
without one.

#### Scenario: A participant confirms their own row (affirmative, A-11)

- GIVEN `uid_ana` has a `sesion_participantes` row
- WHEN she `UPDATE ... SET confirmado_en = now() WHERE uid = auth.uid()`
- THEN it succeeds and affects exactly one row

#### Scenario: A participant cannot confirm someone else's row (negative counterpart, A-11)

- GIVEN `uid_ana` attempts to update `uid_luis`'s row
- WHEN the UPDATE runs
- THEN it affects zero rows — `USING (uid = auth.uid())` excludes it

#### Scenario: Without the SELECT policy the UPDATE affects zero rows even for the owner (negative — the ctx7-confirmed gotcha this migration MUST avoid)

- GIVEN a misconfiguration where the SELECT policy is missing
- WHEN `uid_ana` updates her own row
- THEN PostgREST/Postgres cannot locate the row to update and it silently no-ops —
  this MUST NOT be the shipped configuration; the required SELECT policy makes the
  first scenario pass

### Requirement: Monetary views enforce `security_invoker` and an admin-only `WHERE`

`vista_resumen`/`vista_historicos` MUST be created `WITH (security_invoker = true)`
AND filtered `WHERE private.es_admin()` — neither clause substitutes for the other
(#28 D5, A-10; `ctx7-supabase-rls.md:160-171`).

#### Scenario: A cajero querying vista_resumen gets zero rows (affirmative, A-10)

- GIVEN a cajero authorized for the sesion's sucursal
- WHEN they SELECT from `vista_resumen`
- THEN they receive zero rows — `private.es_admin()` is false

#### Scenario: An admin querying vista_resumen gets the aggregation (negative counterpart, proves the WHERE isn't over-restrictive)

- GIVEN an admin
- WHEN they SELECT from `vista_resumen`
- THEN they receive the categoria-level aggregation for that sesion

### Requirement: A-8 (brute force) and A-9 (mass write) remain explicitly unmitigated

`docs/diseno/09-seguridad-y-auditoria.md` §2, which today falsely declares A-8/A-9
mitigated by App Check (never implemented — `README.md:112`), MUST be corrected to
state both as NOT mitigated, relying only on Supabase Auth's default rate limits
(#28 D4). The system MUST NOT introduce an App-Check-equivalent dependency as a
substitute mitigation — that would be an improvement, not a translation.

#### Scenario: Doc 09 states both threats as unmitigated (affirmative — doc accuracy)

- GIVEN `docs/diseno/09-seguridad-y-auditoria.md` §2 after this change
- WHEN A-8 and A-9 are read
- THEN both are marked NOT mitigated, citing Supabase Auth's default rate limits only

#### Scenario: No attestation/CAPTCHA dependency was added (negative counterpart)

- GIVEN the package manifests after this change
- WHEN dependencies are inspected
- THEN none provides App-Check-equivalent attestation — the gap is real, not hidden

## Verification Gate (blocked on #33, OPEN)

Every scenario above that exercises a `GRANT`/RLS policy, a `private.*` helper, or
the `pg_class` default-deny test is specified as required PostgREST/Postgres-level
behavior but is **not yet expressible as an automated test** — #33 (test strategy)
has not selected pgTAP vs. local-Postgres integration tests
(`ctx7-supabase-cli-testing.md:17-34`, both confirmed current). Strict TDD's red test
cannot be written for these requirements until #33 closes; authoring the policies
themselves may proceed.

## Non-goals

- Table/view shape — see `esquema-postgres`.
- RPC/Edge Function bodies — see `operaciones-servidor`.
- Migration seam enforcement (ESLint) — see `frontera-paquete-datos`.
