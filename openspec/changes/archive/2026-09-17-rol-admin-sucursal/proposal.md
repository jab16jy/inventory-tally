# Proposal: Rol admin_sucursal (branch-scoped admin)

## Intent

The business needs a manager for ONE sucursal: products, cajeros and sesiones of that sucursal, without seeing other sucursales or the cross-branch comparativo. Today `admin` is all-or-nothing (bypass in 20 callables + 4 rules), so the only option is full access.

## Scope

### In Scope
- `RolUsuario` gains `"admin_sucursal"`; zod enforces exactly 1 `sucursalesAsignadas`.
- `exigirAdminDeSucursal` beside `exigirAdmin`, applied to session, cajero and categoría callables.
- Anti-escalation: admin_sucursal only assigns role `cajero`, only its own sucursal, never global categorías.
- Rules: `puedeVerSucursal()` on historicos, resumen, auditoria; `usuarios` get/list via `sucursalesAsignadas.hasAny`.
- Web: raw `rol` in auth state; `/admin/comparativo` guard + nav filter; screens scoped to own sucursal; labels Gerente / Admin de sucursal / Cajero.
- Docs: 01 (roles, matrix), 08, 09 (claims, rules), 11 (routing), new ADR-27.

### Out of Scope
- Renaming `"admin"`; data migration.
- Áreas, sucursal create/edit, comparativo for admin_sucursal.
- Generic auth middleware.
- Editing `guardas.test.ts`.

## Capabilities

### New Capabilities
- `admin-sucursal`: role definition, branch-scoped authorization of session/categoría callables, rules read scope, admin UI scoping.

### Modified Capabilities
- `gestion-cajeros`: rol enum + cardinality; authorization becomes Gerente-or-own-sucursal; anti-escalation.
- `cierre-sesion`: "exigirAdmin before any read" becomes two-stage — role gate before reads, sucursal gate after reading the sesion and before any side effect (`CIERRE_BLOQUEADO`, sync check).

## Approach

Explore Approach 1. Role gate (any admin) stays in the `onCall` wrapper, so existing cajero/unauth scenarios still hold; the sucursal check sits right after the resource lookup. `exigirAdminOCajeroDeSesion` already admits admin_sucursal by claim membership — test only. Reuse `filtro.sucursalId` / `historicosRecientesPorSucursal`. Fail-closed on 0 or >1 claim sucursales.

Slices (≤400 lines each):
1. shared + contracts + rules + rules tests (`usuarios` red first) + docs 01/09/ADR-27.
2. functions: helper + 13 callables + tests (may split cajeros | categorías+sesiones) + doc 08.
3. web: auth state, guard, nav, labels, scoped screens + doc 11.

## Affected Areas

| Area | Impact |
|------|--------|
| `packages/shared/src/models/usuario.ts` | Modified |
| `contracts/schemas/{crear,actualizar}-cajero.schema.ts` | Modified |
| `infra/firestore.rules`, `infra/test/reglas.test.ts` | Modified |
| `packages/functions/src/lib/exigir-admin.ts` + 13 callables | Modified |
| `apps/web/src/state/useAuthState.ts`, `lib/guardas.ts`, `ui/admin/*`, `ui/CuentaScreen.tsx` | Modified |
| `docs/diseno/01, 08, 09, 11, 13` | Modified |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| `usuarios` list leaks other sucursales | High | rules test red→green first |
| Side effect before sucursal check (`cerrar-sesion` audit) | Med | check right after lookup; test "no audit for foreign sucursal" |
| `esAdmin` reinterpreted as "enters /admin" | Med | raw `rol` for labels and comparativo |

## Rollback Plan

Revert slice PRs in reverse order. No migration. Reverted code treats an `admin_sucursal` claim as non-admin (≈ cajero); reassign such users via `actualizarCajero`.

## Dependencies

- None external.

## Success Criteria

- [ ] admin_sucursal of A: allowed on A, denied on B in every scoped callable and rule (affirmative/negative pairs).
- [ ] Cannot create admin/admin_sucursal nor global categorías.
- [ ] `/admin/comparativo` redirects; nav hides it.
- [ ] Gerente behavior unchanged; existing tests (incl. `guardas.test.ts`) green unmodified.

## Open Questions (assumed defaults)

1. Categoría shared by A and B: read-only for admin_sucursal of A.
2. Cajero assigned to A and B: editable only if assigned solely to A.
3. admin_sucursal sees valor monetario and sets `valor` in its sucursal: yes.
