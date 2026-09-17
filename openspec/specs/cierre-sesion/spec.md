# Cierre Sesión Specification

## Purpose

`cerrarSesion` — admin callable implementing RF-16 synchronization verification, the
RF-12 freeze, and the `sucursales/{id}/historicos/{sesionId}` snapshot. Depends on the
`recalcularResumen` helper from `resumen-sesion`.

## Requirements

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

### Requirement: Input is validated against `cerrarSesionSchema`

`{ sesionId: string, forzar: boolean = false }` (contract already exists, unchanged).

#### Scenario: Missing sesionId rejected

- GIVEN `req.data == { forzar: true }`
- WHEN `cerrarSesion` is invoked
- THEN it throws `HttpsError("invalid-argument", ...)`

#### Scenario: Valid input with forzar omitted defaults to false (affirmative)

- GIVEN `req.data == { sesionId: "ses_1" }`
- WHEN validated
- THEN `forzar` resolves to `false`

### Requirement: Session must be open

`cerrarSesion` MUST reject when the target session's `estado != "abierta"`.

#### Scenario: Already-closed session rejected

- GIVEN a session with `estado: "cerrada"`
- WHEN `cerrarSesion` is invoked
- THEN it throws `HttpsError("failed-precondition", ...)` and no write occurs (idempotent-safe: a second close attempt never re-freezes or re-audits)

#### Scenario: Open session proceeds (affirmative)

- GIVEN a session with `estado: "abierta"`
- WHEN `cerrarSesion` is invoked
- THEN the RF-16 verification step runs

### Requirement: RF-16 synchronization predicate — corrected

A participant is synchronized if and only if
`sincronizacion/estado.participantes.{uid}.confirmadoEn >= .ultimoAporteServidor`.
`ultimoAporteServidor` is written by `on-aporte-escrito.ts:97` on every `aporte`. A
participant who contributed an `aporte` after confirming has a stale confirmation and
MUST be treated as unsynchronized. `docs/diseno/08-contratos-y-cloud-functions.md`
line 211, which only checks `confirmadoEn` truthiness, MUST be corrected to this
predicate in the same commit that implements `cerrarSesion` (AGENTS.md §0: the code
and the doc must not diverge).

#### Scenario: Confirmed and never re-contributed — synchronized (affirmative)

- GIVEN `participantes.uid_ana.confirmadoEn` is set and no later `ultimoAporteServidor`
- WHEN the predicate is evaluated for `uid_ana`
- THEN `uid_ana` is synchronized (excluded from `sinConfirmar`)

#### Scenario: Confirmed, then contributed again — stale, MUST re-confirm (negative, discriminates against doc 08's original check)

- GIVEN `confirmadoEn == 11:00` and a later `aporte` sets `ultimoAporteServidor == 11:05`
- WHEN the predicate is evaluated for that participant
- THEN they are treated as unsynchronized even though `confirmadoEn` is truthy

#### Scenario: Never confirmed — unsynchronized (affirmative)

- GIVEN `confirmadoEn == null`
- WHEN the predicate is evaluated
- THEN the participant is unsynchronized

### Requirement: Deactivated participants are excluded from the predicate

A participant deactivated via `desactivarCajero` (`usuarios/{uid}.activo == false`)
MUST NOT block the close and MUST NOT appear in `sinConfirmar`. The exclusion MUST be
recorded in the audit trail for that close.

#### Scenario: Deactivated participant excluded (affirmative)

- GIVEN `uid_luis` is in `participantes`, is unsynchronized, and `usuarios/uid_luis.activo == false`
- WHEN `cerrarSesion` evaluates `sinConfirmar` without `forzar`
- THEN `uid_luis` is absent from `sinConfirmar`, the close is not blocked by him, and the audit event records his exclusion

#### Scenario: Active-but-unsynchronized participant still blocks (negative counterpart)

- GIVEN `uid_luis` is unsynchronized and `usuarios/uid_luis.activo == true`
- WHEN `cerrarSesion` evaluates `sinConfirmar` without `forzar`
- THEN `uid_luis` IS present in `sinConfirmar` and the close is blocked

### Requirement: Block by default; `forzar` overrides

When `sinConfirmar` is non-empty and `forzar == false`, `cerrarSesion` MUST reject the
close, name the unsynchronized participants, and write a `CIERRE_BLOQUEADO` audit
event. When `forzar == true`, the close proceeds regardless of `sinConfirmar`, and the
resulting `SESION_CERRADA` audit event MUST include `forzado: true` and the full
`sinConfirmar` list.

#### Scenario: Blocked without forzar

- GIVEN `sinConfirmar == [{ uid: "uid_luis", nombre: "Luis Pérez" }]` and `forzar == false`
- WHEN `cerrarSesion` runs
- THEN it throws `HttpsError("failed-precondition", ..., { sinConfirmar })` and writes `CIERRE_BLOQUEADO` with `detalle: { sinConfirmar }`

#### Scenario: Forced close overrides and is audited (affirmative)

- GIVEN the same `sinConfirmar` and `forzar == true`
- WHEN `cerrarSesion` runs
- THEN the session closes, and `SESION_CERRADA`'s audit record has `forzado: true` and `sinConfirmar` listing every unsynchronized participant

#### Scenario: No unsynchronized participants — closes without forzar (negative counterpart)

- GIVEN `sinConfirmar == []` and `forzar == false`
- WHEN `cerrarSesion` runs
- THEN the session closes and `SESION_CERRADA` has `forzado: false`

### Requirement: Freeze and snapshot are atomic

The session's `estado -> "cerrada"`, `sucursales/{id}.sesionAbiertaId -> null`, and the
creation of `sucursales/{id}/historicos/{sesionId}` MUST occur in one transaction.
`historicos/{sesionId}` MUST match `resumen/actual` as computed by the synchronous
`recalcularResumen` call, at the instant of the freeze.

#### Scenario: Snapshot matches the final recompute

- GIVEN `recalcularResumen` completed with `totalUnidades: 1840`, `totalMonetario: 12450000`
- WHEN the freeze transaction commits
- THEN `historicos/{sesionId}` has the same `totalUnidades`, `totalMonetario`, and `porCategoria`

#### Scenario: Partial freeze never happens (negative)

- GIVEN the freeze transaction fails partway
- WHEN it is retried or aborted
- THEN either all three writes (`sesiones`, `sucursales`, `historicos`) landed, or none did — never a session marked `cerrada` without a matching `historicos` document

## Non-goals

- `crearCajero`, `actualizarCajero`, `desactivarCajero` — see `gestion-cajeros`.
- `reconciliarLineas` — see `reconciliacion-lineas`.
- Mutating an already-frozen session (one with `historicos/{sesionId}` written) — no such path exists.
