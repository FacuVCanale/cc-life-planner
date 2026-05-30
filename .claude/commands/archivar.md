---
description: Archiva tasks [x] de tasks.md a tasks-archive.md y revisa partial/deferred del log de ayer
argument-hint: "[opcional: 'silent' para skip preguntas y solo archivar done]"
---

Cargá la skill `archivador` y limpiá `state/tasks.md`.

**Entrada**: $ARGUMENTS.
- Sin argumento: flujo completo (archivar done + revisar partial/deferred preguntando al user).
- `silent`: solo archivá done, no preguntes nada sobre partial/deferred (modo no-interactivo).

**Pasos**:
1. Aplicá los pasos definidos en `.claude/skills/archivador/SKILL.md`.
2. Si entrás como pre-step de `/plan-hoy`, pasá modo `silent` solo si el usuario ya configuró que no quiere ser interrumpido (default: preguntar).
3. Reportá el resumen al chat antes de devolver control.
