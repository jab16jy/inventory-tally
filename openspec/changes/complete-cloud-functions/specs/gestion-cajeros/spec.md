# Gestión Cajeros Specification

## Purpose

RF-02: the admin creates, edits, and deactivates cajeros. Three admin callables:
`crearCajero` (contract exists, unconsumed), `actualizarCajero`, `desactivarCajero`
(both need new zod contracts in `contracts/schemas/` with co-located `.test.ts`).

## Requirements

### Requirement: All three callables are admin-only

`crearCajero`, `actualizarCajero`, and `desactivarCajero` MUST call `exigirAdmin(req)`
before any read or write.

#### Scenario: Unauthenticated caller rejected (each callable)

- GIVEN a request with no `req.auth`
- WHEN any of the three callables is invoked
- THEN it throws `HttpsError("unauthenticated", ...)`

#### Scenario: Cajero caller rejected (each callable)

- GIVEN `req.auth.token.rol == "cajero"`
- WHEN any of the three callables is invoked
- THEN it throws `HttpsError("permission-denied", ...)`

#### Scenario: Admin caller proceeds (affirmative, each callable)

- GIVEN `req.auth.token.rol == "admin"`
- WHEN any of the three callables is invoked with valid input
- THEN authorization passes

### Requirement: `crearCajero` creates Auth user, claims, and profile

Per the existing `crearCajeroSchema`: creates the Firebase Auth user, sets custom
claims `{ rol, sucursales: sucursalesAsignadas }`, writes `usuarios/{uid}` with
`activo: true`, and writes a `USUARIO_CREADO` audit event.

#### Scenario: Valid input creates the cajero (affirmative)

- GIVEN a unique `correo`, `passwordTemporal` of 8+ chars, `rol: "cajero"`, and ≤10 `sucursalesAsignadas`
- WHEN `crearCajero` runs
- THEN it returns `{ uid, creado: true }`, the Auth user has claims `{ rol: "cajero", sucursales }`, `usuarios/{uid}.activo == true`, and a `USUARIO_CREADO` audit event exists

#### Scenario: Duplicate email rejected

- GIVEN `correo` already registered in Auth
- WHEN `crearCajero` runs
- THEN it throws `HttpsError("already-exists", ...)` and writes no Auth user, profile, or audit event

#### Scenario: Invalid input rejected (schema violations)

- GIVEN `correo` malformed, or `passwordTemporal` < 8 chars, or `rol` not in `{admin, cajero}`, or `sucursalesAsignadas.length > 10`
- WHEN `crearCajero` runs
- THEN it throws `HttpsError("invalid-argument", ...)` before touching Auth or Firestore

### Requirement: `actualizarCajero` has a new zod contract

`contracts/schemas/actualizar-cajero.schema.ts` MUST exist with a co-located
`.test.ts`, requiring ALL of `uid: string (non-empty)`, `nombre: string (non-empty)`,
`rol` (`"admin" | "cajero"`), and `sucursalesAsignadas` (array, max 10).

This is a **full replacement, not a partial patch**. `setCustomUserClaims` replaces the
entire claims object, so a partial update would require a read-modify-write spanning Auth
and Firestore and would break the convergent-retry recovery rule for a partial failure.
`correo` is excluded: changing the sign-in address is a different operation
(re-verification, threat A-6) and doc 08 §2 does not list it.

Every negative scenario below supplies a complete, otherwise-valid object so that it fails
for exactly one reason. A negative case that omits several fields at once would also fail
with the rule under test removed, and would therefore discriminate nothing
(`AGENTS.md` §2).

#### Scenario: Complete update passes (affirmative)

- GIVEN `{ uid: "uid_ana", nombre: "Ana R.", rol: "cajero", sucursalesAsignadas: ["suc_1"] }`
- WHEN validated against `actualizarCajeroSchema`
- THEN it passes

#### Scenario: Partial update rejected (negative, discriminates full replacement)

- GIVEN `{ uid: "uid_ana", nombre: "Ana R." }` — `rol` and `sucursalesAsignadas` absent
- WHEN validated
- THEN validation fails, because every field is required

#### Scenario: Invalid rol rejected (negative, discriminates the enum)

- GIVEN `{ uid: "uid_ana", nombre: "Ana R.", rol: "superadmin", sucursalesAsignadas: ["suc_1"] }`
- WHEN validated
- THEN validation fails on `rol` alone

#### Scenario: Oversized sucursalesAsignadas rejected (negative, discriminates the max bound)

- GIVEN `{ uid: "uid_ana", nombre: "Ana R.", rol: "cajero", sucursalesAsignadas: [11 distinct ids] }`
- WHEN validated
- THEN validation fails on `sucursalesAsignadas` alone

### Requirement: `actualizarCajero` updates profile, claims, and revokes tokens on privilege change

`actualizarCajero` MUST overwrite `nombre`, `rol`, and `sucursalesAsignadas` on
`usuarios/{uid}` with the submitted values. It MUST compare the submitted `rol` and
`sucursalesAsignadas` against the stored ones, and only when either differs call
`auth.setCustomUserClaims` with the new values followed by `auth.revokeRefreshTokens(uid)`
(doc 08 §3: claim propagation note). Submitting a full object that changes only `nombre`
MUST NOT revoke tokens — a full-replacement contract must not turn every edit into a
forced re-login. It MUST write an audit event recording which fields actually changed
(event type extends the `TipoEventoAuditoria` catalog — exact name is a design decision).

#### Scenario: Role change revokes tokens (affirmative)

- GIVEN a cajero with `rol: "cajero"` and an update setting `rol: "admin"`
- WHEN `actualizarCajero` runs
- THEN the Auth user's claims become `{ rol: "admin", ... }` and `revokeRefreshTokens` is called

#### Scenario: Name-only change does not revoke tokens (negative counterpart)

- GIVEN an update containing only `nombre`
- WHEN `actualizarCajero` runs
- THEN claims are unchanged and `revokeRefreshTokens` is NOT called

#### Scenario: Unknown uid rejected

- GIVEN `uid` with no matching `usuarios/{uid}` document
- WHEN `actualizarCajero` runs
- THEN it throws `HttpsError("not-found", ...)`

### Requirement: `desactivarCajero` has a new zod contract

`contracts/schemas/desactivar-cajero.schema.ts` MUST exist with a co-located
`.test.ts`, requiring `uid: string (non-empty)`.

#### Scenario: Valid uid passes (affirmative)

- GIVEN `{ uid: "uid_luis" }`
- WHEN validated against `desactivarCajeroSchema`
- THEN it passes

#### Scenario: Empty uid rejected (negative counterpart)

- GIVEN `{ uid: "" }`
- WHEN validated
- THEN validation fails

### Requirement: `desactivarCajero` disables, revokes, and deactivates the profile

`desactivarCajero` MUST call `auth.updateUser(uid, { disabled: true })`,
`auth.revokeRefreshTokens(uid)`, set `usuarios/{uid}.activo = false`, and write a
`USUARIO_DESACTIVADO` audit event.

#### Scenario: Deactivation revokes the active session (affirmative)

- GIVEN an active cajero `uid_luis`
- WHEN `desactivarCajero({ uid: "uid_luis" })` runs
- THEN the Auth user is `disabled`, refresh tokens are revoked, `usuarios/uid_luis.activo == false`, and `USUARIO_DESACTIVADO` is audited

#### Scenario: Unknown uid rejected

- GIVEN `uid` with no matching Auth user
- WHEN `desactivarCajero` runs
- THEN it throws `HttpsError("not-found", ...)`

### Requirement: Deactivating a participant of an open session does not fail

`desactivarCajero` MUST succeed even when the target `uid` is a `participantes` entry
of a currently open `SesionConteo`; it does not remove them from `participantes` and
does not itself block or alter the session. RF-16 exclusion of deactivated
participants is specified in `cierre-sesion`.

#### Scenario: Deactivating an open session's participant succeeds (affirmative)

- GIVEN `uid_luis` is in `sesiones/ses_1.participantes` and `ses_1.estado == "abierta"`
- WHEN `desactivarCajero({ uid: "uid_luis" })` runs
- THEN it succeeds, and `ses_1.participantes` is unchanged

## Non-goals

- `cerrarSesion`, `recalcularResumen`, `reconciliarLineas` — separate specs.
- Password reset / self-service flows.
- Sucursales or categorías de valor management.
- Any `apps/web` client work.
