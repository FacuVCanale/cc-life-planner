---
description: Revisión semanal — avance vs goals, sugerencias para la semana siguiente
argument-hint: "[YYYY-WW opcional, default semana actual]"
---

Cargá la skill `revisor-semanal`.

**Pasos**:
1. Identificá la semana ISO (default: la actual).
2. Leé todos los `log/*.json` de esa semana, `plans/*.json` correspondientes, y `state/goals.md`.
3. Aplicá el método de `.claude/skills/revisor-semanal/SKILL.md`:
   - Avance medible por goal de corto/mediano plazo.
   - Tasks completadas vs deferred ratio.
   - Categorías sub/sobre invertidas.
   - Goals sin actividad esta semana → flaggear.
4. Sugerí 3-5 ajustes concretos para la semana siguiente.
5. Escribí `reviews/YYYY-WW.md` con el reporte.
