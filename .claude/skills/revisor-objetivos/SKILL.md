---
name: revisor-objetivos
description: Revisión mensual/trimestral de goals.md vs realidad — matar goals abandonados, ajustar deadlines vencidos, sugerir milestones para los que avanzan. Usa esta skill cuando el usuario invoque /revisar-objetivos o pida una revisión de objetivos.
---

# Revisor de objetivos

Tu trabajo es mantener `state/goals.md` honesto: matar lo que abandonaste, ajustar lo que cambió, y sugerir siguiente paso para lo que avanza.

## Inputs

- `state/goals.md` — todos los goals vigentes.
- `state/tasks.md` — tareas activas.
- `log/*.json` y `plans/*.json` de la ventana (default 30 días).
- `reviews/*.md` recientes — contexto de revisiones anteriores.

## Análisis por goal

Para **cada goal** en `goals.md`, calculá:

1. **Horas reales invertidas en la ventana**: sumá `time_spent_min` de logs cuya `task_id` o `category` matchea el goal (idealmente el `tasks.md` linkea explícitamente, ver "Linking" abajo).
2. **Tareas activas asociadas**: cuántas en `tasks.md` están abiertas para este goal.
3. **Deadline status**: si tiene deadline, ¿cuántos días faltan? ¿Está vencido?
4. **Última actividad**: timestamp del último log relacionado.

## Verdict por goal

Aplicá esta lógica:

| Condición | Verdict | Acción sugerida |
|---|---|---|
| 0h invertidas en 30d, deadline pasado | **muerto** | Archivar o reescribir. |
| 0h invertidas en 30d, deadline lejano (>60d) o sin deadline | **dormido** | Confirmar si sigue siendo prioridad; si sí, agendar primera tarea. |
| 0h invertidas en 30d, deadline próximo (<30d) | **en riesgo** | Agendar tareas urgentes esta semana o aceptar deslizamiento. |
| <2h en 30d, > 5h estimadas restantes | **progreso lento** | Revisar si las tareas del goal son demasiado grandes — partir en milestones. |
| Avance >50% más rápido que lo esperado | **acelerado** | Sugerir agregar siguiente milestone, no quedarse sin pista. |
| Deadline vencido y no completado | **vencido** | Reescribir deadline o archivar. |
| `## Cierre` del módulo con casi todo el checklist en `[x]` | **cerca de cierre** | Empujá a clavar el mínimo restante; no abrir frentes nuevos. |
| Actividad reciente agrega cosas fuera del `## Cierre` (mínimo) | **scope-creep** | Marcar el desvío; proponer cerrar el mínimo antes de seguir expandiendo. |
| Avance estable, on track | **ok** | Sin acción. |

Para los verdicts **cerca de cierre** / **scope-creep**, leé la sección `## Cierre` de la nota-módulo del goal (mínimo funcional + checklist). Un proyecto con compromiso de horas (ej. GS-VTO ≥5h/día) que ya está code-complete según su `## Cierre` no necesita más horas reservadas — necesita cerrar; decilo explícito.

## Output

Mostrá un reporte por horizonte (corto / mediano / largo) y al final una **lista de edits propuestos** a `goals.md`. **No apliques los edits sin confirmación del usuario.**

```markdown
# Revisión de objetivos — ventana 30 días

## Corto plazo
- ✅ "Lanzar el menú de otoño" (deadline 2026-05-22) — **on track**: 12h invertidas, 4 tareas activas.

## Mediano plazo
- ⚠️ "Armar servicio de catering" — **dormido**: 0h en 30d. Última actividad 2026-04-15.
- ✅ "Llegar a 50 clientes en el gimnasio" — **ok**: 38h, on track.
- 🔥 "Estabilizar el control de stock" — **en riesgo**: 0h, deadline 2026-05-20 (18d).

## Largo plazo
- 🌱 "Abrir una segunda sucursal" — **dormido** (esperable a este horizonte): 0h en 30d.

## Edits propuestos a goals.md
1. Mover "Armar servicio de catering" → archivar, o agendar 2h esta semana. ¿Cuál?
2. Reescribir "Estabilizar el control de stock" con un milestone concreto para esta semana, o pasar deadline.
3. (sin cambios para los demás)

¿Aplico alguno? Decime cuáles y los escribo.
```

## Linking goal ↔ tarea

`tasks.md` no tiene campo explícito para `goal_id`. Mapeo heurístico:
1. Si el nombre del proyecto en `tasks.md` matchea palabras clave del goal → asociado.
2. Si el `id` de la tarea contiene keywords del goal → asociado.
3. Si el usuario lo confirma manualmente en una revisión, recordalo (mencionalo en el output del review).

Cuando dudes, preguntá al usuario.

## Reglas

- **Nunca** edites `goals.md` sin confirmación explícita.
- **Sé honesto**: si un goal está abandonado, decilo. No suavices.
- **No agregues** goals nuevos en una revisión — eso es trabajo de `/capturar`.
- **Cuantificá** todo: horas, días, conteos.
