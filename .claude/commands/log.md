---
description: Registra avance del día en log/YYYY-MM-DD.json
argument-hint: "[texto libre describiendo qué hiciste, opcional]"
---

Cargá la skill `logueador`.

**Entrada**: $ARGUMENTS. Modos:
- Sin argumento: mostrá el estado actual del log de hoy + el plan, y preguntale al usuario qué actualizar.
- Con texto ("estuve 2h con TP rob, terminé fase 3"): inferí `task_id` desde `plans/YYYY-MM-DD.json` y agregá entry.

**Pasos**:
1. Leé `plans/YYYY-MM-DD.json` (si existe) para conocer las tareas planeadas y sus IDs.
2. Leé `log/YYYY-MM-DD.json` (si existe) para no duplicar entries.
3. Aplicá el upsert definido en `.claude/skills/logueador/SKILL.md`. Key: `task_id`. Campos: `task_id`, `time_spent_min`, `status` (done/partial/deferred/skipped), `notes`, `timestamp`.
4. Escribí `log/YYYY-MM-DD.json` y regenerá `log/YYYY-MM-DD.md` desde el JSON.
5. Mostrá en el chat el log actualizado y, si hay diff con la estimación del plan, mencionalo (e.g. "estimaste 2h, real 3h, +50%").
