# Domain Docs

How the engineering skills should consume this repo's domain documentation when exploring the codebase.

**Layout: single-context.** The seven workspaces (`apps/web`, `packages/{shared,data,functions}`, `contracts`, `tools`) are layers of one domain, not separate bounded contexts — `SesionConteo`, `LineaConteo`, `aporte` and `sucursal` carry the same meaning across all of them. There is no `CONTEXT-MAP.md` and there should not be one unless a package's vocabulary genuinely diverges.

## Before exploring, read these

- **`CONTEXT.md`** at the repo root.
- **`docs/diseno/13-decisiones-adr.md`** — this repo's ADR record. Read the ADRs that touch the area you're about to work in.
- **`docs/diseno/README.md`** — the index of the 13 design documents. It tells you which one answers your question, so you don't read all 5,000 lines.

If any of these files don't exist, **proceed silently**. Don't flag their absence; don't suggest creating them upfront. The `/domain-modeling` skill (reached via `/grill-with-docs` and `/improve-codebase-architecture`) creates them lazily when terms or decisions actually get resolved.

## Where ADRs live — deliberate deviation

ADRs are **one file**, `docs/diseno/13-decisiones-adr.md`, with numbered `ADR-NN` entries — not one file per ADR under `docs/adr/`.

This is the pre-existing convention and the 13 design documents cross-reference it by anchor (e.g. `[ADR-11](13-decisiones-adr.md)`). Splitting it would break those links for no gain. **A new ADR is appended to that file**, keeping the numbering and the existing per-entry shape (decision, alternatives evaluated, consequences).

Do not create `docs/adr/`.

## Use the glossary's vocabulary

When your output names a domain concept (in an issue title, a refactor proposal, a hypothesis, a test name), use the term as defined in `CONTEXT.md`. Don't drift to synonyms the glossary explicitly avoids.

**The domain vocabulary is Spanish** and stays Spanish (`AGENTS.md` §5): `SesionConteo`, `LineaConteo`, `aporte`, `sucursal`, `cajero`, `categoriaValor`. `docs/diseno/03-modelo-de-dominio.md` is the authority on entities and invariants until a `CONTEXT.md` exists. Note the terminology change the design records: the counting role is **`cajero`**, never "trabajador" (that name was retired in v2).

If the concept you need isn't in the glossary yet, that's a signal — either you're inventing language the project doesn't use (reconsider) or there's a real gap (note it for `/domain-modeling`).

## Flag ADR conflicts

If your output contradicts an existing ADR, surface it explicitly rather than silently overriding:

> _Contradicts ADR-11 (no native apps, PWA only) — but worth reopening because…_
