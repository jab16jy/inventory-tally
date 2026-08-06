# Design — complete-cloud-functions

Phase: `sdd-design` · Store: `hybrid` · Engram: `sdd/complete-cloud-functions/design`
Depends on: `proposal.md`, `exploration.md`. Scope fixed at 5 slices; `purgarAuditoria` out.

> Size note: this artifact exceeds the 800-word default budget because the launch prompt
> demanded resolution of seven blocking architectural questions with explicit alternative
> comparison, doc-correction lists and per-slice line estimates. Explicitly requested
> explanation is not debt.

---

## Technical Approach

Every slice follows the shape already shipped in `abrir-sesion.ts`: a testable
`…Impl(db, …)` plain async core + a thin `onCall`/`onSchedule` wrapper that only does
`exigirAdmin` → `validar` → delegate. Reuse is mandatory: `lib/auditoria.ts`,
`lib/validar.ts`, `lib/exigir-admin.ts`, `shared/services/calculadora.ts`.

Load-bearing SDK fact, verified against the installed types
(`node_modules/@google-cloud/firestore/types/firestore.d.ts:767`):

> `Transaction.get(query)` — **"Holds a pessimistic lock on all returned documents."**

That single line decides Q1, Q4 and Q5. Firestore server transactions are pessimistic:
any transaction that reads a document blocks every concurrent transaction that writes it.
`onAporteEscrito` writes `resumen/actual` on **every** aporte, so _any_ transaction that
reads `resumen/actual` serialises against every aporte on that session — for free, with no
extra machinery.

---

## Architecture Decisions

### D-1 (Q1) — Clearing `dirty` safely: compare-and-clear on a monotonic marker

| Option                                                     | Mechanism                                                                                 | Verdict                                                                                                                                                                                                                                                                                                          |
| ---------------------------------------------------------- | ----------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| (a) read-write tx spanning the recompute                   | `tx.get(lineasQuery)` inside the tx                                                       | **Rejected.** The tx holds a pessimistic lock on **all ~60 `lineas` of the session** for its whole duration, blocking every concurrent aporte trigger tx. That is exactly the contention doc 05 §5 invented `dirty` to avoid — the fix would reintroduce the bug it fixes, on the hot counting path, every 30 s. |
| (b) compare-and-clear on a monotonic marker                | new `resumen.marcaAportes` counter, bumped by the trigger in the tx that changes `lineas` | **CHOSEN.**                                                                                                                                                                                                                                                                                                      |
| (c) clear conditionally on the `dirty` value at read start | boolean CAS                                                                               | **Rejected — provably insufficient.** `dirty` was `true` at read start and is `true` at write time in _both_ the safe case and the raced case: an aporte re-sets it to the same value. A boolean carries no evidence of change. This is why the marker must be monotonic, not a flag.                            |

**Chosen ordering rule.**

```
1. resumenRef.get()                      → if !dirty: skip.  Capture M = marcaAportes ?? 0
2. lineasQuery.get()                     → outside any tx. A single query .get() is already
                                           a consistent snapshot at one read time, so a
                                           read-only tx buys nothing. No locks taken.
3. db.runTransaction(tx =>               → ONE doc read, ONE doc write. Serialises against
     tx.get(resumenRef).marcaAportes === M   every aporte tx, because every aporte tx writes
       ? tx.set(resumenRef, {…, dirty:false, marcaAportes:M})   // full overwrite, no merge
       : /* nothing */)                     resumen/actual.
```

`M` unchanged across steps 1→3 proves no aporte-bearing transaction committed during the
entire read window, because the marker is bumped **inside** the same transaction that
mutates `lineas`. If `M` changed, the cron writes nothing and `dirty` stays `true`; the
next cycle (≤30 s) recomputes. The summary is never written stale, and `dirty:false` never
lies.

**Trigger change (one line, `on-aporte-escrito.ts:92`):**
`tx.set(resumenRef, { dirty: true, marcaAportes: FieldValue.increment(1) }, { merge: true })`.
A spuriously re-executed trigger can only over-count `M`, causing one extra recompute —
the safe direction. It can never under-count.

**Invariant I-M (new, applies to every writer of `lineas`, not just the trigger):** any
transaction that changes a `lineas` document MUST, in the same transaction, set
`resumen.dirty = true` and `marcaAportes: increment(1)`. Two writers obey it: the trigger
and `reconciliarLineas` (D-6).

**Why the summary write is a full `set` without `merge`.** `set(…, {merge:true})` merges
nested maps recursively, so a category whose `cantidadTotal` returns to 0 (dropping out of
the `cantidadTotal > 0` query) would keep a stale `porCategoria` entry forever. `resumen`
is 100 % derived → a full overwrite is the correct semantic. `marcaAportes` is re-written
explicitly from the captured `M`.

**Failure mode (named, accepted):** starvation. Under aportes landing continuously faster
than the ~200 ms line-read window, `M` always moves and `dirty` is never cleared, so the
admin dashboard freezes at the last good value (stale but never wrong). Ceiling accepted
because real load is 1–2 counts/month with a handful of cajeros. Upgrade path if it ever
bites: fall back to option (a) restricted to a single session, or shard `resumen`
(doc 05 §5's own growth path). Mark with a `ponytail:` comment naming both.

**Doc corrections (AGENTS.md §0):** doc 08 §4's pseudocode (lines 283–323) is wrong and is
replaced by the three-step rule above; doc 04 §3 `resumen/actual` gains `marcaAportes`;
doc 05 §3's trigger snippet gains the counter bump. Same commit as slice 1.

### D-2 (Q2) — `calcularResumen(lineas)`, not `recalcularResumen(db, sesionId)`

**The proposal's `(db, sesionId)` signature is superseded.** The two callers own _different_
transaction boundaries: the cron reads `lineas` outside any transaction (D-1), while
`cerrarSesion` must read them **inside** its freeze transaction (D-4). A helper that does
its own read-and-write would force `cerrarSesion` back into doc 08's torn-snapshot bug.
Passing the already-read lineas is one parameter and deletes the problem.

| Layer                    | What                                                                                                                                                                    | Where                                                                                                                                                                                                                                     |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Pure arithmetic          | `subtotal`, `totalUnidadesSesion`, `totalMonetarioSesion`                                                                                                               | **Already exists** in `packages/shared/src/services/calculadora.ts`. No new function.                                                                                                                                                     |
| Type widening only       | `type LineaSumable = Pick<LineaConteo, "cantidadTotal" \| "valorUnitario">` + widen those three signatures                                                              | `calculadora.ts`, ~4 lines. Behaviour-identical; `LineaConteo` still satisfies it, so existing callers and tests are untouched. Needed so `packages/functions` can pass a projection of a Firestore doc without a `LineaConteo` cast/lie. |
| Firestore-aware assembly | `calcularResumen(lineas: readonly QueryDocumentSnapshot[])` → `{ totalUnidades, totalMonetario, numCategoriasConConteo, categoriaMayor, categoriaMenor, porCategoria }` | **New**, `packages/functions/src/lib/resumen.ts` (~40 lines).                                                                                                                                                                             |

Ponytail calls made explicit:

- `categoriaMayor`/`categoriaMenor` stay as a ~8-line loop **inside** `calcularResumen`, NOT
  as a new `calculadora.ts` export: one caller, and `apps/web` reads them off `resumen/actual`
  rather than deriving them. A shared export would be an abstraction with one consumer.
- `numCategoriasConConteo` is `lineas.length` (the query already filters `cantidadTotal > 0`).
  No helper.
- No `Resumen` interface, no factory, no config object. The function returns an object literal.
- `recalculadoEn` / `dirty` / `marcaAportes` are added by the **caller**, not the helper —
  they are FieldValue sentinels and lifecycle state, not derived arithmetic. This is what
  lets the two callers differ (D-1 keeps `marcaAportes`; D-4 drops it, see below).

### D-3 (Q3) — RF-16 predicate and deactivated participants

Predicate, evaluated per uid in `sesiones/{id}.participantes`, against
`sesiones/{id}/sincronizacion/estado`:

```
sincronizado(uid) ⟺  e = participantes[uid]
                     e?.confirmadoEn != null
                     && e.confirmadoEn.toMillis() >= (e.ultimoAporteServidor?.toMillis() ?? 0)
```

A missing sync entry ⟹ **not** synchronized (conservative). In practice it cannot happen:
`participantes: arrayUnion(uid)` and `participantes[uid].ultimoAporteServidor` are written
in the _same_ trigger transaction, so presence in one implies presence in the other.

**Source of truth for "deactivated": the Firestore profile `usuarios/{uid}.activo === false`.
Not the custom claim, not both.** Justification:

1. It is a _business-state_ question about a third party, not an authorization decision.
   Doc 09 §2's "claims are the truth" rule governs authorizing the **caller**
   (`exigirAdmin` already does exactly that) — it does not govern reading someone else's
   employment status.
2. `disabled` is not a claim at all; it lives on the Auth user record, so "both" would mean
   `auth.getUser(uid)` **per participant** — N sequential Admin-SDK round trips for a fact
   the profile already carries.
3. The profile read is **already required** to build the `sinConfirmar` names (doc 08's
   `nombresDe`). One `db.getAll(...refs)` covers names and `activo` in a single round trip.
   Zero marginal cost.
4. **Ordering makes the flag conservative.** D-7 writes the profile flag _last_ in
   `desactivarCajero`, so `activo === false` implies Auth is already `disabled` and tokens
   already revoked. The flag can lag behind reality but never runs ahead of it — and lagging
   only blocks a close (recoverable with `forzar`, audited); it never silently drops a
   participant from the count.

Deactivation therefore **never freezes a session**: nothing in `desactivarCajero` touches
`sesiones`; the exclusion happens at read time inside `cerrarSesion`, and is audited.

**Exact `HttpsError` payload** — unchanged from doc 08 §3/§5 (the `packages/data` client
mapping at doc 08 §5 already destructures this shape; inventing a new one would be a
gratuitous break):

```ts
throw new HttpsError(
  "failed-precondition",
  "Hay cajeros con conteos sin sincronizar",
  { sinConfirmar: [{ uid: "uid_luis", nombre: "Luis Pérez" }] }, // nombre ?? uid
);
```

Audit, both branches:
`CIERRE_BLOQUEADO` → `detalle: { sinConfirmar: uid[], excluidosPorInactivo: uid[] }`.
`SESION_CERRADA` → `detalle: { forzado: boolean, sinConfirmar: uid[], excluidosPorInactivo: uid[] }`.

**Doc corrections:** doc 08 §3 lines 209–212 (`!sync.get(\`participantes.${uid}.confirmadoEn\`)`→ the two-part predicate + inactive exclusion) and doc 04 §3`sincronizacion/estado` gains
one line stating the predicate. Same commit as slice 2.

### D-4 (Q4) — `cerrarSesion`: one transaction, no torn state

Doc 08 §3 recomputes the summary **before** the freeze transaction (line 227). An aporte
landing in that window makes `historicos/{sesionId}` disagree with the frozen session. Fix:
**fold the recompute into the freeze transaction.**

```
Phase A — verification, outside any transaction
  get sesion (not-found → "not-found"; estado != "abierta" → "failed-precondition")
  get sincronizacion/estado ; db.getAll(usuarios/{uid} …)
  → sinConfirmar, excluidosPorInactivo   (D-3)
  if sinConfirmar.length && !forzar → audit CIERRE_BLOQUEADO (own tx), throw

Phase B — ONE db.runTransaction:  reads first, then writes
  reads : tx.get(sesionRef)                    ← re-check estado === "abierta"
          tx.get(lineasQuery)                  ← cantidadTotal > 0
  compute: calcularResumen(lineas)             ← D-2
  writes: tx.update(sesionRef,  { estado:"cerrada", cerradaEn, cerradaPor, forzado,
                                  sinConfirmarAlCerrar, totalUnidades: <recomputado> })
          tx.update(sucursalRef, { sesionAbiertaId: null })
          tx.create(historicosRef, { sesionId, cerradaEn, totalUnidades,
                                     totalMonetario, porCategoria })
          tx.set(resumenRef, { …resumen, recalculadoEn, dirty:false })   // full overwrite
          registrarAuditoria(tx, db, { tipo:"SESION_CERRADA", … })
```

- **Atomicity.** Five writes, one commit. A frozen session with no snapshot, or a snapshot
  with no freeze, is unrepresentable. No compensation branch is needed (unlike
  `abrirSesionImpl`'s D3 rollback, whose `sembrarLineas` genuinely cannot fit in a tx).
- **Race with a concurrent aporte.** `tx.get(lineasQuery)` locks the returned lineas and the
  aporte trigger tx reads/writes those same lineas plus `sesionRef` — so they serialise.
  Either the aporte commits first (and is inside the snapshot) or after (and the trigger's
  own I-4 guard sees `estado !== "abierta"` and returns). Nothing is lost, nothing is torn.
- **`totalUnidades` is rewritten from the recomputed value**, so the close doubles as a
  reconciliation and the session doc can never disagree with its own snapshot.
- **Idempotency of a retried close.** Two independent guards: the in-transaction re-read
  rejects `estado !== "abierta"` with `failed-precondition`, and `tx.create(historicosRef)`
  fails if the snapshot already exists. A retry after a _successful_ close is rejected; a
  retry after a _failed_ close sees the untouched original state and simply runs again.
- **`marcaAportes` is deliberately dropped** from the closed session's summary: the cron
  query filters `estado == "abierta"`, so a frozen session is never recomputed and the
  marker has no reader. Not carrying it avoids an extra read in the freeze transaction.
- **Why Phase A stays outside the transaction.** Pulling it in would lock N `usuarios` docs
  for no benefit: the RF-16 check asks "is anything still stuck in a client's local queue",
  and any aporte that lands between A and B _is already in Phase B's snapshot_ — it cannot
  be lost. A millisecond-stale confirmation flag cannot cost a count. It also keeps the
  slice splittable (see Delivery).

**Doc correction:** doc 08 §3 lines 227–248 replaced by the Phase A / Phase B shape.

### D-5 (Q5) — `reconciliarLineas`: authoritative vs derived, and how it does not fight

| Question               | Answer                                                                                                                                                                                                                                                                                                                                       |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Authoritative source   | the `aportes` subcollection — doc 08 §4: _"es posible porque los aportes son la fuente de verdad"_.                                                                                                                                                                                                                                          |
| Derived value compared | `lineas/{categoriaId}.cantidadTotal`.                                                                                                                                                                                                                                                                                                        |
| Inconsistency rule     | `cantidadTotalDesdeAportes(aportes) !== linea.cantidadTotal`. **Exact equality, zero tolerance** — money and counts are integers and `calculadora.ts` is exact by construction; a tolerance would hide the very trigger failure this cron exists to catch. `cantidadTotalDesdeAportes` **already exists** in `calculadora.ts` — nothing new. |
| Scope                  | `db.collection("sesiones").where("estado","==","abierta")`, **plus** an in-transaction re-read of `sesionRef` per linea, so a session that closes mid-scan is never mutated. The `estado` filter alone is a TOCTOU hole; the re-read closes it and mirrors the trigger's own I-4 guard.                                                      |

**What it writes (per inconsistent linea, one transaction):**

```
tx.get(sesionRef) → estado === "abierta" else return
tx.get(lineaRef), tx.get(aportesCollection)      // ≤ K docs, K = cajeros on that line
esperado = cantidadTotalDesdeAportes(aportes);  if (esperado === cantidadTotal) return
tx.update(lineaRef, { cantidadTotal: esperado,
                      aplicados:  { [uid]: cantidad … },   // FULL replacement
                      versiones:  { [uid]: version  … },   // FULL replacement
                      numAportantes: aportes.size,
                      actualizadaEn: serverTimestamp(), actualizadaPor: "reconciliacion" })
tx.update(sesionRef, { totalUnidades: FieldValue.increment(esperado - cantidadTotal) })
tx.set(resumenRef, { dirty:true, marcaAportes: increment(1) }, { merge:true })   // I-M
registrarAuditoria(tx, db, { tipo:"RECONCILIACION", sesionId, categoriaId,
                             cantidadAnterior: cantidadTotal, cantidadNueva: esperado,
                             origen: "cron" })
```

**`aplicados` and `versiones` must be rewritten — this is the part the docs omit and the
reason a naive fix re-breaks.** The trigger computes its delta against `aplicados[uid]`,
not against the event's `before`. Correcting only `cantidadTotal` leaves `aplicados` stale,
so the very next aporte from that uid applies a delta computed from a phantom baseline and
corrupts the total again. `tx.update` (not `set({merge:true})`) is required because it
replaces map fields wholesale — merge would keep entries for uids whose aporte no longer
exists. Audit field names mirror `APORTE_MODIFICADO` (doc 04 §3) rather than inventing a
parallel vocabulary.

**Not fighting a concurrent aporte:** compare _and_ correct live in the same read-write
transaction that reads `lineaRef` — the same document the trigger tx reads and writes — so
they serialise. Reading the aportes inside the transaction is what makes the comparison
sound; reading them outside would compare two unrelated points in time.

**Read-cost profile of the weekly scan:** `S` open sessions × 60 lineas × (1 sesión + 1 linea

- K aportes) reads. With S ≤ 5, K ≈ 3: **≈ 1 500 reads/week**, ~6 k/month against a free
  tier of 50 k/day. Negligible. `ponytail:` one transaction per linea unconditionally, no
  cheap pre-pass — the pre-pass would save ~40 % of a cost that is already noise, at the price
  of a second code path. Upgrade path if session count grows an order of magnitude: batch the
  scan by session with a cursor.

**Doc correction:** doc 08 §4 `reconciliarLineas` and doc 09 §5 "Detección de
inconsistencias" both say only "corrige recalculando"; both gain the `aplicados`/`versiones`
rewrite, the `totalUnidades` delta and the I-M re-mark.

### D-6 (Q6) — Cajero lifecycle across three stores with no cross-store transaction

The governing distinction: **`crearCajero` step 1 is non-idempotent (it allocates a uid and
consumes an email), so it needs true compensation. Every other step in all three callables
is an idempotent total overwrite, so it needs convergent retry, not compensation.** Writing
a compensator for an idempotent step just adds a step that can itself fail.

| Callable           | Ordering                                                                                                                       | Partial-failure rule                                                                                                                                                                                                                                                                                                                                    |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `crearCajero`      | 1 `auth.createUser` → 2 `setCustomUserClaims` → 3 one Firestore tx: `tx.create(usuarios/{uid})` + `registrarAuditoria`         | Steps 2–3 wrapped in `try/catch`; on any failure **`auth.deleteUser(uid)` then rethrow**. Without it the email is permanently consumed and every retry dies with `already-exists`, locking the admin out of creating that cajero — and the orphan can sign in with no claims. Same compensation shape already shipped in `abrir-sesion.ts:99-109` (D3). |
| `actualizarCajero` | 1 `setCustomUserClaims` (full object) → 2 `revokeRefreshTokens` → 3 one Firestore tx: profile update + audit                   | **No compensation. Retry converges.** All three steps are total overwrites of a payload the client supplies in full, so re-invoking with the same input reaches the intended state from any partial position. Failure ⇒ `internal`; the documented recovery is "call it again".                                                                         |
| `desactivarCajero` | 1 `updateUser({ disabled: true })` → 2 `revokeRefreshTokens` → 3 one Firestore tx: `{ activo: false }` + `USUARIO_DESACTIVADO` | Same convergent-retry rule.                                                                                                                                                                                                                                                                                                                             |

Why claims **before** profile in `actualizarCajero`: claims are the authorization truth
(doc 09 §2). A window where authority is already the admin's intended new value and the UI
still shows the old one is the _intended_ state arriving early. The reverse window — UI
promising a role the rules do not grant — produces `permission-denied` on every action the
UI just offered.

Why the profile is written **last** in `desactivarCajero`: it makes `activo:false` a
conservative signal, which is precisely what D-3 relies on. A crash between steps 2 and 3
leaves the cajero locked out of Auth but still counted by RF-16 — the close blocks, the
admin uses `forzar` (audited) and retries the deactivation. The failure direction never
loses a count and never silently excludes anyone.

`desactivarCajero` deliberately **does not clear custom claims**: `disabled: true` plus
revoked refresh tokens already deny everything, so clearing claims is a third failure point
for zero security gain.

**Token-revocation semantics (residual risk, named).** `revokeRefreshTokens` invalidates
refresh tokens; the user's _current_ ID token stays cryptographically valid until it
expires (≤1 h) and Firestore Security Rules do **not** check revocation automatically. So
doc 09's A-6 is mitigated, not eliminated. Bounded because that token can only write the
user's own `aportes` and their own `confirmadoEn`, and the client's `idTokenChanges`
listener signs them out at the next refresh attempt. Upgrade path if the window ever
matters: carry a `revocadoEn` claim/doc and compare it against `request.auth.token.auth_time`
in the rules. Recorded, not built.

**Password policy — code/doc divergence found.** Doc 09 §2 requires "mínimo 8 caracteres con
al menos un número (validado en la callable)"; `contracts/schemas/crear-cajero.schema.ts:7`
is `z.string().min(8)` only. Per AGENTS.md §0 the doc wins → the schema gains `.regex(/\d/)`
plus its test case, in slice 3. This is trust-boundary validation and is not negotiable
under ponytail.

### D-7 (Q7) — Scheduled-function wiring and testability

```ts
// packages/functions/src/scheduled/recalcular-resumenes.ts
export async function recalcularResumenesImpl(db: Firestore): Promise<void> { … }

export const recalcularResumenes = onSchedule(
  { schedule: "every 30 seconds", region: "us-central1" },   // see Open Question OQ-1
  async () => { await recalcularResumenesImpl(getFirestore()); },
);
```

`onSchedule(options, handler)` from `firebase-functions/v2/scheduler`, verified against the
installed `firebase-functions@5.1.1` types (`lib/v2/providers/scheduler.d.ts:65`;
`schedule: string` documented as "Unix Crontab or AppEngine syntax").

- **Same convention as `abrirSesionImpl` / `procesarAporteEscrito`**: all logic sits in the
  exported `…Impl(db)` plain async function; the `onSchedule` wrapper is two lines with zero
  branching, so the functions emulator stays unnecessary. Tests import `…Impl` and run under
  `emulators:exec --only firestore,auth`, exactly like `abrir-sesion.test.ts`.
- Returns `void`; tests assert Firestore state directly (the existing convention). No return
  payload invented for the sake of assertions.
- `reconciliarLineas`: `{ schedule: "every monday 03:00", region: "us-central1" }`.
  **No `timeZone`** — the default is UTC and nobody cares which quiet hour a weekly
  reconciliation runs in. `ponytail:` one config value that would never change.
- `index.ts` gains exactly two export lines. No barrel file, no registry, no wiring layer.

---

## Data Flow

```
aporte (cliente)                                   ← lo único que el cliente escribe
    │
    ▼  onAporteEscrito · UNA transacción
 lineas/{cat}  ─┬─→ sesiones/{id}.totalUnidades  (+Δ, arrayUnion participantes)
                ├─→ resumen/actual { dirty:true, marcaAportes:+1 }   ← el marcador (I-M)
                ├─→ sincronizacion/estado.participantes[uid].ultimoAporteServidor
                └─→ auditoria/{e}

recalcularResumenes (cron)              cerrarSesion (callable)
 1 get resumen → dirty? M=marca          A  RF-16 fuera de tx: sync + getAll(usuarios)
 2 get lineas  (snapshot, sin locks)        → sinConfirmar / excluidosPorInactivo
 3 tx: marca===M ?                       B  UNA tx: get sesion + get lineas
       set(resumen, calcularResumen(…)      → calcularResumen(lineas)   ← mismo helper
            + dirty:false + marca:M)        → sesion · sucursal · historicos
     : nada (dirty sigue true)              · resumen · auditoria

reconciliarLineas (cron semanal, sólo sesiones abiertas)
 por línea, UNA tx: get sesion+linea+aportes → cantidadTotalDesdeAportes
   ≠ ? update(linea{cantidadTotal,aplicados,versiones}) + sesion.totalUnidades
       + resumen{dirty,marcaAportes}  (I-M) + auditoria RECONCILIACION
```

---

## File Changes

| File                                                                           | Action        | Slice | Description                                                                                                                          |
| ------------------------------------------------------------------------------ | ------------- | ----- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `packages/shared/src/services/calculadora.ts`                                  | Modify        | 1     | Add `LineaSumable` alias, widen 3 signatures. No new function, no behaviour change.                                                  |
| `packages/functions/src/lib/resumen.ts`                                        | Create        | 1     | `calcularResumen(lineas)` → derived summary fields.                                                                                  |
| `packages/functions/src/scheduled/recalcular-resumenes.ts`                     | Create        | 1     | `recalcularResumenesImpl` + `onSchedule` wrapper.                                                                                    |
| `packages/functions/src/triggers/on-aporte-escrito.ts`                         | Modify        | 1     | Line 92: add `marcaAportes: increment(1)` (I-M).                                                                                     |
| `packages/functions/test/lib/resumen.test.ts`                                  | Create        | 1     | Summary arithmetic, empty session, extremes, dropped category.                                                                       |
| `packages/functions/test/scheduled/recalcular-resumenes.test.ts`               | Create        | 1     | Skip-when-clean, happy path, **race test: mutate a linea + bump marca between steps 2 and 3 → nothing written, `dirty` stays true**. |
| `docs/diseno/{04,05,08}.md`                                                    | Modify        | 1     | See doc-correction list.                                                                                                             |
| `packages/functions/src/lib/sincronizacion.ts`                                 | Create        | 2a    | `verificarSincronizacion(db, sesionId, participantes)` → `{ sinConfirmar, excluidosPorInactivo }`.                                   |
| `packages/functions/src/callables/cerrar-sesion.ts`                            | Create        | 2b    | Phase A + Phase B (D-4).                                                                                                             |
| `packages/functions/test/{lib/sincronizacion,callables/cerrar-sesion}.test.ts` | Create        | 2a/2b | RF-16 matrix; freeze/snapshot atomicity; retried close.                                                                              |
| `docs/diseno/{04,08}.md`                                                       | Modify        | 2     | RF-16 predicate; Phase A/B shape.                                                                                                    |
| `contracts/schemas/crear-cajero.schema.ts` (+`.test.ts`)                       | Modify        | 3     | `passwordTemporal` gains `.regex(/\d/)` (doc 09 §2).                                                                                 |
| `packages/functions/src/callables/crear-cajero.ts`                             | Create        | 3     | Create + claims + profile/audit tx + `deleteUser` compensation.                                                                      |
| `contracts/schemas/{actualizar,desactivar}-cajero.schema.ts` (+`.test.ts`)     | Create        | 4     | See Interfaces.                                                                                                                      |
| `contracts/schemas/index.ts`                                                   | Modify        | 4     | Two export pairs.                                                                                                                    |
| `packages/functions/src/callables/{actualizar,desactivar}-cajero.ts`           | Create        | 4     | D-6 ordering.                                                                                                                        |
| `packages/functions/src/scheduled/reconciliar-lineas.ts`                       | Create        | 5     | `reconciliarLineasImpl` + `onSchedule` wrapper.                                                                                      |
| `docs/diseno/{08,09}.md`                                                       | Modify        | 3, 5  | `crearCajero` compensation; reconciliation completeness.                                                                             |
| `packages/functions/src/index.ts`                                              | Modify        | 1–5   | +6 export lines total, one per slice.                                                                                                |
| `infra/firestore.rules` · `infra/firestore.indexes.json`                       | **No change** | —     | Verified per slice below.                                                                                                            |

### Rules / index verification (all 5 slices)

| Slice | Queries used                                                               | New index?                                                                                                           | Rules?                                                                                                                                   |
| ----- | -------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| 1     | `sesiones where estado=="abierta"`; `lineas where cantidadTotal>0`         | No — single-field equality/inequality, automatic index. (`sesiones estado ASC, abiertaEn DESC` also already exists.) | No. All writes are Admin SDK, which bypasses rules. `marcaAportes` lands inside `resumen/*`, already `read: esAdmin()` / `write: false`. |
| 2     | same lineas query; direct doc gets; `db.getAll(usuarios/…)`                | No — document reads.                                                                                                 | No. `historicos` already `read: esAdmin()`, `sesiones` already `write: false` (callables write via Admin SDK).                           |
| 3, 4  | direct doc writes to `usuarios/{uid}`                                      | No.                                                                                                                  | No. `usuarios` is already `write: if false` for clients (A-5); the callables use the Admin SDK.                                          |
| 5     | `sesiones where estado=="abierta"`; unfiltered `aportes` subcollection get | No — no composite predicate.                                                                                         | No.                                                                                                                                      |

**Net: zero `infra/` changes across the whole change. `npm run test:rules` is not triggered.**

---

## Interfaces / Contracts

```ts
// contracts/schemas/actualizar-cajero.schema.ts
export const actualizarCajeroSchema = z.object({
  uid: z.string().min(1),
  nombre: z.string().min(1),
  rol: z.enum(["admin", "cajero"]),
  sucursalesAsignadas: z.array(z.string()).max(10),
});
```

Full replacement, every field required — **not** a partial/optional patch.
`setCustomUserClaims` replaces the entire claims object anyway, so a partial update would
need a read-modify-write across two stores; a total overwrite is what makes D-6's
convergent-retry recovery rule true. `correo` is excluded: changing the sign-in address is a
different operation (re-verification, A-6) and doc 08 §2 does not list it.

```ts
// contracts/schemas/desactivar-cajero.schema.ts
export const desactivarCajeroSchema = z.object({ uid: z.string().min(1) });
```

No `motivo`, no `fecha`, no soft/hard flag — not in any design doc. YAGNI.

Error codes (doc 08 §3): `unauthenticated`, `permission-denied`, `invalid-argument` for all
four callables; `+ not-found` (session / uid absent) and `failed-precondition` (session not
open, RF-16 block) for `cerrarSesion`; `+ already-exists` for `crearCajero`; `+ not-found`
for `actualizar`/`desactivarCajero`; `internal` for a partial multi-store failure (D-6).

---

## Testing Strategy

| Layer                        | What                                                                                                                                                                                                                                                                                                                    | Approach                                                                                                                                                                                                       |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Contract (unit)              | zod schemas: valid, each rejection branch, `forzar` default, password digit rule                                                                                                                                                                                                                                        | `contracts/schemas/*.test.ts`, co-located, no emulator.                                                                                                                                                        |
| Core (emulator)              | `calcularResumen`, `recalcularResumenesImpl`, `verificarSincronizacion`, `cerrarSesionImpl`, cajero callables, `reconciliarLineasImpl`                                                                                                                                                                                  | Plain async fn against firestore+auth emulators — the shipped convention (`abrirSesionImpl`, `procesarAporteEscrito`). `emulators:exec --config ../../infra/firebase.json --only firestore,auth "vitest run"`. |
| Race (emulator, RED-first)   | **D-1**: commit a `lineas` mutation + `marcaAportes` bump between step 2 and step 3 → assert nothing written and `dirty` still true. **D-4**: `tx.create(historicos)` on a retried close. **D-5**: seed a linea whose `cantidadTotal` disagrees with its aportes → assert `aplicados` is rewritten, not just the total. | Deterministic interleaving via a spy on the read (same `vi.spyOn` technique as `abrir-sesion.test.ts:90`), not timing.                                                                                         |
| Negative + affirmative pairs | every RF-16 branch: unsynchronized blocks; stale-confirmation (`confirmadoEn < ultimoAporteServidor`) blocks; `forzar` overrides and audits; deactivated participant is excluded **and** the close succeeds                                                                                                             | AGENTS.md §2: a negative test that would also pass with the rule broken proves nothing.                                                                                                                        |
| Compensation                 | `crearCajero`: force step 2 to throw → assert the Auth user is gone and a retry with the same email succeeds.                                                                                                                                                                                                           | `vi.spyOn` on `setCustomUserClaims`.                                                                                                                                                                           |
| Rules                        | Not applicable — no `infra/firestore.rules` change.                                                                                                                                                                                                                                                                     | —                                                                                                                                                                                                              |

---

## Threat Matrix

**N/A** — this change introduces no routing, shell command, subprocess, VCS/PR automation,
executable-file classification, or process-integration boundary. It is server-side
Firestore/Auth logic behind existing `onCall`/`onSchedule` entry points.

Security surface that _is_ touched, mapped to doc 09's existing model (no new threat class):
A-5 (privilege escalation — claims written only by the Admin SDK behind `exigirAdmin`),
A-6 (revoked-token window — residual risk named and bounded in D-6),
A-10 (monetary separation — `calcularResumen` writes only to `resumen/actual` and
`historicos/{sesionId}`, both `read: esAdmin()`),
A-11 (self-confirmation — D-3 strengthens the server-side revalidation the doc calls the
real defence).

---

## Doc Corrections (AGENTS.md §0 — no divergence left alive)

| #   | Document                              | Correction                                                                                                                                                                                       | Slice |
| --- | ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----- |
| 1   | `08` §4 lines 283–323                 | `recalcularResumenes` pseudocode reads `lineas` then writes outside a transaction → replaced by D-1's three-step marker compare-and-clear. **The doc is wrong; this is the defect being fixed.** | 1     |
| 2   | `04` §3 `resumen/actual`              | Add `marcaAportes` to the schema.                                                                                                                                                                | 1     |
| 3   | `05` §3 trigger snippet (line 162)    | Trigger also bumps `marcaAportes` in the same transaction; state invariant I-M.                                                                                                                  | 1     |
| 4   | `08` §3 lines 209–212                 | RF-16 predicate: `confirmadoEn >= ultimoAporteServidor`, plus exclusion of `usuarios/{uid}.activo === false`.                                                                                    | 2     |
| 5   | `08` §3 lines 227–248                 | Recompute moves **inside** the freeze transaction (Phase A / Phase B).                                                                                                                           | 2     |
| 6   | `04` §3 `sincronizacion/estado`       | One line defining the synchronized predicate.                                                                                                                                                    | 2     |
| 7   | `08` §3 `crearCajero` snippet         | Add the `auth.deleteUser` compensation on post-create failure.                                                                                                                                   | 3     |
| 8   | `08` §4 `reconciliarLineas` + `09` §5 | The correction also rewrites `aplicados`/`versiones`, adjusts `sesiones.totalUnidades` and re-marks the summary (I-M).                                                                           | 5     |
| 9   | `08` §2/§4, `05` §5, `05` §7 T-5      | **Conditional on OQ-1** — cron cadence if 30 s proves unsupported.                                                                                                                               | 1     |

Code correction (doc wins, code changes): `crear-cajero.schema.ts` gains the digit rule per
doc 09 §2. Not a doc edit.

---

## Migration / Rollout

No data migration, no backfill, no feature flag. `marcaAportes` is absent on existing
`resumen/actual` documents and defaults to `0` via `?? 0` on both sides — a session already
mid-count converges on the first aporte after deploy. Rollback is per-PR revert +
redeploy, as in the proposal.

---

## Delivery — per-slice re-estimate against the 400-line budget

| Slice | Content                                                                                        | Re-estimate | vs. proposal | Note                         |
| ----- | ---------------------------------------------------------------------------------------------- | ----------- | ------------ | ---------------------------- |
| 1     | `lib/resumen.ts` 40 · cron 55 · trigger +1 · calculadora +4 · index +1 · tests 190 · docs 35   | **≈ 330**   | 350          | Under.                       |
| 2     | callable 120 · sincronizacion 45 · tests 200 · index +1 · docs 40                              | **≈ 405**   | 400          | **OVER — split, see below.** |
| 3     | callable 75 · schema +2 · schema test +12 · emulator test 130 · index +1 · docs 10             | **≈ 230**   | 290          | Under.                       |
| 4     | 2 callables 110 · 2 schemas 25 · 2 schema tests 50 · contracts index +4 · tests 170 · index +2 | **≈ 360**   | 390          | Under, tight.                |
| 5     | cron 90 · tests 140 · index +1 · docs 20                                                       | **≈ 250**   | 300          | Under.                       |
|       | **Total**                                                                                      | **≈ 1 575** | 1 730        |                              |

**Slice 2 split (the RF-16 / freeze cut the proposal pre-planned):**

- **2a — RF-16 verification (≈ 185 lines).** `packages/functions/src/lib/sincronizacion.ts`
  exporting `verificarSincronizacion(db, sesionId, participantes) → { sinConfirmar,
excluidosPorInactivo }`, plus its emulator test covering the full predicate matrix and the
  deactivated-participant exclusion. Lands with no caller — deliberate, and the same shape
  as the three zod contracts already in `contracts/` that shipped ahead of their consumers.
- **2b — freeze + snapshot (≈ 220 lines).** `callables/cerrar-sesion.ts` consuming 2a,
  the Phase B transaction, `HttpsError` payload, audit events, `index.ts` export, doc edits.

Ponytail note on the split: extracting one function into one file solely to satisfy the
review budget is the _only_ justification for it — it has a single caller and creates no
interface, no factory and no indirection. If the delivery strategy resolves to an accepted
`size:exception`, keep `verificarSincronizacion` inline in `cerrar-sesion.ts` and skip 2a.

`Decision needed before apply: Yes` (chain strategy not yet collected).
`Chained PRs recommended: Yes`. `400-line budget risk: Medium` (one slice over, cut point
pre-planned; slice 4 tight).

---

## Open Questions

- [ ] **OQ-1 (blocks slice 1 deploy, not its design) — is `"every 30 seconds"` a schedule
      Cloud Scheduler actually accepts?** The installed `firebase-functions` types accept any
      `string` ("Unix Crontab or AppEngine syntax"), so this cannot be settled from the
      repo, and no network tool was available in this phase to check the Cloud Scheduler
      docs. Unix-cron granularity is one minute and the App Engine syntax's smallest unit is
      minutes, so a sub-minute schedule is likely rejected at deploy time. **Verify in slice 1
      with `firebase deploy --only functions:recalcularResumenes --config infra/firebase.json`
      (or `--dry-run`).** Decided fallback if rejected: `"every 1 minutes"`, and doc
      corrections #9 follow — including doc 05 §7's acceptance test **T-5 ("Resumen converge
      en < 60 s"), which a 1-minute cron cannot guarantee** and which must be restated as
      "< 90 s". Nothing else in the design changes: D-1's correctness is cadence-independent.
- [ ] **OQ-2 (non-blocking)** — `desactivarCajero` produces `USUARIO_DESACTIVADO`, which is
      already in `TipoEventoAuditoria` and doc 04 §3. `actualizarCajero` has **no** event
      type in either. Proposal: reuse `USUARIO_CREADO`? No — misleading. Either add
      `USUARIO_ACTUALIZADO` to `lib/auditoria.ts` + doc 04 §3 (2 lines, 1 doc correction), or
      accept that role/branch changes are unaudited. Recommendation: **add it** — RNF-08 and
      doc 09's "Completa" property make an unaudited privilege change indefensible. Confirm
      in `sdd-tasks`.
