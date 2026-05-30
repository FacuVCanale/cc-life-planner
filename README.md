# cc-life-planner

Sistema de planning personal con Claude Code. Tu estado (tareas, objetivos, logs) vive en archivos markdown; Claude Code es el motor que genera planes diarios justificados, captura tareas con formato canónico, loggea avance y revisa progreso contra objetivos.

Incluye un viewer web local que muestra el plan del día como timeline tipo Google Calendar, permite cargar tiempos reales por tarea, y muestra estadísticas de los últimos 30 días (planificado vs real, por categoría, por día de la semana).

## Cómo funciona

1. Vos mantenés tres archivos en `state/`: `tasks.md`, `goals.md`, `context.md`.
2. A la mañana corrés `/plan-hoy` en Claude Code → genera `plans/YYYY-MM-DD.{md,json}` con bloques justificados, lista de "para después", y recomendaciones estratégicas.
3. Durante el día, abrís `localhost:5173` (viewer) o usás `/log` desde el chat para registrar cuánto tardaste en cada tarea.
4. El sistema calibra solo el factor de optimismo de tus estimaciones a partir de tus logs.
5. Una vez por semana corrés `/revisar-semana`; una vez por mes `/revisar-objetivos`.

## Setup

```bash
gh repo clone <tu-fork-o-este-repo> cc-life-planner
cd cc-life-planner
claude
```

Adentro de Claude Code, corré:

```
/onboarding
```

Te lleva paso a paso por las preguntas necesarias para poblar `state/context.md`, `state/goals.md` y `state/tasks.md`. ~10 minutos. Después corré `/plan-hoy` y ya tenés tu primer plan.

Para el viewer (en otra terminal):

```bash
node viewer/serve.js
# abrí http://localhost:5173
```

### Setup manual (alternativa)

Si preferís editar los archivos vos:

```bash
cp examples/tasks.example.md state/tasks.md
cp examples/goals.example.md state/goals.md
cp examples/context.example.md state/context.md
# editá cada uno con tu data real
```

## Comandos

| Comando | Qué hace |
|---|---|
| `/onboarding` | Guía interactiva paso a paso para poblar `state/` desde cero. Empezá por acá. |
| `/plan-hoy` | Genera el plan del día con justificaciones, escribe `plans/*.md`, `plans/*.json`. |
| `/capturar <texto>` | Agrega una tarea a `tasks.md` con formato canónico. Si falta info, va a `inbox.md`. |
| `/log [texto]` | Registra avance del día en `log/YYYY-MM-DD.json`. |
| `/revisar-semana` | Revisión semanal: avance vs objetivos, sugerencias para la semana siguiente. |
| `/revisar-objetivos` | Revisión mensual/trimestral de `goals.md`. |

## Skills

Las skills viven en `.claude/skills/` y contienen la metodología que Claude Code usa cuando se invoca cada comando. Si querés ajustar el método (factor de optimismo default, formato del plan, criterios de priorización), editá el `SKILL.md` correspondiente.

## Integración Google Calendar

`/plan-hoy` lee tus eventos del día vía MCP de Google Calendar (si está configurado) y los respeta como bloques inamovibles. La primera vez que corrás, te va a pedir autenticar.

## Estructura

```
state/      tasks.md, goals.md, context.md, inbox.md   (gitignored)
plans/      YYYY-MM-DD.{md,json}                        (gitignored)
log/        YYYY-MM-DD.{json,md}                        (gitignored)
reviews/    YYYY-WW.md                                  (gitignored)
examples/   templates con data falsa                    (commiteado)
viewer/     server Node + frontend vanilla              (commiteado)
.claude/    commands + skills                           (commiteado)
```

## Privacidad

Todos los archivos con tu data personal (`state/`, `plans/`, `log/`, `reviews/`) están en `.gitignore`. El repo es público pero tu data nunca se sube. Sólo se commitean templates, código del viewer, y skills.

## Sync entre dispositivos (opcional)

Si querés tener tu data en más de una PC y, de paso, usarla como base de conocimiento navegable, podés mover esas carpetas a un Obsidian vault y sincronizarlas con un repo privado. Setup en ~10 minutos, gratis. Ver [`docs/SYNC.md`](docs/SYNC.md).
