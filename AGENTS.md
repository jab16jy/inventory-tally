# AGENTS.md — reglas de trabajo para agentes

Este archivo manda sobre el comportamiento por defecto del agente. El **contenido**
técnico manda desde `docs/`.

---

## 0. Primero leer, después escribir

Orden obligatorio antes de tocar código:

1. `README.md` — arranque, estructura, y las tres cosas que muerden.
2. `docs/diseno/README.md` — índice de los 13 documentos de diseño. **Son la autoridad.**
3. El documento concreto del área que vas a tocar (04 datos, 05 concurrencia,
   08 contratos, 09 seguridad…). No trabajes de memoria ni por inferencia del código.
4. Si el cambio es de UI: `docs/PRODUCT.md`, `docs/DESIGN.md` y
   `docs/plan-diseno-visual-pwa.md`.

Si el código contradice un documento, **el documento gana**. Si el documento está
mal, se corrige el documento en el mismo commit — no se deja la divergencia viva.

Principio rector, no negociable (README): _el cliente nunca escribe un total; sólo
declara su aporte_. Una propuesta que lo rompe está mal, la regla no.

---

## 1. Ponytail (modo `full`, siempre activo)

Escalera de decisión, se para en el primer escalón que aguanta:

1. ¿Hace falta que exista? Necesidad especulativa = no se construye.
2. ¿Ya existe en el repo? Reutiliza el primitivo, hook o servicio que ya está.
3. ¿Lo cubre la stdlib o la plataforma? Úsala.
4. ¿Lo cubre una dependencia ya instalada? Úsala. Dependencia nueva: sólo si de
   verdad no hay otra forma.
5. Sólo entonces: el mínimo código que funciona.

- Sin abstracciones no pedidas: nada de interfaz con una implementación, ni factory
  para un producto, ni config para un valor que nunca cambia.
- Gana el diff más corto — **pero después de entender el problema**, no en lugar de
  entenderlo. Un arreglo de síntoma en la ruta que reporta el ticket deja rotos a
  los demás llamadores: arregla en la raíz, donde todos pasan.
- Las simplificaciones deliberadas se marcan con un comentario `ponytail:` que
  nombra el techo y el camino de salida.
- Nunca se simplifica: validación en fronteras de confianza, manejo de errores que
  evita pérdida de conteos, seguridad, accesibilidad básica, y lo pedido explícitamente.

---

## 2. TDD estricto

Rojo → verde → refactor, por unidad pequeña.

- El test se escribe **antes**, y tiene que fallar por la razón correcta.
- Los tests de `apps/web/src` fijan el markup: son la red de regresión del rediseño
  visual, no decoración. Si un cambio rompe doce tests, la señal es el cambio, no
  los tests.
- Toda lógica no trivial (rama, bucle, parser, dinero, seguridad) deja su test.
  Un one-liner trivial no necesita test.
- Un test negativo que también pasaría con la regla rota **no demuestra nada**:
  cada regla necesita su par afirmativo.
- Antes de cerrar cualquier unidad:

```bash
npm run typecheck && npm run lint && npm test
npm run test:rules   # si tocaste infra/firestore.rules
```

---

## 3. RDD — revisión adversarial antes del commit

`gentle-ai review` es la puerta de entrada al repositorio.

- Todo normalizador que **modifica** archivos (format, lint --fix, generación)
  corre **antes** del START. Después del START sólo corren comprobaciones que no
  escriben.
- El candidato queda congelado: cambiar bytes invalida el recibo y obliga a una
  revisión nueva.
- Hay **una sola** transacción de corrección por candidato. Si la validación
  dirigida falla, se acabó — reejecutar el validador esperando otro veredicto es el
  bucle que el contrato prohíbe.
- Cuando la transición pide `correction_lines`, el pronóstico va **antes** de editar
  un solo archivo.
- El commit sólo entra con recibo aprobado.
- El interruptor (`gentle-ai review mode enable|disable`) es del usuario. Si pide
  desactivarlo, se desactiva y se sigue trabajando de forma orgánica: no se
  reactiva ni se busca rodeo.

---

## 4. SDD — opcional, nunca por defecto

Spec-Driven Development (`sdd-*`) se usa **sólo** cuando el usuario lo pide
explícitamente o acepta una propuesta de usarlo. Tamaño, número de archivos o
riesgo percibido **no** lo activan. El trabajo normal va por implementación directa
(inline o con un worker delegado) y no crea artefactos SDD.

Propón SDD sólo si una propuesta/spec/diseño/tareas duradero reduce ambigüedad real.

---

## 5. Convenciones del repositorio

- **Dominio en español** (`SesionConteo`, `LineaConteo`, `aporte`, `sucursal`).
  Se mantiene: los documentos de diseño están en español.
- **Commits convencionales en español**, un commit por unidad de trabajo revisable.
  Sin `Co-Authored-By` ni ninguna atribución de IA.
- **Regla de dependencia:** las flechas apuntan hacia abajo. `shared` no importa
  nada del proyecto; `data` importa `shared` y `contracts`; `apps/web` importa todo.
  Sólo `packages/data/firebase` toca el SDK de Firebase — lo impone ESLint.
- Todo comando de firebase lleva `--config infra/firebase.json`.
- Node 22 (`.nvmrc`): Cloud Functions v2 no soporta runtime 24.

---

## 6. Skills

`.atl/skill-registry.md` es el índice de skills disponibles en esta máquina
(está en `.gitignore`: es local, con rutas absolutas, no viaja con el repo;
se regenera con `gentle-ai skill-registry refresh --force`).

- **Antes de responder**, comprueba si la tarea encaja con alguna entrada de la
  columna _Trigger / description_ y lee su `SKILL.md` completo. El registro es un
  índice, no un resumen: `SKILL.md` es la fuente de verdad.
- **Al delegar en un subagente**, pásale las rutas exactas de los `SKILL.md` que
  apliquen bajo `## Skills to load before work`, no un resumen tuyo.
- Si no hay registro o ninguna entrada encaja, sigue sin inyección de skills.

Las que más aplican en este repositorio:

| Skill                             | Cuándo                                                               |
| --------------------------------- | -------------------------------------------------------------------- |
| `impeccable`                      | **Toda** UI de `apps/web` — es la convención establecida en F0–F4.   |
| `firebase-firestore`              | Modelo de datos, consultas, índices.                                 |
| `firebase-security-rules-auditor` | Cualquier cambio en `infra/firestore.rules`.                         |
| `systematic-debugging`            | Bug, test rojo o comportamiento raro, **antes** de proponer arreglo. |
| `work-unit-commits`               | Partir el trabajo en commits revisables.                             |
| `find-docs`                       | API de una librería — no contestes de memoria.                       |
| `judgment-day`                    | Revisión adversarial doble, cuando el usuario la pide.               |

---

## 7. Memoria (Engram)

- Antes de retomar cualquier trabajo previo: `mem_search` / `mem_context`.
- Después de una decisión, un bug arreglado, una convención nueva o un hallazgo no
  obvio: `mem_save`. Sin esperar a que lo pidan.
- Antes de decir "listo": `mem_session_summary`.

---

## 8. Agent skills

Configuración por repositorio que asumen las skills de ingeniería. La §6 indexa
_qué_ skills existen; esta sección les dice _dónde_ trabajar.

### Issue tracker

Issues de GitHub en `jab16jy/inventory-tally`, vía la CLI `gh`. Cuerpos en
español. Los PRs **no** entran en la cola de triage.
Ver `docs/agents/issue-tracker.md`.

### Triage labels

Las cinco etiquetas canónicas sin renombrar: `needs-triage`, `needs-info`,
`ready-for-agent`, `ready-for-human`, `wontfix`. Sólo `ready-for-agent` y
`wontfix` existen hoy en el repo; las otras tres se crean al primer uso.
Ver `docs/agents/triage-labels.md`.

### Domain docs

Single-context: un `CONTEXT.md` en la raíz, sin `CONTEXT-MAP.md` — los siete
workspaces son capas de un mismo dominio. **Los ADRs viven en
`docs/diseno/13-decisiones-adr.md`**, un solo archivo con entradas `ADR-NN`, no
en `docs/adr/`. Un ADR nuevo se añade ahí.
Ver `docs/agents/domain.md`.
