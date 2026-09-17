# Delta for Gestión Cajeros

## MODIFIED Requirements

### Requirement: All three callables are Gerente-only or admin_sucursal scoped to its own sucursal, with anti-escalation

`crearCajero`, `actualizarCajero`, and `desactivarCajero` MUST call a
branch-scoped authorization gate before any read or write. `admin` (Gerente)
passes unconditionally. `admin_sucursal` passes ONLY when its token carries
exactly 1 sucursal AND: for `crearCajero`/`actualizarCajero`, the submitted
`rol` is exactly `"cajero"` and the submitted `sucursalesAsignadas` equals
exactly `[ownSucursal]`; for `actualizarCajero`/`desactivarCajero`, the target
`uid`'s CURRENT Auth custom claims must carry `rol: "cajero"` and `sucursales`
equal to exactly `[ownSucursal]`. A cajero shared with another sucursal, or any
user with rol `admin`/`admin_sucursal`, is out of reach for `admin_sucursal`.
(Previously: unconditional admin-only via `exigirAdmin(req)`.)

Source of truth for every target check in this delta: the target's Auth custom
claims (doc 09 §2), never `usuarios/{uid}`. `crearCajero`/`actualizarCajero` set
claims and profile together, so "stored" in the scenarios below describes both.

#### Scenario: Unauthenticated caller rejected (each callable, unchanged)

- GIVEN a request with no `req.auth`
- WHEN any of the three callables is invoked
- THEN it throws `HttpsError("unauthenticated", ...)`

#### Scenario: Cajero caller rejected (each callable, unchanged)

- GIVEN `req.auth.token.rol == "cajero"`
- WHEN any of the three callables is invoked
- THEN it throws `HttpsError("permission-denied", ...)`

#### Scenario: Gerente caller proceeds regardless of sucursal (affirmative, unchanged)

- GIVEN `req.auth.token.rol == "admin"`
- WHEN any of the three callables is invoked with valid input, any sucursal
- THEN authorization passes

#### Scenario: admin_sucursal creates a cajero for its own sucursal (affirmative)

- GIVEN `admin_sucursal` of `suc_1` calling `crearCajero` with `rol: "cajero"`, `sucursalesAsignadas: ["suc_1"]`
- WHEN it runs
- THEN authorization passes

#### Scenario: admin_sucursal attempts to create/assign rol admin or admin_sucursal (negative — anti-escalation)

- GIVEN `admin_sucursal` of `suc_1` submitting `rol: "admin"` or `rol: "admin_sucursal"` to `crearCajero`/`actualizarCajero`
- WHEN it runs
- THEN it throws `permission-denied` before any write

#### Scenario: admin_sucursal attempts to assign a foreign or extra sucursal (negative)

- GIVEN the same caller submitting `sucursalesAsignadas: ["suc_2"]` or `["suc_1", "suc_2"]`
- WHEN `crearCajero`/`actualizarCajero` runs
- THEN it throws `permission-denied` before any write

#### Scenario: admin_sucursal updates/deactivates a cajero assigned solely to its own sucursal (affirmative)

- GIVEN `uid_ana` with stored `sucursalesAsignadas: ["suc_1"]` and caller `admin_sucursal` of `suc_1`
- WHEN `actualizarCajero`/`desactivarCajero` runs
- THEN authorization passes

#### Scenario: admin_sucursal attempts to update/deactivate a cajero shared with another sucursal (negative — decision #2)

- GIVEN `uid_ana` with stored `sucursalesAsignadas: ["suc_1", "suc_2"]` and caller `admin_sucursal` of `suc_1`
- WHEN `actualizarCajero`/`desactivarCajero` runs
- THEN it throws `permission-denied`, the profile and claims are unchanged

#### Scenario: admin_sucursal attempts to update/deactivate a cajero of another sucursal entirely (negative)

- GIVEN `uid_luis` with stored `sucursalesAsignadas: ["suc_2"]` and caller `admin_sucursal` of `suc_1`
- WHEN `actualizarCajero`/`desactivarCajero` runs
- THEN it throws `permission-denied`

#### Scenario: Malformed claim fails closed (negative)

- GIVEN `admin_sucursal` whose token carries `[]` or 2 sucursales
- WHEN any of the three callables runs, even against `[ownSucursal]`-matching input
- THEN it throws `permission-denied`

### Requirement: `actualizarCajero` has a new zod contract

`contracts/schemas/actualizar-cajero.schema.ts` MUST exist with a co-located
`.test.ts`, requiring ALL of `uid: string (non-empty)`, `nombre: string
(non-empty)`, `rol` (`"admin" | "admin_sucursal" | "cajero"`), and
`sucursalesAsignadas` (array, max 10). It MUST reject `rol: "admin_sucursal"`
combined with `sucursalesAsignadas.length !== 1`.
(Previously: `rol` enum was `"admin" | "cajero"`, no cardinality rule.)

This is a **full replacement, not a partial patch**. `setCustomUserClaims`
replaces the entire claims object, so a partial update would require a
read-modify-write spanning Auth and Firestore and would break the
convergent-retry recovery rule for a partial failure. `correo` is excluded:
changing the sign-in address is a different operation (re-verification, threat
A-6) and doc 08 §2 does not list it.

Every negative scenario below supplies a complete, otherwise-valid object so
that it fails for exactly one reason (`AGENTS.md` §2).

#### Scenario: Complete update passes (affirmative, unchanged)

- GIVEN `{ uid: "uid_ana", nombre: "Ana R.", rol: "cajero", sucursalesAsignadas: ["suc_1"] }`
- WHEN validated against `actualizarCajeroSchema`
- THEN it passes

#### Scenario: Partial update rejected (negative, unchanged)

- GIVEN `{ uid: "uid_ana", nombre: "Ana R." }` — `rol` and `sucursalesAsignadas` absent
- WHEN validated
- THEN validation fails, because every field is required

#### Scenario: Invalid rol rejected (negative, discriminates the enum)

- GIVEN `{ uid: "uid_ana", nombre: "Ana R.", rol: "superadmin", sucursalesAsignadas: ["suc_1"] }`
- WHEN validated
- THEN validation fails on `rol` alone

#### Scenario: Oversized sucursalesAsignadas rejected (negative, unchanged)

- GIVEN `sucursalesAsignadas` with 11 distinct ids, `rol: "cajero"`
- WHEN validated
- THEN validation fails on `sucursalesAsignadas` alone

#### Scenario: admin_sucursal with one sucursal passes (affirmative, NEW)

- GIVEN `{ uid: "uid_x", nombre: "X", rol: "admin_sucursal", sucursalesAsignadas: ["suc_1"] }`
- WHEN validated
- THEN it passes

#### Scenario: admin_sucursal with zero or multiple sucursales rejected (negative, NEW)

- GIVEN `rol: "admin_sucursal"` with `sucursalesAsignadas: []` or `["suc_1", "suc_2"]`
- WHEN validated
- THEN validation fails on cardinality alone

## ADDED Requirements

### Requirement: `crearCajero`'s contract enforces the admin_sucursal cardinality invariant

`crearCajeroSchema` MUST reject `rol: "admin_sucursal"` combined with
`sucursalesAsignadas.length !== 1`, mirroring `actualizarCajeroSchema`.

#### Scenario: admin_sucursal with one sucursal passes (affirmative)

- GIVEN `{ correo: "x@y.com", passwordTemporal: "temporal1", rol: "admin_sucursal", sucursalesAsignadas: ["suc_1"] }`
- WHEN validated against `crearCajeroSchema`
- THEN it passes

#### Scenario: admin_sucursal with zero or multiple sucursales rejected (negative)

- GIVEN the same input with `sucursalesAsignadas: []` or two ids
- WHEN validated
- THEN validation fails on cardinality alone

### Requirement: `reactivarCajero` is Gerente-only or admin_sucursal scoped to its own sucursal

`reactivarCajero` MUST call the same branch-scoped authorization gate as the
other cajero callables, deciding on the target's CURRENT Auth custom claims
(`rol`, `sucursales`) — the authority per doc 09 §2; `desactivarCajero` never
clears them — before the Firestore update and before the trailing
`auth.updateUser(uid, { disabled: false })`. `admin` (Gerente) passes
unconditionally. `admin_sucursal` passes ONLY when its token carries exactly 1
sucursal, the target's claim `rol` is exactly `"cajero"`, and the target's
claim `sucursales` equals exactly `[ownSucursal]`. A target with rol `admin`/`admin_sucursal`, or a
cajero shared with or assigned to another sucursal, is out of reach for
`admin_sucursal` — neither the Firestore update nor `auth.updateUser` may run
if the check fails.

#### Scenario: Reactivating a cajero assigned solely to own sucursal (affirmative)

- GIVEN `uid_ana` with stored `{ rol: "cajero", sucursalesAsignadas: ["suc_1"] }` and caller `admin_sucursal` of `suc_1`
- WHEN `reactivarCajero({ uid: "uid_ana" })` runs
- THEN authorization passes and `uid_ana` is reactivated

#### Scenario: Reactivating a cajero shared with another sucursal rejected (negative — decision #2)

- GIVEN `uid_ana` with stored `sucursalesAsignadas: ["suc_1", "suc_2"]` and caller `admin_sucursal` of `suc_1`
- WHEN `reactivarCajero` runs
- THEN it throws `permission-denied`; no Firestore write and no `auth.updateUser` call occur

#### Scenario: Reactivating a target with rol admin or admin_sucursal rejected (negative — anti-escalation)

- GIVEN `uid_x` with stored `rol: "admin"` or `"admin_sucursal"` and any `sucursalesAsignadas` including `suc_1`, caller `admin_sucursal` of `suc_1`
- WHEN `reactivarCajero` runs
- THEN it throws `permission-denied`; no side effect occurs

#### Scenario: Reactivating a cajero of another sucursal entirely rejected (negative)

- GIVEN `uid_luis` with stored `sucursalesAsignadas: ["suc_2"]` and caller `admin_sucursal` of `suc_1`
- WHEN `reactivarCajero` runs
- THEN it throws `permission-denied`

#### Scenario: Gerente unaffected (affirmative, regression)

- GIVEN `req.auth.token.rol == "admin"`
- WHEN `reactivarCajero` runs against a cajero of any sucursal
- THEN authorization passes as before

### Requirement: `eliminarCajero` is Gerente-only or admin_sucursal scoped to its own sucursal, decided before any side effect

`eliminarCajero` MUST call the same branch-scoped authorization gate as the
other cajero callables, deciding on the target's Auth custom claims (`rol`,
`sucursales`) from the existing `auth.getUser(uid)` lookup — never on
`usuarios/{uid}`, per the rule already documented in `eliminar-cajero.ts`. The
decision MUST complete BEFORE the participations count, `auth.deleteUser` and
the Firestore delete transaction. The orphan-account path (Auth account already
gone, profile read as fallback) stays Gerente-only: `admin_sucursal` is denied
there (fail closed). `admin` (Gerente) passes unconditionally.
`admin_sucursal` passes ONLY when its token carries exactly 1 sucursal, the
target's claim `rol` is exactly `"cajero"`, and the target's claim `sucursales`
equals exactly `[ownSucursal]`. A target with rol
`admin`/`admin_sucursal`, or a cajero shared with or assigned to another
sucursal, is out of reach for `admin_sucursal` — no Auth deletion and no
Firestore delete may occur.

#### Scenario: Deleting a cajero assigned solely to own sucursal (affirmative)

- GIVEN `uid_ana` with stored `{ rol: "cajero", sucursalesAsignadas: ["suc_1"] }`, no session participations, caller `admin_sucursal` of `suc_1`
- WHEN `eliminarCajero({ uid: "uid_ana" })` runs
- THEN authorization passes and `uid_ana` is deleted

#### Scenario: Deleting a cajero shared with another sucursal rejected (negative — decision #2)

- GIVEN `uid_ana` with stored `sucursalesAsignadas: ["suc_1", "suc_2"]` and caller `admin_sucursal` of `suc_1`
- WHEN `eliminarCajero` runs
- THEN it throws `permission-denied`; no `auth.deleteUser` call and no Firestore delete occur

#### Scenario: Deleting a target with rol admin or admin_sucursal rejected (negative — anti-escalation)

- GIVEN `uid_x` with stored `rol: "admin"` or `"admin_sucursal"` and `sucursalesAsignadas` including `suc_1`, caller `admin_sucursal` of `suc_1`
- WHEN `eliminarCajero` runs
- THEN the authorization gate throws `permission-denied` before any side effect

#### Scenario: Deleting a cajero of another sucursal entirely rejected (negative)

- GIVEN `uid_luis` with stored `sucursalesAsignadas: ["suc_2"]` and caller `admin_sucursal` of `suc_1`
- WHEN `eliminarCajero` runs
- THEN it throws `permission-denied`

#### Scenario: Gerente unaffected (affirmative, regression)

- GIVEN `req.auth.token.rol == "admin"`
- WHEN `eliminarCajero` runs against a cajero of any sucursal
- THEN authorization passes and the existing business guards (self-delete, target rol, live participations) still apply as before

## Non-goals

- `cerrarSesion`, `recalcularResumen`, `reconciliarLineas` — separate specs.
- Password reset / self-service flows.
- Sucursales or categorías de valor management — see `admin-sucursal`.
- Any `apps/web` client work.
