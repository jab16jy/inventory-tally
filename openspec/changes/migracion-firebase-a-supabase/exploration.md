# Exploration: Firebase -> Supabase migration — codebase blast radius against closed decisions

Scope: map the CURRENT codebase against the decisions already closed in GitHub
issue #22 (map) and its four core tickets (#23 data model, #24 auth/claims,
#27 Cloud Functions translation, #28 RLS — all CLOSED). This does not
re-open those decisions. It surfaces what the migration actually touches,
what is ambiguous, and what is missing. Verified against current Supabase
docs fetched via ctx7 (not training data) for RLS, Realtime, and CLI/testing
mechanisms the closed decisions assume exist.

## 1. Blast radius of the seam

The map's premise (and `AGENTS.md:111`, `openspec/config.yaml:23`) is: "Sólo
`packages/data/firebase` toca el SDK de Firebase — lo impone ESLint" (only
packages/data/firebase touches the Firebase SDK — enforced by ESLint).

This claim is FALSE against the actual `eslint.config.js`. Reading
`eslint.config.js:1-98` in full: there are exactly two `no-restricted-imports`
blocks that ban `firebase`/`firebase-admin` imports —
`packages/shared/**` (`eslint.config.js:31-60`) and
`apps/web/src/ui/primitivos/**` (`eslint.config.js:67-97`). No rule
restricts Firebase imports anywhere else. No `dependency-cruiser` config
exists in the repo. The "only packages/data touches Firebase" property is
true today only by convention, not by tooling.

Real Firebase SDK usage outside `packages/data/src/firebase/`:

- `packages/functions/` (entire package, 20 files, 1292 lines in `src/`) —
  expected, gets replaced wholesale by #27.
- `tools/seed.ts:14-16` — firebase-admin/app, auth, firestore for local
  seeding. Needs a Supabase-admin equivalent.
- `apps/web/src/lib/firebase.ts:2-9` — legitimate DI construction point
  (app/auth/db built here, injected into packages/data repositories) — not a
  seam violation, it's the seam's other end.
- `apps/web/src/lib/funciones.ts:5-10` — same DI role for httpsCallable
  client; actual call happens inside the seam
  (`packages/data/src/firebase/firestore-admin-repository.ts:12-13,290`).
- `apps/web/src/lib/router.tsx:8` — signInWithEmailAndPassword/signOut.
  Deliberately outside the repository seam (auth actions never were part of
  ConteoRepository/AdminRepository per
  `packages/data/src/repositories/conteo-repository.ts:43-51,66-76`).
- `apps/web/src/state/useAuthState.ts:6,26,31` — onAuthStateChanged +
  getIdTokenResult().claims. Same deliberate boundary, but the claims content
  read here is exactly what #24 D1 eliminates — full rewrite.
- `apps/web/src/state/useVersionMinima.ts:8,53` — doc(db,"config","app") +
  getDoc(...) — a GENUINE seam leak: direct Firestore read from apps/web,
  bypassing both repositories entirely. Also the newest code in the repo
  (last commit, feat(web): pantalla de bloqueo por version minima) — the leak
  is not legacy drift, introduced under the currently-unenforced rule.
  Migration does not fix this leak unless design explicitly routes it through
  a repository.
- `apps/web/src/ui/admin/CajerosScreen.tsx:8`,
  `apps/web/src/ui/admin/CierreScreen.tsx:15`,
  `apps/web/src/ui/admin/SucursalesAdminScreen.tsx:9` (+ .test.tsx
  counterparts) — `import { FirebaseError } from "firebase/app"` for
  error-code branching. Becomes PostgrestError/AuthError checks — small,
  contained, 4 production files.
- `apps/web/src/ui/SucursalesScreen.tsx:28` — `import type { Auth }` — prop
  type only.

Conclusion: the seam claim is directionally true for the data layer but
never enforced, and one real leak (`useVersionMinima.ts`) already exists in
production code.

## 2. Inventory of what disappears (quantified against current code)

- `packages/functions/src/**` (10 callables + 1 trigger + 3 scheduled jobs,
  `packages/functions/src/index.ts:1-14`): #27 D1 reduces this to 1 Edge
  Function (3 ops) + RPCs + PostgREST + triggers. Measured **1292 lines**
  across 20 files — the closed ticket's own text (#27 D1/H2) says "1143
  líneas actuales", ~12% off from measured. Not a contradiction, but a
  stale/approximate figure that should not be quoted as exact downstream.
- `aportes.version`, `lineas.versiones`, `lineas.aplicados`,
  `lineas.numAportantes`, `retry: true` guard (#23 D2): idempotency guard at
  `packages/functions/src/triggers/on-aporte-escrito.ts:54-60` (135 lines
  total file). See CRITICAL finding below — `versiones` is not purely
  idempotency plumbing.
- `reconciliarLineas` (#23 D2): `packages/functions/src/scheduled/reconciliar-lineas.ts` — 92 lines.
- `recalcularResumenes`, `dirty`, `marcaAportes`, invariant I-M (#23 D6):
  `packages/functions/src/scheduled/recalcular-resumenes.ts` — 87 lines.
  `dirty`/`marcaAportes` also written by `on-aporte-escrito.ts:92-95` and
  read/cleared by `cerrar-sesion.ts:25-29,103` — confirmed 3-file blast
  radius, not 1.
- `setCustomUserClaims`, claims duplication, `normalizarSucursales` (#24
  D1): `apps/web/src/state/useAuthState.ts:17-20` (normalizarSucursales) and
  `:35-36` (token.claims.rol/sucursales) — confirmed present, file rewritten
  wholesale.
- `infra/firestore.rules` (144 lines, matches #28's own count exactly) +
  `infra/test/reglas.test.ts` — measured **359 lines** (matches #28 D6's
  count exactly) but contains **29** `it(...)` blocks by direct count, not
  the 27 the map states in #28 D6/#33 — minor discrepancy, immaterial to
  D6's requirement, should be re-counted not quoted when #33 scopes the
  translated suite.
- `contracts/schemas/*` (#27 D5): confirmed 9 schema files + 9 tests exist;
  D5 keeps `crear-cajero.schema.ts` + `desactivar-cajero.schema.ts` only —
  matches glob exactly (2 survive, 7+7 removed).
- `abrir-sesion.ts:97-109` manual compensation (#27 D4): file is 117 lines
  total, compensation block confirmed present at cited range.

### CRITICAL — `LineaConteo.versiones` is not purely Firestore idempotency plumbing

#23 D2 (closed) eliminates `version`/`versiones`/`aplicados`/`numAportantes`
and `reconciliarLineas`, reasoning that a synchronous Postgres trigger
removes the at-least-once/out-of-order problem (H2). That part is sound.

But code evidence shows `LineaConteo.versiones`
(`packages/shared/src/models/linea-conteo.ts:14`) is ALSO the sole data
source for three live product features, independent of idempotency:

- `packages/shared/src/services/progreso.ts:18-19` — `estaPendiente(linea, uid)`
  = `linea.versiones[uid] === undefined`. Doc comment
  (`progreso.ts:13-16`): "la única fuente de verdad para la barra de
  progreso, el filtro 'sólo pendientes' y el avance automático del teclado."
- `packages/shared/src/services/progreso.ts:30-40` — `siguientePendiente`
  (keyboard auto-advance) built on `estaPendiente`.
- `apps/web/src/ui/primitivos/BarraProgreso.tsx:5` — UI consumer, "47/60"
  progress indicator.
- `packages/shared/src/services/sincronizacion.ts:18-21` —
  `aporteConfirmado` (RF-16) compares `aporte.version` against
  `linea.versiones[aporte.uid]` with `>=` for cross-device confirmation.

D2's "lo que desaparece" inventory does not account for replacing the
per-uid "has this user's contribution reached the server" signal these four
functions depend on. `aportes` table survives (`(sesion_id, categoria_id, uid)`,
"única escritura del cliente"), so raw data exists — but nothing in
#23/#24/#27/#28 specifies the replacement shape for
`estaPendiente`/`aporteConfirmado`. Genuine design gap, not a contradiction
to relitigate — flag for sdd-design before `progreso.ts`/`sincronizacion.ts`
can be ported.

## 3. What must be built (cross-checked against ctx7 Supabase docs, not training data)

All mechanisms the closed decisions assume are CONFIRMED present:

- private-schema SECURITY DEFINER helpers with `set search_path = ''` —
  confirmed exact syntax in ctx7 RLS docs. Matches #24 D4.
- `security_invoker = true` views (Postgres 15+) — confirmed. Matches #28 D5.
- Public-schema default-deny is NOT declarative — confirmed Supabase
  requires explicit GRANT per role + ENABLE RLS per table. Matches #28 D2's
  three-piece construction (revoke + enable RLS + pg_class test) — no
  declarative catch-all exists, D2's framing is necessary, not
  over-engineering.
- UPDATE policies need USING + WITH CHECK, and a matching SELECT policy —
  confirmed. Relevant to `sesion_participantes` GRANT UPDATE
  (confirmado_en) — design/tasks must remember the accompanying SELECT
  policy or the UPDATE silently no-ops.
- `postgres_changes` requires `alter publication supabase_realtime add table <table>`,
  tables only, not views — confirmed. Matches #23 H3
  (justification for `lineas` being a real table).
- `postgres_changes` enforces RLS automatically — confirmed via Realtime
  docs' data-flow description. Corroborates #25 H1.
- DELETE events under RLS restrict old_record to PK-only columns even with
  REPLICA IDENTITY FULL — confirmed. This is STRICTER than #25 H4's framing
  ("RLS NO se aplica a eventos DELETE") — RLS DOES apply to deletes, it
  degrades payload to PK-only rather than skipping the event. Immaterial
  here only because #25 H4 already confirms no hard-deletes in scope, but
  #25's wording should not be copied verbatim into a design doc.
- pgTAP + local CLI testing (`supabase test db` local/--linked,
  `supabase migration new`/`db diff`/`db push`/`db reset`,
  `supabase functions serve`/`deploy`) — all confirmed current CLI surface.
  Concrete tool options for #33 (OPEN) to choose between.

No closed decision depends on a mechanism the fetched docs fail to confirm.

## 4. Test surface

- `packages/functions/test/**`: 19 files (10 callables + 3 scheduled + 1
  trigger + lib/* + bundle.test.ts + gitignore-env-example.test.ts), run via
  `firebase emulators:exec ... "vitest run"`
  (`packages/functions/package.json:12`). Nearly all untestable as-is post
  migration (code becomes triggers/RPC/CHECK/RLS/pg_cron). Only the
  surviving Edge Function (3 ops) keeps a plausible Deno-test equivalent.
- `packages/data/src/firebase/*.test.ts`: 4 files, 853 lines total
  (firestore-conteo-repository.test.ts 320, firestore-admin-repository.test.ts 269,
  mappers.test.ts 246, dispositivo.test.ts 18), all
  vi.mock("firebase/..."). Same testing PATTERN transfers to a
  mocked/local supabase-js client.
- `packages/data/src/fakes/*.ts`: FakeConteoRepository/FakeAdminRepository +
  tests (238+226, 323+132 lines) — UNAFFECTED, zero SDK dependency
  confirmed. ~40 apps/web UI test files consuming these fakes keep working
  unmodified through the migration.
- `infra/test/reglas.test.ts`: 1 file, 359 lines, 29 it() blocks. Deferred
  to #33 (OPEN). #28 D6 fixes the acceptance criterion (cover both sides of
  every A-1..A-11 threat) but not the tool — ctx7 CLI docs confirm pgTAP as
  one option; local-Postgres integration tests via supabase-js per role is a
  second documented option. Not decided here.
- `contracts/schemas/*.test.ts`: 9 files, 7 removed per #27 D5 (schemas
  removed too, validation moves to Postgres CHECK), 2 survive
  (crear-cajero, desactivar-cajero).
- `packages/shared/src/**/*.test.ts`: 8 files, mostly unaffected —
  progreso.test.ts and sincronizacion.test.ts need rewriting once the
  versiones[uid] replacement shape (CRITICAL finding above) is decided.

Net effect: the 19 packages/functions test files + 1 infra/test/reglas.test.ts
file (388 lines / ~29 assertions combined) lose their testing
apparatus entirely — both deferred to #33 (OPEN). Everything else (fakes,
UI tests, packages/shared tests, contracts schema tests) is unaffected or
mechanically portable.

## 5. Open ends the planning phases must handle

Six tickets remain OPEN (#22 itself, #30, #31, #32, #33, #34):

- #30 (deploy/CI) — sub-decision "Free + external cron" CLOSED; SQL
  migrations, Edge Function deploy, dev/prod envs, secrets, provision-script
  replacement still open. Blocks sequencing "how code ships" in sdd-tasks.
  Does NOT block schema/RLS/RPC/trigger authoring (local `supabase db diff`/`db push`
  works standalone).
- #31 (PR preview envs) — fully independent, only affects review/CI
  workflow shape.
- #32 (cutover plan) — prioridad:baja, blocked by everything else including
  #33. Fully independent of core migration work, last-in-sequence by design.
- #33 (test strategy / functional-parity criterion) — blocks: (a) which
  tool replaces the 19 functions tests + reglas.test.ts, (b) proving parity
  for the versiones[uid] replacement once decided, (c) the go/no-go
  criterion feeding #32. Schema/RLS/trigger/RPC AUTHORING can proceed
  without #33, but nothing can be marked "done" under this repo's
  non-negotiable strict-TDD rule (AGENTS.md §2) without #33 closing first —
  most likely actual gate on sdd-apply, not the four closed core tickets.
- #34 (Postgres backup/dump strategy) — independent of schema/RLS/RPC work,
  only matters before production cutover (feeds #32).
- Map's "Not yet specified" #3 — docs/diseno/09-seguridad-y-auditoria.md
  correction (A-8/A-9 falsely marked mitigated, false "forced password
  change" claim) — doc-only, no ticket, fully independent.

Practical read: sdd-spec/sdd-design/sdd-tasks for schema/RLS/RPC/trigger/
Edge-Function work can proceed now. Two things need a decision before "done"
can be claimed: #33 (blocks strict-TDD completion) and the versiones[uid]
replacement shape (not owned by any open ticket — genuine gap in the closed
decisions' inventory, should be raised explicitly in sdd-propose/sdd-design).

## 6. Client-side impact (apps/web)

Firebase Web SDK 11 usage confirmed in 13 files. Per mechanism:

- Client init (`apps/web/src/lib/firebase.ts`) — initializeApp + getAuth +
  initializeFirestore with persistentLocalCache/persistentMultipleTabManager
  all replaced by a single createClient() from @supabase/supabase-js — no
  offline-cache equivalent exists in supabase-js (this absence is why #26
  exists).
- Offline / access-token-lifetime tension (deferred #24 -> #26): #26
  (CLOSED) resolves with an app-owned indexedDB write queue (D1: single
  object store keyed by (sesionId, categoriaId)). Concretely:
  - `apps/web/src/lib/persistencia-monitor.ts` (44 lines) DISAPPEARS
    ENTIRELY — its purpose (header comment, lines 3-13) is detecting a
    Firestore-SDK-internal silent fallback string via monkey-patching
    console.warn; meaningless without the Firestore SDK. Its dedicated
    canary test (persistencia-monitor.test.ts, which exists specifically to
    catch drift against "el bundle REAL instalado del SDK") disappears too.
  - `apps/web/src/state/usePendientes.ts` (13 lines) — interface unchanged
    (still calls repo.observarEscriturasPendientes), only the backing
    mechanism changes from Firestore's hasPendingWrites metadata (#26 H3)
    to counting unconfirmed indexedDB queue entries (#26 D5) — internal to
    packages/data, zero apps/web diff for this file.
  - `apps/web/src/state/useConexion.ts` (26 lines) — FULLY UNAFFECTED,
    confirmed: only navigator.onLine + native online/offline events, no
    Firebase import anywhere.
  - 1-hour access-token lifetime becomes low-stakes once the queue exists
    (#26's own closing comment, consistent with registrarAporte's "cantidad
    is absolute not delta" property from #26 H1 — delayed retry after token
    refresh is safe to replay).
- Auth state (`apps/web/src/state/useAuthState.ts`, 44 lines) — full
  rewrite. Current: token.claims.rol/sucursales (lines 35-36) +
  normalizarSucursales defensive guard (lines 17-20). Per #24 D1, both
  replaced by a perfiles/perfil_sucursales SELECT (FK-backed, can't arrive
  malformed) triggered from onAuthStateChange.
- Sign-in/out (`apps/web/src/lib/router.tsx:8`) —
  signInWithEmailAndPassword/signOut become
  supabase.auth.signInWithPassword/signOut. Straightforward 1:1.
- Callables client (`apps/web/src/lib/funciones.ts`) — getFunctions
  disappears; surviving Edge Function invoked via supabase.functions.invoke(...),
  3 RPC ops via supabase.rpc(...), 4 PostgREST ops via
  supabase.from(table).insert/update(...). Real shape change in
  firestore-admin-repository.ts (single httpsCallable router today, line
  290, becomes three different call shapes) — not 1:1, flag for
  design/tasks sizing.
- FirebaseError checks (4 production files) become PostgrestError/AuthError/
  Edge-Function-error-shape checks — contained, mechanical.
- Direct Firestore read leak (useVersionMinima.ts) becomes a direct
  PostgREST select against config; routing through AdminRepository or
  keeping it direct is an undecided design choice.

## Risks

1. CRITICAL — LineaConteo.versiones[uid] backs the progress bar, "sólo
   pendientes" filter, keyboard auto-advance
   (packages/shared/src/services/progreso.ts:18-40,
   apps/web/src/ui/primitivos/BarraProgreso.tsx:5), and RF-16 cross-device
   confirmation (packages/shared/src/services/sincronizacion.ts:18-21) —
   not just Firestore idempotency. #23 D2 eliminates the field without
   specifying its replacement shape. Must be resolved in sdd-design before
   those two packages/shared modules can be ported; no open ticket
   currently owns this.
2. CRITICAL (documentation/tooling drift) — AGENTS.md:111 and
   openspec/config.yaml:23 both assert "only packages/data touches the
   Firebase SDK — enforced by ESLint." eslint.config.js has no such rule
   outside packages/shared and ui/primitivos. One real leak already exists
   in production code (useVersionMinima.ts, most recent commit). sdd-tasks
   should not assume the seam is closed by tooling — it isn't, today.
3. MEDIUM — Strict TDD (AGENTS.md §2, non-negotiable for this repo) cannot
   be honored for schema/RLS/RPC/trigger work until #33 (OPEN) selects a
   test tool (pgTAP vs local-Postgres integration tests, both confirmed
   viable). Likely the actual gate on sdd-apply, not the four closed core
   tickets.
4. LOW — Two closed tickets' own quantifications are measurably imprecise:
   #27's "1143 líneas" vs measured 1292, and #28's "27 tests" vs measured
   29 it() blocks in infra/test/reglas.test.ts. Neither changes any
   decision, but downstream specs/design/tasks should re-measure rather
   than quote these figures verbatim.
5. LOW — Pagina.siguienteCursor
   (packages/data/src/repositories/admin-repository.ts:27-30) is typed
   unknown|null specifically to hide a Firestore QueryDocumentSnapshot
   behind an opaque cursor; PostgREST's pagination model (range headers/
   keyset) is a different shape — interface opacity should survive the
   swap, concrete cursor value type changes entirely. Design-phase detail,
   not a blocker.

## Ready for Proposal

Yes, with two explicit carve-outs to name in sdd-propose: (1) the
versiones[uid] replacement shape (risk 1) needs a decision no closed ticket
currently owns — fold into #23/#28's consolidated model as an addendum, or
raise as new scope; (2) the seam enforcement gap (risk 2) is worth a
one-line addition to the task list (add an ESLint/dependency-cruiser rule
once the Supabase client exists). Neither blocks starting sdd-propose.

---

Source of record: Engram topic `sdd/migracion-firebase-a-supabase/explore`
(observation #1016). Materialized to this path by the orchestrator — the
`sdd-explore` agent has no Write tool. Risks 1 and 2 were independently
re-verified by the orchestrator against `eslint.config.js` and
`apps/web/src/state/useVersionMinima.ts:8,10,53` before propagation.
