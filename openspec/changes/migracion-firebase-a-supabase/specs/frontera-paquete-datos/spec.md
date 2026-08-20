# Frontera Paquete Datos Specification

## Purpose

Carve-out B. `AGENTS.md:111` and `openspec/config.yaml:23` both claim only
`packages/data` touches the backend SDK, "enforced by ESLint" — false today:
`eslint.config.js` restricts Firebase imports only under `packages/shared/**`
(`:31-60`) and `apps/web/src/ui/primitivos/**` (`:67-97`). A real leak exists at
`apps/web/src/state/useVersionMinima.ts:8,10,53` (direct `doc()`/`getDoc()` against
`config/app`). Not listed under the proposal's explicit Capabilities section, but
required by proposal item 8 (Carve-out B).

## Requirements

### Requirement: ESLint enforces the Supabase SDK boundary

`eslint.config.js` MUST restrict `@supabase/supabase-js` imports to
`packages/data/**` and `apps/web/src/lib/**` only, mirroring the existing
`no-restricted-imports` pattern already used for Firebase.

#### Scenario: An import outside the allowed paths fails lint (affirmative)

- GIVEN a file under `apps/web/src/state/**` importing `@supabase/supabase-js` directly
- WHEN `eslint .` runs
- THEN it reports a `no-restricted-imports` violation

#### Scenario: An import inside packages/data passes lint (negative counterpart)

- GIVEN a file under `packages/data/src/supabase/**` importing `@supabase/supabase-js`
- WHEN `eslint .` runs
- THEN no violation is reported for that import

### Requirement: The Supabase SDK is confined to `packages/data` and `apps/web/src/lib`

No backend-SDK import (`@supabase/supabase-js`) MUST appear under
`apps/web/src/state/`, `apps/web/src/ui/`, `packages/shared/`, `contracts/`, or
`tools/`. The SDK is confined to `packages/data/src/**` and `apps/web/src/lib/**` —
the latter is the legitimate DI construction point (today's
`apps/web/src/lib/firebase.ts`), not a seam violation. `design.md` D-7's
`apps/web/src/lib/version-minima.ts` (`leerVersionMinima()`) is a peer of
`firebase.ts`/`router.tsx`/`funciones.ts` at that same boundary, not a repository
method — routing a router-level, every-user read through an admin-only repository
would misrepresent the boundary rather than fix it.

#### Scenario: The version-check module lives in `apps/web/src/lib`, not `state` (affirmative)

- GIVEN the migrated `leerVersionMinima()`
- WHEN its location is inspected
- THEN it is under `apps/web/src/lib/`, importing `@supabase/supabase-js` directly
  — the same boundary as `firebase.ts`

#### Scenario: No SDK import exists under `apps/web/src/state` (negative counterpart)

- GIVEN `apps/web/src/state/**`
- WHEN its imports are inspected
- THEN none import `@supabase/supabase-js` — the leak at
  `useVersionMinima.ts:8,10,53` is closed by moving the read to `lib/`, not by
  wrapping it in a repository

### Requirement: Docs stop claiming enforcement they don't have

`AGENTS.md:111` and `openspec/config.yaml:23` MUST be corrected in the same commit
that lands the ESLint rule above, so the claim is true at the moment it is written —
a doc that lies about an enforced boundary is worse than one that admits the gap.

#### Scenario: Doc claim matches enforced reality (affirmative)

- GIVEN the ESLint rule from the first requirement is active
- WHEN `AGENTS.md` and `openspec/config.yaml` are read
- THEN their boundary claim names ESLint as the mechanism, and a violating import
  provably fails CI

## Non-goals

- Runtime enforcement (e.g. a bundler plugin) — ESLint (static, CI-gated) is
  sufficient at this scale; no new tool is introduced.
