# Delta for Cierre Sesión

## MODIFIED Requirements

### Requirement: Authorization is two-stage — role gate before any read, sucursal gate before any side effect

`cerrarSesion` MUST call a role gate before any Firestore read: caller `rol`
MUST be `admin` or `admin_sucursal`; an `admin_sucursal` token MUST additionally
carry exactly 1 sucursal or the role gate itself rejects it (fail-closed, no
read yet). After the role gate, `cerrarSesion` reads the target sesión.
Immediately after that read — and BEFORE the RF-16 sync check, BEFORE the
`CIERRE_BLOQUEADO` audit write, and BEFORE the freeze transaction — a sucursal
gate MUST reject an `admin_sucursal` caller whose own sucursal does not equal
the sesión's `sucursalId`. `admin` (Gerente) is exempt from the sucursal gate.
(Previously: unconditional `exigirAdmin(req)` admin-only gate before any read.)

#### Scenario: Unauthenticated caller rejected (unchanged)

- GIVEN a request with no `req.auth`
- WHEN `cerrarSesion` is invoked
- THEN it throws `HttpsError("unauthenticated", ...)`

#### Scenario: Cajero caller rejected (unchanged)

- GIVEN `req.auth.token.rol == "cajero"`
- WHEN `cerrarSesion` is invoked
- THEN it throws `HttpsError("permission-denied", ...)`

#### Scenario: Gerente caller proceeds regardless of sucursal (affirmative, unchanged)

- GIVEN `req.auth.token.rol == "admin"`
- WHEN `cerrarSesion` is invoked with a valid, open `sesionId` of any sucursal
- THEN authorization passes and validation runs

#### Scenario: admin_sucursal caller of the sesión's own sucursal proceeds (affirmative, NEW)

- GIVEN `admin_sucursal` of `suc_1` and an open sesión with `sucursalId: "suc_1"`
- WHEN `cerrarSesion` is invoked
- THEN the role gate and sucursal gate both pass, and the close proceeds

#### Scenario: admin_sucursal caller of another sucursal rejected after lookup, before any side effect (negative, NEW — discriminates gate ordering)

- GIVEN `admin_sucursal` of `suc_1`, an open sesión with `sucursalId: "suc_2"`, and `sinConfirmar` non-empty for that sesión (a condition that would otherwise trigger `CIERRE_BLOQUEADO`)
- WHEN `cerrarSesion` is invoked
- THEN it throws `HttpsError("permission-denied", ...)`, NO `CIERRE_BLOQUEADO` audit event is written, and the RF-16 sync check never ran

#### Scenario: Malformed claim fails closed before any read (negative, NEW)

- GIVEN `admin_sucursal` whose token carries `[]` or 2 sucursales
- WHEN `cerrarSesion` is invoked, even against a `sesionId` in that sucursal set
- THEN the role gate throws `permission-denied` before the sesión is read

## Non-goals

- `crearCajero`, `actualizarCajero`, `desactivarCajero` — see `gestion-cajeros`.
- `reconciliarLineas` — see `reconciliacion-lineas`.
- Mutating an already-frozen session — no such path exists.
- `resumen-sesion`'s computation logic and rules read scope — see `admin-sucursal` (the `sesiones/{id}/resumen` Firestore read rule) and `resumen-sesion` (unchanged, no caller-supplied credentials for the cron).
