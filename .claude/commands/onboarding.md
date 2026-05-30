---
description: Onboarding interactivo — guía paso a paso para poblar state/ desde cero
---

Cargá la skill `onboarding`.

**Pasos**:
1. Leé `state/context.md`, `state/goals.md`, `state/tasks.md` (si existen).
2. Decidí el modo según contenido existente:
   - Vacíos / no existen: proceso completo desde cero.
   - Con contenido: preguntá al usuario si sobreescribir / saltar / agregar.
3. Aplicá el flujo de 3 etapas definido en `.claude/skills/onboarding/SKILL.md`: contexto → goals → tareas.
4. Escribí incremental (después de cada grupo de preguntas, actualizá el archivo).
5. Al cierre: resumen, flag de gaps comunes, ofrecé `/plan-hoy`.

**Importante**: nunca pises archivos con contenido sin confirmación explícita. Resolvé fechas relativas a ISO absoluta usando hoy del sistema.
