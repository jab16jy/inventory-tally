# Cola Pendientes Offline Specification

## Purpose

Replaces Firestore's `persistentLocalCache` with an app-owned `indexedDB` queue per
#26 (CLOSED D1-D5). `supabase-js` has no offline cache equivalent — this is why the
capability exists.

## Requirements

### Requirement: A single `indexedDB` object store, keyed by (sesionId, categoriaId)

The queue MUST use one object store keyed by `(sesionId, categoriaId)`, holding
`{ cantidad, intentos }` — the latest pending value, not a log of every write
(#26 D1, H1: `cantidad` is absolute, not a delta, so only the last value matters).

#### Scenario: Two writes to the same categoria before sync collapse to one entry (affirmative)

- GIVEN a cajero types `30` then `35` for the same categoria while offline
- WHEN the queue is inspected before reconnecting
- THEN exactly one entry exists for that `(sesionId, categoriaId)` with `cantidad: 35`

### Requirement: Retry on `online` plus polling while the queue is non-empty

The system MUST retry queued writes on the browser `online` event AND poll every
10-15s while `pendientes > 0` — `online`/`offline` alone are not reliable signals
(#26 D2, H5: Background Sync is unavailable on Safari/iOS, roughly half the fleet).

#### Scenario: A queued write flushes without an online event, via polling (affirmative)

- GIVEN a pending entry and a connection that silently recovers without firing `online`
- WHEN the next poll interval elapses
- THEN the pending write is retried

### Requirement: Only the own-aporte view reflects the local queue; `observarLineas` stays server-only

`observarMiAporte`-equivalent MUST prioritize the local queue's pending value for
that categoria over the last Realtime-received value. `observarLineas` (team total)
MUST NOT incorporate any local queue value (#26 D3 — doc 05 §4's "Tú" vs "Equipo"
distinction).

#### Scenario: Own pending value shows instantly; team total does not (affirmative + negative pair)

- GIVEN a cajero enters `40` for a categoria while offline
- WHEN their own view and the team total are read immediately after
- THEN their own view shows `40` (from the queue) while the team total is unchanged until the server confirms

### Requirement: Network failure retries in place; server rejection removes the entry without silently zeroing pendientes

A network-level failure (fetch/`supabase-js` connection error) MUST leave the entry
queued for retry. A server rejection (RLS 403, `CHECK` 400) MUST remove the entry
from the retry queue, marked rejected, without the UI silently dropping to zero
pending — matching `firestore-conteo-repository.ts:173-179`'s behavior (#26 D4: a
silently lost aporte is worse than a banner that doesn't clear).

#### Scenario: A network error keeps the entry queued (affirmative)

- GIVEN a queued write and a `fetch` `TypeError`
- WHEN the retry attempt fails at the network level
- THEN the entry remains in the queue with `intentos` incremented

#### Scenario: A 403 from RLS removes the entry but surfaces the rejection (negative counterpart)

- GIVEN a queued write that RLS would reject (e.g. sesion closed mid-queue)
- WHEN the retry attempt receives a 403
- THEN the entry leaves the retry queue marked rejected, and the UI shows a
  rejection state — it does not silently report zero pending as if nothing happened

### Requirement: `pendientes` (RF-16) equals the local queue size

`observarEscriturasPendientes`'s interface MUST NOT change shape; its backing
mechanism changes from Firestore's `hasPendingWrites` metadata to counting
unconfirmed `indexedDB` entries (#26 D5).

#### Scenario: pendientes reflects queue size (affirmative)

- GIVEN 2 unconfirmed entries in the queue
- WHEN `observarEscriturasPendientes` is read
- THEN it reports `2`

### Requirement: `persistencia-monitor.ts` and its canary test are deleted, not ported

`apps/web/src/lib/persistencia-monitor.ts` (44 lines) and its dedicated canary test
MUST be deleted entirely — its purpose (detecting a Firestore-SDK-internal fallback
string via `console.warn` monkey-patching) is meaningless without the Firestore SDK.

#### Scenario: No equivalent monitor is ported for supabase-js (affirmative — proves deliberate deletion, not oversight)

- GIVEN the migrated `apps/web/src/lib/` directory
- WHEN it is inspected
- THEN no file monkey-patches `console.warn` to detect an SDK-internal fallback string

## Non-goals

- The per-participant pending signal replacing `versiones[uid]` — see
  `esquema-postgres`. This capability is the local write queue only; it does not
  define the server-side confirmation signal, only how a cajero's own not-yet-sent
  value is shown locally.
- Access-token lifetime handling — resolved as low-stakes by this queue's existence
  (#26's closing note); no separate requirement here.
