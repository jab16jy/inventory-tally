# Admin Sucursal Specification

## Purpose

Defines rol `admin_sucursal`: a branch manager scoped to exactly one sucursal —
categoría writes, the sesión role gate, and read access to monetary/audit data
confined to that sucursal, with no cross-branch comparativo.

## Requirements

### Requirement: `RolUsuario` admits `admin_sucursal` with exactly one sucursal

`RolUsuario` MUST include `"admin_sucursal"`. Any schema validating `rol` +
`sucursalesAsignadas` together MUST reject `rol: "admin_sucursal"` unless
`sucursalesAsignadas.length === 1`.

#### Scenario: Single sucursal passes (affirmative)

- GIVEN `{ rol: "admin_sucursal", sucursalesAsignadas: ["suc_1"] }`
- WHEN validated
- THEN it passes

#### Scenario: Zero or multiple sucursales rejected (negative)

- GIVEN `sucursalesAsignadas: []` or `["suc_1", "suc_2"]` with `rol: "admin_sucursal"`
- WHEN validated
- THEN validation fails on cardinality alone

### Requirement: Branch-scoped gate for sesión and categoría callables

`abrirSesion`, `crearCategoria`, `actualizarCategoria`, `desactivarCategoria`,
`reactivarCategoria`, and `eliminarCategoria` MUST admit `admin` (Gerente)
unconditionally. They MUST admit `admin_sucursal` ONLY when its token carries
exactly 1 sucursal matching the operation's target sucursal (`input.sucursalId`
for `abrirSesion`; the target categoría's stored `sucursalesAsignadas` for the
other four). A 0- or 2+-sucursal `admin_sucursal` token MUST be rejected
(`permission-denied`) before the target is even checked.

#### Scenario: admin_sucursal acts on its own sucursal (affirmative)

- GIVEN `admin_sucursal` of `suc_1` calling `abrirSesion({ sucursalId: "suc_1" })`
- WHEN the callable runs
- THEN authorization passes

#### Scenario: admin_sucursal acts on another sucursal (negative)

- GIVEN the same caller calling `abrirSesion({ sucursalId: "suc_2" })`
- WHEN the callable runs
- THEN it throws `HttpsError("permission-denied", ...)`

#### Scenario: Gerente unaffected (regression)

- GIVEN `rol: "admin"`
- WHEN any of the six callables runs against any sucursal
- THEN authorization passes as before

#### Scenario: Malformed claim fails closed (negative)

- GIVEN `admin_sucursal` whose token carries `[]` or 2 sucursales
- WHEN any of the six callables runs, even against a sucursal in that array
- THEN it throws `HttpsError("permission-denied", ...)`

### Requirement: Categoría writes scoped to exclusively-owned categorías

`admin_sucursal` MAY read any categoría (global, shared, or exclusive). It MUST
write (`actualizarCategoria`, `desactivarCategoria`, `reactivarCategoria`,
`eliminarCategoria`) ONLY a categoría whose stored `sucursalesAsignadas` equals
exactly `[ownSucursal]`; a categoría with `sucursalesAsignadas` undefined
(global) or containing any other sucursal MUST be rejected, unchanged.
`crearCategoria` MUST reject `admin_sucursal` input whose `sucursalesAsignadas`
is missing or is not exactly `[ownSucursal]` (no global or shared creation).

#### Scenario: Update on exclusively-owned categoría (affirmative)

- GIVEN a categoría with `sucursalesAsignadas: ["suc_1"]` and caller `admin_sucursal` of `suc_1`
- WHEN `actualizarCategoria` runs
- THEN it updates as normal

#### Scenario: Update on global categoría rejected (negative)

- GIVEN a categoría with no `sucursalesAsignadas`
- WHEN `admin_sucursal` calls `actualizarCategoria`/`desactivarCategoria`/`reactivarCategoria`/`eliminarCategoria`
- THEN it throws `permission-denied` and the document is unchanged

#### Scenario: Update on shared categoría rejected (negative)

- GIVEN `sucursalesAsignadas: ["suc_1", "suc_2"]` and caller `admin_sucursal` of `suc_1`
- WHEN the same callables run
- THEN they throw `permission-denied`, unchanged

#### Scenario: Creating a global or multi-sucursal categoría rejected (negative)

- GIVEN `admin_sucursal` calling `crearCategoria` with `sucursalesAsignadas` omitted or `["suc_1", "suc_2"]`
- WHEN the callable runs
- THEN it throws `permission-denied`, nothing is created

#### Scenario: Gerente unaffected (regression)

- GIVEN `rol: "admin"`
- WHEN it creates or writes any categoría, including global
- THEN it succeeds as before

### Requirement: Rules read scope — money and audit confined to own sucursal

A `puedeVerSucursal(sucursalId)` predicate MUST allow `admin` unconditionally,
and `admin_sucursal` (never `cajero`) when `sucursalId` is in the token's
`sucursales`. Cajeros MUST keep having no read access to `historicos` or
`resumen` (monetary data).
`sucursales/{id}/historicos/{sesionId}` reads and `sesiones/{id}/resumen/{doc}`
reads MUST use this predicate instead of `esAdmin()` alone. `auditoria/{eventoId}`
reads MUST additionally allow `admin_sucursal` via the same predicate (mirrors
the existing cajero branch).

#### Scenario: Read own sucursal's historicos and resumen (affirmative)

- GIVEN `admin_sucursal` of `suc_1`
- WHEN it reads `sucursales/suc_1/historicos/{sesionId}` or `sesiones/{id}/resumen/actual` for a sesión with `sucursalId: "suc_1"`
- THEN both reads succeed

#### Scenario: Read another sucursal's historicos or auditoria rejected (negative)

- GIVEN the same caller
- WHEN it reads `sucursales/suc_2/historicos/{sesionId}` or an auditoria event with `sucursalId: "suc_2"`
- THEN both reads are denied

#### Scenario: Admin and cajero unaffected (regression)

- GIVEN `rol: "admin"` or `rol: "cajero"`
- WHEN reading the same three collections under existing rules
- THEN behavior is unchanged

### Requirement: `usuarios` get/list scoped to a shared sucursal

`usuarios/{uid}` get MUST additionally allow `admin_sucursal` when the target
document's `sucursalesAsignadas` intersects (`hasAny`) the caller's own
sucursal. `usuarios` list MUST additionally allow `admin_sucursal` ONLY for a
query filtered to documents whose `sucursalesAsignadas` array-contains the
caller's own sucursal; an unfiltered or foreign-sucursal-filtered list MUST be
denied.

#### Scenario: Get a usuario of the shared sucursal (affirmative)

- GIVEN `admin_sucursal` of `suc_1` and a usuario with `sucursalesAsignadas: ["suc_1", "suc_2"]`
- WHEN it gets that document
- THEN the read succeeds

#### Scenario: Get a usuario of another sucursal only (negative)

- GIVEN the same caller and a usuario with `sucursalesAsignadas: ["suc_2"]`
- WHEN it gets that document
- THEN the read is denied

#### Scenario: Unfiltered list rejected (negative — highest leak risk)

- GIVEN `admin_sucursal` of `suc_1`
- WHEN it issues `usuarios` list without a `sucursalesAsignadas array-contains "suc_1"` filter (or filtered to another sucursal)
- THEN Firestore denies the whole list operation

#### Scenario: Filtered list on own sucursal succeeds (affirmative)

- GIVEN the same caller
- WHEN it issues `usuarios` list filtered `where sucursalesAsignadas array-contains "suc_1"`
- THEN the list succeeds

#### Scenario: Gerente unaffected (regression)

- GIVEN `rol: "admin"`
- WHEN it gets or lists any `usuarios` document
- THEN behavior is unchanged

### Requirement: Session-scoped write gate already admits admin_sucursal (regression)

`exigirAdminOCajeroDeSesion` (used by session-scoped writes such as
`crearCategoriaEnSesion`) already authorizes any caller whose claim sucursales
include the sesión's `sucursalId` — `admin_sucursal` included, by construction.
No code change is required here; only test coverage.

#### Scenario: admin_sucursal writes within its own sesión (affirmative)

- GIVEN `admin_sucursal` of `suc_1` and an open sesión with `sucursalId: "suc_1"`
- WHEN it calls `crearCategoriaEnSesion`
- THEN authorization passes

#### Scenario: admin_sucursal writes to a foreign sesión (negative)

- GIVEN the same caller and a sesión with `sucursalId: "suc_2"`
- WHEN it calls `crearCategoriaEnSesion`
- THEN it throws `permission-denied`

### Requirement: `/admin/comparativo` is blocked for admin_sucursal

The route guard MUST redirect an authenticated `admin_sucursal` away from
`/admin/comparativo`, and the nav MUST NOT render its link for that rol.
Behavior for `admin` (Gerente) is unchanged.

#### Scenario: admin_sucursal blocked (negative)

- GIVEN an authenticated `admin_sucursal`
- WHEN it navigates to `/admin/comparativo`
- THEN it is redirected away and the nav has no comparativo link

#### Scenario: Gerente unaffected (regression)

- GIVEN an authenticated `admin` (Gerente)
- WHEN it navigates to `/admin/comparativo`
- THEN it renders normally and the nav link is present

### Requirement: Rol labels

The UI MUST render `rol` as "Gerente" for `admin`, "Admin de sucursal" for
`admin_sucursal`, and "Cajero" for `cajero`, without renaming the stored/claim
value.

#### Scenario: Each rol maps to its label

- GIVEN a usuario with `rol` one of `"admin" | "admin_sucursal" | "cajero"`
- WHEN its label is rendered (account screen, admin user list)
- THEN it shows "Gerente", "Admin de sucursal", or "Cajero" respectively, and the stored `rol` value is untouched

## Non-goals

- Cajero create/edit authorization and anti-escalation — see `gestion-cajeros`.
- `cerrarSesion`'s two-stage gate — see `cierre-sesion`.
- Áreas, sucursal create/edit, comparativo access for admin_sucursal (all Gerente-only, unchanged).
- Renaming the internal `"admin"` value or data migration.
