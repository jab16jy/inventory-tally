# AGENTS.md — reglas de trabajo para agentes

Este archivo manda sobre el comportamiento por defecto del agente. El contenido
técnico manda desde `docs/`.

## 0. Los documentos son la autoridad

Antes de tocar código, lee `README.md`, luego `docs/diseno/README.md` (índice de
los documentos de diseño) y el documento del área que vas a tocar (04 datos,
05 concurrencia, 08 contratos, 09 seguridad…). Para UI, también `docs/PRODUCT.md`
y `docs/DESIGN.md`.

- Si el código contradice un documento, gana el documento. Si el documento está
  mal, se corrige en el mismo commit.
- Principio rector: _el cliente nunca escribe un total; sólo declara su aporte_.
  Una propuesta que lo rompe está mal.
- Las decisiones nuevas van como `ADR-NN` en `docs/diseno/13-decisiones-adr.md`.

## 1. Código mínimo (ponytail)

- Las simplificaciones deliberadas llevan un comentario `ponytail:` que nombra el
  techo y el camino de salida.
- Nunca se simplifican: validación en fronteras de confianza, manejo de errores
  que evita pérdida de conteos, seguridad y accesibilidad básica.
- Dependencia nueva sólo si no hay otra forma, y se registra en un ADR.

## 2. TDD estricto

Rojo → verde → refactor, por unidad pequeña. El test se escribe antes y falla por
la razón correcta.

- Los tests de `apps/web/src` fijan el markup: si un cambio rompe muchos tests, la
  señal es el cambio.
- Cada regla lleva su par afirmativo: un test negativo que pasaría con la regla
  rota no demuestra nada.
- Un archivo de test de `apps/web` se corre desde `apps/web/`
  (`npx vitest run <ruta>`): el vitest de la raíz no tiene jsdom.
- Checklist antes de cerrar una unidad:

```bash
npm run typecheck && npm run lint && npm test
npm run test:rules   # si tocaste infra/firestore.rules
```

Mutation testing (Stryker) es **opcional**: resérvalo para lógica grave (dinero,
seguridad, pérdida de conteos) cuando los tests no dan confianza. Ejemplo de config
acotada: `stryker.percentiles.conf.json`.

## 3. RDD — revisión antes del commit

Con `gentle-ai review` activo, la revisión corre una vez por slice, al cierre:

1. Checklist de §2 en verde y normalizadores que escriben (format, lint --fix)
   ya corridos.
2. `git add -A`: los archivos sin trackear quedan fuera del candidato.
3. START y seguir sólo el `next_transition` que devuelve el CLI. Una sola
   corrección por candidato; cambiar bytes después del START invalida la revisión.
4. Tras el acuse, commits por unidad de trabajo sobre el árbol revisado.

El interruptor `gentle-ai review mode enable|disable` es del usuario: si lo apaga,
se sigue sin revisión y no se reactiva.

## 4. ODD — flujo de trabajo por defecto

Cada feature vive en `odd/tasks/<feature>.md` (Objetivo, Problema, Por qué, Alcance,
Restricciones, Checklist con evidencia RED/GREEN, Progreso, Cierre, Próximo paso),
en su rama `feat/<feature>` desde `main`. SDD (`sdd-*`) sólo si el usuario lo pide.

## 5. Convenciones

- Dominio y documentos en español (`SesionConteo`, `LineaConteo`, `aporte`,
  `sucursal`).
- Commits convencionales en español, uno por unidad de trabajo, con sus tests y
  docs. Sin `Co-Authored-By` ni atribución de IA.
- Regla de dependencia: `shared` no importa nada del proyecto; `data` importa
  `shared` y `contracts`; `apps/web` importa todo. Sólo `packages/data/firebase`
  toca el SDK de Firebase (lo impone ESLint).
- Node 22 (`.nvmrc`): Cloud Functions v2 no soporta runtime 24.

## 6. Skills

Antes de responder, busca en `.atl/skill-registry.md` (local, fuera de git) la
skill que encaje y lee su `SKILL.md`. Al delegar, pasa las rutas de los `SKILL.md`,
no un resumen.

| Skill                             | Cuándo                                      |
| --------------------------------- | ------------------------------------------- |
| `impeccable`                      | Toda UI de `apps/web`.                      |
| `firebase-firestore`              | Modelo de datos, consultas, índices.        |
| `firebase-security-rules-auditor` | Cambios en `infra/firestore.rules`.         |
| `systematic-debugging`            | Bug o test rojo, antes de proponer arreglo. |
| `work-unit-commits`               | Partir el trabajo en commits.               |
| `find-docs`                       | API de una librería.                        |

## 7. Configuración para skills de ingeniería

- **Issues:** GitHub `jab16jy/inventory-tally` vía `gh`, cuerpos en español; los
  PRs no entran en triage. Ver `docs/agents/issue-tracker.md`.
- **Etiquetas de triage:** `needs-triage`, `needs-info`, `ready-for-agent`,
  `ready-for-human`, `wontfix` (las que falten se crean al primer uso). Ver
  `docs/agents/triage-labels.md`.
- **Dominio:** un solo `CONTEXT.md` en la raíz; ADRs en
  `docs/diseno/13-decisiones-adr.md`. Ver `docs/agents/domain.md`.
