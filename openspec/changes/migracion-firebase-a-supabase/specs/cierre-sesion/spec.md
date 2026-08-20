# Delta for Cierre Sesión

`cerrarSesion` becomes the `cerrar_sesion` Postgres RPC (`SECURITY DEFINER`), per
#27 D1. RF-16's predicate becomes a generated column (#27 D6). `historicos` becomes
a view (#23 D7) — the freeze no longer writes a snapshot.

## MODIFIED Requirements

### Requirement: Authorization is admin-only

`cerrar_sesion` (a Postgres RPC, `SECURITY DEFINER`) MUST verify the caller is admin
by executing `private.es_admin()` before performing any read beyond identity, rather
than trusting a JWT claim. Because the RPC runs as table owner and would otherwise
bypass RLS entirely, this in-function check is the only authorization gate.

(Previously: called `exigirAdmin(req)`, reading `req.auth.token.rol` from a Cloud
Functions request, before any Firestore read.)

#### Scenario: Unauthenticated caller rejected (affirmative)

- GIVEN a call to `cerrar_sesion` with no valid Supabase session
- WHEN it executes
- THEN it is rejected before the function body runs (no `auth.uid()`)

#### Scenario: Cajero caller rejected (negative discriminator — proves the in-function check, not just connection auth)

- GIVEN an authenticated cajero calling `cerrar_sesion` for a sesion they can
  otherwise SELECT
- WHEN the RPC runs
- THEN `private.es_admin()` evaluates false and it raises before touching `sesiones`

#### Scenario: Admin caller proceeds (affirmative)

- GIVEN an authenticated admin
- WHEN `cerrar_sesion` is called with a valid, open `sesion_id`
- THEN the authorization check passes and validation proceeds

### Requirement: Input is validated by RPC parameter types and CHECK constraints

`cerrar_sesion(sesion_id uuid, forzar boolean DEFAULT false)` MUST rely on Postgres
parameter typing, not a hand-written zod schema (#27 D5).

(Previously: validated against `cerrarSesionSchema`, a zod contract in
`contracts/schemas/`.)

#### Scenario: Missing sesion_id is a call-shape error (affirmative)

- GIVEN a call omitting the required `sesion_id` parameter
- WHEN `cerrar_sesion` is invoked
- THEN it is rejected before the function body runs

#### Scenario: forzar omitted defaults to false (affirmative, unchanged behavior)

- GIVEN a call supplying only `sesion_id`
- WHEN `cerrar_sesion` runs
- THEN `forzar` resolves to `false`

### Requirement: RF-16 synchronization predicate is a generated column

`sesion_participantes.sincronizado` MUST be
`GENERATED ALWAYS AS (confirmado_en IS NOT NULL AND confirmado_en >=
coalesce(ultimo_aporte_servidor, '-infinity')) STORED` (#27 D6). `cerrar_sesion`
MUST derive `sinConfirmar` as `sesion_participantes WHERE sesion_id = $1 AND NOT
sincronizado`, never recomputing the comparison inline.

(Previously: computed inline, comparing
`sincronizacion/estado.participantes.{uid}.confirmadoEn >= .ultimoAporteServidor`
inside the callable; `docs/diseno/08-contratos-y-cloud-functions.md:211`'s
truthiness-only check was the corrected predicate this requirement fixed.)

#### Scenario: Confirmed and never re-contributed — synchronized (affirmative)

- GIVEN `confirmado_en` is set with no later `ultimo_aporte_servidor`
- WHEN `sincronizado` is read for that row
- THEN it is `true`

#### Scenario: Confirmed, then contributed again — stale, reflected automatically (negative discriminator, same defect class as the original doc-08 bug)

- GIVEN `confirmado_en = 11:00` and a later aporte sets `ultimo_aporte_servidor = 11:05`
- WHEN `sincronizado` is read
- THEN it is `false` — the column recomputes automatically; no application code can
  forget the comparison

#### Scenario: Never confirmed — unsynchronized (affirmative)

- GIVEN `confirmado_en IS NULL`
- WHEN `sincronizado` is read
- THEN it is `false`

### Requirement: Deactivated participants are excluded from the predicate

A participant with `perfiles.activo = false` MUST NOT block the close and MUST NOT
appear in `sinConfirmar`; the exclusion MUST be recorded by the audit trigger.

(Previously: read `usuarios/{uid}.activo == false`, and the exclusion was recorded
by a manual audit write.)

#### Scenario: Deactivated participant excluded (affirmative)

- GIVEN a participant with `sincronizado = false` and `perfiles.activo = false`
- WHEN `cerrar_sesion` evaluates `sinConfirmar` without `forzar`
- THEN that participant is absent from `sinConfirmar`, does not block the close, and
  the resulting audit event records the exclusion

#### Scenario: Active-but-unsynchronized participant still blocks (negative counterpart)

- GIVEN a participant with `sincronizado = false` and `perfiles.activo = true`
- WHEN `cerrar_sesion` evaluates `sinConfirmar` without `forzar`
- THEN that participant IS present in `sinConfirmar` and the close is blocked

### Requirement: Block by default; `forzar` overrides

When `sinConfirmar` is non-empty and `forzar = false`, `cerrar_sesion` MUST raise an
exception naming the unsynchronized participants and MUST NOT flip `estado`. When
`forzar = true`, the close proceeds regardless, and the resulting audit event MUST
record `forzado = true` and the full `sinConfirmar` list.

(Previously: threw `HttpsError("failed-precondition", ...)` and wrote a
`CIERRE_BLOQUEADO` audit event via a manual `registrarAuditoria` call.)

#### Scenario: Blocked without forzar

- GIVEN one unsynchronized, active participant and `forzar = false`
- WHEN `cerrar_sesion` runs
- THEN it raises an exception naming that participant and `estado` is unchanged

#### Scenario: Forced close overrides and is audited (affirmative)

- GIVEN the same unsynchronized participant and `forzar = true`
- WHEN `cerrar_sesion` runs
- THEN the sesion closes and the resulting audit event's detail records
  `forzado: true` and lists every unsynchronized participant

#### Scenario: No unsynchronized participants — closes without forzar (negative counterpart)

- GIVEN `sinConfirmar` is empty and `forzar = false`
- WHEN `cerrar_sesion` runs
- THEN the sesion closes and the audit event records `forzado: false`

### Requirement: Closing is a single-statement transaction; no snapshot write

`cerrar_sesion` MUST set `sesiones.estado = 'cerrada'` inside the RPC's implicit
transaction. It MUST NOT write a separate historicos row — `vista_historicos`
computes the closed-session snapshot live from `sesiones`/`lineas`/`categorias`,
which become immutable once `estado = 'cerrada'` blocks further writes.

(Previously: a manual multi-write transaction set `estado -> "cerrada"`, cleared
`sucursales/{id}.sesionAbiertaId`, and created
`sucursales/{id}/historicos/{sesionId}` — three writes required to be atomic
together.)

#### Scenario: vista_historicos reflects the close immediately (affirmative)

- GIVEN a sesion just closed by `cerrar_sesion`
- WHEN `vista_historicos` is queried
- THEN it includes that sesion's final `lineas` aggregation, with no separate
  snapshot write having occurred

#### Scenario: A closed sesion's lineas cannot change afterward (negative counterpart — proves the view can never diverge)

- GIVEN a closed sesion
- WHEN any write is attempted against its `lineas` or `aportes`
- THEN it is rejected by RLS (`private.sesion_abierta()` is false) — mutation being
  impossible is what makes the live view safe to trust as a snapshot

## Non-goals unchanged

`crearCajero`/`actualizarCajero`/`desactivarCajero`/`reactivarCajero` — see
`gestion-cajeros`. `reconciliacion-lineas` — removed in full, see its delta.
Mutating an already-closed session — no such path exists.
