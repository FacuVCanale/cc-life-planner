---
description: Revisión mensual/trimestral de goals — matar abandonados, ajustar deadlines
argument-hint: "[ventana en días, default 30]"
---

Cargá la skill `revisor-objetivos`.

**Pasos**:
1. Ventana: $ARGUMENTS días, default 30.
2. Leé `state/goals.md` y todos los `log/*.json` y `plans/*.json` de la ventana.
3. Por cada goal, calculá horas reales invertidas (sumando logs cuya `category` o `task_id` matchea el goal).
4. Aplicá el método de `.claude/skills/revisor-objetivos/SKILL.md`:
   - Goals sin actividad → candidatos a archivar.
   - Goals con deadline pasado y no completados → reescribir o matar.
   - Goals que avanzan más rápido de lo esperado → sugerir agregar siguiente milestone.
5. Mostrá el reporte y proponé edits a `state/goals.md`. **Pedí confirmación** antes de aplicar cualquier edit.
