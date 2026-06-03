---
name: planner-diario
description: Genera planes diarios justificados aplicando scheduling slack-based, alineación a goals, encaje en bloques de energía, y respeto de eventos del calendar. Usa esta skill cuando el usuario pida armar un plan diario, decidir qué hacer hoy, priorizar tareas del día, o invoque /plan-hoy.
---

# Planner diario

Tu trabajo es generar un plan del día que el usuario pueda ejecutar y entender. Cada decisión tiene que estar **justificada** explícitamente. Sin justificación no hay plan.

## Paradigma: TABLERO, no agenda horaria

Facu **no ejecuta en agenda** (multitasking, trabajo emergente concurrente, proyectos que se expanden — ver `state/context.md` "Cómo labura"). La adherencia histórica plan→real es 0-20%. Por eso el plan es un **tablero de decisión híbrido**, con estas secciones:

- **⏰ FIJO** — anclas del calendar con hora real (clases, reuniones, entregas/exámenes con horario). Inamovibles, con `attention`. Son el esqueleto; van en `blocks[]` con `start`/`end`.
- **🎯 MUST-DO** — lo que tiene deadline duro hoy/inminente (tenga o no hora). Pocos, concretos. → `must_dos[]`.
- **🚦 CARRILES** — el trabajo flexible que fluye alrededor de lo fijo, **sin hora rígida**: compromiso (GS-VTO), research emergente (concurrente con clases passive), uni. → `carriles[]`.
- **⚠️ ALERTAS** — deadlines que se acercan, cabos sueltos vencidos, scope-creep, bloqueadores. → `alertas[]`.
- **🔭 PRÓXIMOS ANCLAS** — anclas con fecha de los próximos días. → `proximos_anclas[]`.

**Ruteo:** evento de calendar con hora → FIJO. Deadline con fecha sin hora → MUST-DO (hoy/inminente) o ALERTA (se acerca). Trabajo flexible de Facu → CARRILES. Lo único que pierde el horario rígido es el trabajo flexible; todo lo que tiene fecha/hora real queda MÁS visible, arriba.

## Paso previo obligatorio: repo scouts

Antes de armar el tablero, **lanzá subagentes en paralelo (uno por repo activo de `~/code/*`)** que inspeccionen el estado real de cada repo. "Activo" = aparece en una task de `tasks.md`, en `state/repo-map.json`, o tuvo commits en los últimos ~3 días. Cada scout (read-only: `git status/log/branch`, PRs, WIP, TODOs, tests) devuelve: estado actual, qué quedó a medias, próximo paso lógico, quick wins, **qué dejar corriendo en background**, mínimo para cerrar, bloqueadores.

Usá los reportes para hacer el tablero **táctico y específico**, anclado a lo fijo del calendar:
- recomendaciones tipo *"antes de la reunión 16:15, pusheá X y dejá corriendo el build/tests/training Y"*;
- detectar que un proyecto está **code-complete** (no necesita más horas, necesita cierre) en vez de reservar horas fantasma;
- alimentar background-work concurrente (entrenamientos, deploys) que Facu corre en paralelo.

Conciliación con `tasks.md`: los scouts aportan **contexto y tácticas**, pero los **deadlines duros salen sólo de `tasks.md`/calendar** (no inventes fechas desde un repo).

## Tracking de cierre

Antes de schedular, leé la sección `## Cierre` de las notas-módulo (`temas/<tema>/<modulo>.md`) de los proyectos involucrados. Usala para: priorizar MUST-DO hacia el **mínimo funcional** (no hacia features nuevas), y emitir una **ALERTA `scope-creep`** si el trabajo reciente (scouts/log) está agregando cosas fuera del mínimo en vez de cerrar.

## Inputs

Lee estos archivos antes de planificar:

1. `state/tasks.md` — tareas con deadline, estimación, energía, dependencias.
2. `state/goals.md` — objetivos en tres horizontes.
3. `state/context.md` — restricciones recurrentes, capacidad real, factor bimodal, cómo labura.
4. `log/*.json` últimos 7 días — calibración (factor bimodal por tipo, ver context.md; no el 1.4 único).
5. Google Calendar **de hoy + 6 días siguientes** (MCP `mcp__claude_ai_Google_Calendar__*`, calendarios `facundovcanale@gmail.com` + `Universidad`). Hoy = anclas FIJOS; próximos 6 días = PRÓXIMOS ANCLAS + decisiones de adelantar/patear.
6. `temas/<tema>/<modulo>.md` `## Cierre` — mínimo funcional de proyectos abiertos.
7. **Repo scouts** sobre `~/code/*` (paso previo arriba).

## Metodología

### 0. Determinar hora de arranque del plan

Antes de schedular, leé la **hora actual del sistema** (Bash: `date +%H:%M` en bash o `Get-Date -Format HH:mm` en PowerShell). Comparala con el `floor de jornada` definido en `state/context.md` (default: `11:00`).

- Si **hora_actual < floor**: el plan arranca en `floor` (sigue la regla de morning routine).
- Si **hora_actual >= floor**: el plan arranca en `hora_actual` redondeada al siguiente cuarto de hora (ej. 14:23 → 14:30, 17:02 → 17:15). **No** empieces antes de la hora actual — ya pasó.

Esto evita generar planes que arranquen "a las 11:00" cuando son las 16:00. Las horas anteriores no entran al plan ni siquiera como deferred — simplemente no existieron como ventana planificable.

Caso borde: si la hora actual deja menos de 1.5h hasta el cierre razonable del día (~22:30), avisá al usuario que el día ya está casi consumido y proponé schedular sólo quick-wins (admin/shallow), no deep work.

### 0b. Modo urgencia (override del floor / cierre)

Cuando la carga real (estimada × factor) **no entra** en la jornada normal y hay un deadline duro a ≤24h, el plan puede romper los límites de jornada. El usuario lo prefiere antes que sacrificar la entrega.

Reglas del override:

- **Preferencia del usuario: estirar la noche, no adelantar la mañana.** Acostarse 01:00–04:00 le cuesta menos que levantarse 07:00. Aplicar overrides en este orden:
  1. Empujar cierre del día hasta **02:00** del día siguiente.
  2. Recién si eso no alcanza, considerar arrancar antes del floor (10:00, 09:00, 08:00…) — sólo en último recurso.
- **Aplica solo en urgencia real**: deadline ≤24h + carga > capacidad normal. No usar para "mejor terminar antes" o tareas con holgura.
- **Avisar explícitamente** en `strategic_recommendations` que el plan rompe rutina, citando el motivo: *"Modo urgencia activado: deadline X mañana 11:00, carga 17h reales en 10h netas; cierre extendido a 01:30"*.
- **Sueño consecuencia**: si el cierre extendido come horas de sueño bajo el target de 8h, flagealo. El usuario decide si compensa con siesta o duerme menos esa noche.
- **Recuperación al día siguiente**: si rompiste rutina hoy, en el plan de mañana sugerí carga liviana en la primera mitad del día (recuperar sueño + arranque más tardío que el floor habitual).
- **Spillover del día siguiente**: si un bloque del plan de hoy cruza medianoche (ej. `23:45–01:15`), **también** generá `plans/YYYY-MM-DD.json` del día siguiente con un bloque "cola" de `00:00–HH:MM` que referencia el mismo `task_id` y agrega `"spillover_from": "<fecha>"`. Marcá ese plan del día siguiente con `"preliminary": true` — `/plan-hoy` mañana lo sobrescribe con la versión completa. Sin esto, el viewer no muestra la cola en el día siguiente.

### 1. Calcular slack por tarea

Para cada tarea con deadline:

```
slack_dias = (deadline - hoy) - (estimacion_horas * factor_optimismo) / horas_disponibles_por_dia
```

- `factor_optimismo` default: **1.4**. Calibralo con los logs (ver sección "Calibración").
- `horas_disponibles_por_dia` default: **5h** de trabajo efectivo (descontando clases, comidas, transición).
- Slack negativo o < 1 día → **prioridad máxima**, va arriba aunque incomode.

### 1b. Estimaciones faltantes (`est: TBD`)

Si una tarea tiene `est: TBD` o no tiene estimación, **no preguntes mid-flight** ni la dejes fuera. Aplicá un default según `energía`:

| energía | default est |
|---|---|
| deep | 2h |
| shallow | 0.75h |
| admin | 0.25h |

En el JSON marcala con `"estimated_hours_default": true`. En el texto del chat mostrala con un asterisco (`est 2h*`) y agregá una línea al final del plan: `* estimaciones default — refinalas con /capturar cuando tengas más info`.

Estas tareas **sí participan del ranking** (con el default). Si después el usuario edita `tasks.md` con un valor real, el próximo `/plan-hoy` lo usa.

### 1c. Bloques concurrentes (atención compartida)

Algunos eventos del calendar permiten hacer otra cosa al mismo tiempo. Se modelan con un atributo `attention` en `state/context.md`:

```markdown
- Lunes 11:00–13:00: Turno en el mostrador (attention: passive)
- Martes 18:00–19:00: Clase de spinning que doy (attention: full)
- Viernes 09:00–10:00: Reunión con proveedores
```

Niveles:
- **full** (default si no se especifica): atención total, no concurrente.
- **partial**: podés hacer admin / shallow ligero al mismo tiempo (mails, captura de tareas), no deep work.
- **passive**: podés hacer cualquier cosa al mismo tiempo (incluso deep).

Cuando un evento tiene `attention: partial | passive`, el planner **puede** schedular una tarea concurrente:

- En el bloque del calendar: agregá `"attention": "passive"` y `"id": "<slug>"` (e.g., `"calendar-clase-ing-soft"`).
- En el bloque de la tarea concurrente: mismo `start`/`end` (o subset del slot del calendar) + `"concurrent_with": "<calendar-id>"`.
- En `justification.why_order` mencionalo: `"concurrente con el turno en el mostrador (attention: passive)"`.
- Limitación: una tarea concurrente solo puede ir contra eventos `partial` (si energía: shallow/admin) o `passive` (cualquier energía). No metas deep work contra `partial`.

Si el usuario tiene poco margen de tiempo en el día, priorizá usar slots concurrentes para tareas que no entrarían de otra forma — es ganancia neta.

### 1d. Mirar la semana antes de schedular

Antes de elegir qué entra hoy, armá mentalmente (o en scratch) la **carga de los próximos 7 días**:

- Para cada día de hoy → hoy+6, sumá: horas de calendar (clases + eventos), horas estimadas de tareas que vencen ese día, horas disponibles netas.
- Identificá los **días apretados** (carga > horas disponibles) y los **días con aire**.

Usá esa vista para decidir mejor:

- **Adelantar**: si una tarea vence el viernes pero el martes está vacío y el jueves saturado, conviene meterla martes — no esperar al filo.
- **Patear**: si una tarea vence en 3 días y los 3 días están llenos, no la pateés a "mañana" sin chequear que mañana también está saturado. Buscá el primer día con aire real.
- **Distribuir splits**: una tarea de 8h con deadline en 4 días no debería ir entera el día 1 si los días 2-3 tienen huecos — repartila.
- **Detectar conflictos no obvios**: dos tareas que vencen el mismo día compiten por el mismo slot — si ya viste la semana, podés mover una al día previo.

En las recomendaciones estratégicas mencioná explícitamente la lectura de la semana cuando justifique una decisión: *"adelanté X al lunes porque el jueves vas a tener clase + entrega Y"*.

### 2. Score de prioridad

Combina slack con alineación a goals y otros factores:

```
score =  -slack_dias * 10                    (más urgente = más arriba)
       + goal_alignment_score * 5             (0-3, ver abajo)
       + (depende_de_terceros ? 3 : 0)       (arrancalo antes para no quedar bloqueado)
       + (destraba_otra_tarea ? 2 : 0)
```

`goal_alignment_score`:
- 3 si la tarea contribuye directo a un goal de **corto plazo**.
- 2 si contribuye a uno de **mediano**.
- 1 si contribuye a uno de **largo**.
- 0 si no contribuye a ningún goal explícito.

Tareas sin deadline pero con `goal_alignment_score >= 2` no quedan invisibles: si no hay nada urgente, suben al ranking.

### 3. Encajar en bloques

1. Marcá los bloques **no negociables** del día: eventos del calendar, clases en `context.md`.
2. Los **deep work blocks** (≥90min) van en las ventanas de alta energía según `context.md` (default: mañana).
3. Tareas shallow / admin / quick-wins en huecos cortos o post-comida.
4. **Buffer de 15-30min** entre bloques. Nunca minuto-a-minuto rígido.
5. Si una tarea estimada > 4h, partirla en 2 bloques con 30min de aire entre medio.

### 4. Justificación obligatoria

Por **cada bloque** del plan: dos líneas.
- `why_today`: por qué este día y no otro (slack, deadline, dependencia, ventana de energía).
- `why_order`: por qué en este orden dentro del día (ventana de energía, no choca con calendar, destraba a Y).

Por **cada tarea pateada** (sección "Para después"): una línea.
- `reason`: por qué no hoy (holgura cómoda, compite con cosas más urgentes, falta input).
- `moved_to`: a qué fecha la moviste (siempre absoluta, ISO).

### 5. Recomendaciones estratégicas

Antes de cerrar:
- ¿Hay algún goal de **mediano o largo plazo** sin tarea activa esta semana? Si sí, sugerí concretamente qué bloquear y cuándo.
- ¿Hay alguna tarea con slack negativo que no entró por falta de tiempo? Flaggealo arriba: "Necesitás mover algo o aceptar el deslizamiento."
- ¿La distribución del día está inclinada a una sola categoría? Mencionalo si hay desbalance importante.

### 6. Calibración del factor de optimismo

Calculá empíricamente desde `log/`:

```
factor_implicito = sum(actual_min) / sum(planned_min)
                   sobre últimos 14 días con datos
```

Si difiere del default 1.4 por más de 0.1, **usá el implícito** y anotalo en `calibration_notes` del JSON: "Factor 1.6 calibrado contra 12 días de log; estimás ~60% optimista".

## Output: formato del plan

### En `plans/YYYY-MM-DD.md` (el chat muestra lo mismo, sin el frontmatter)

El archivo lleva **frontmatter** (capa del grafo de Obsidian), un **sufijo `· [[modulo]]`** por bloque con
`task_id`, y un **footer `**Módulos del día:**`** con los módulos únicos tocados. El módulo de cada bloque
sale del subheader `###` bajo el que vive la task en `state/tasks.md` (mismo valor que va en `block.module`
del JSON). Bloques `type: calendar`/`buffer` (sin `task_id`) **no** llevan sufijo. **Nunca** linkees a otras
fechas ni a tasks — sólo al módulo.

```markdown
---
tipo: plan
capa: fecha
---
## Plan 2026-05-02

08:00–10:00  **Deep work** — Arreglar el POS que duplica tickets [ferreteria]  ·  [[ferr-ventas]]
  ↳ Por qué hoy: vence en 10d, est 3h con factor 1.4 → 4.2h, conviene arrancar
  ↳ Por qué primero: única ventana >90min hoy

10:30–11:00  Pedido a la verdulería [cocina]  ·  [[cocina-compras]]
  ↳ Por qué hoy: hay que pedir hoy para tener todo mañana
  ↳ Por qué ahora: quick win antes de abrir el local

11:00–13:00  *Turno en el mostrador* [calendar]

14:00–15:30  Deep work — Rutina de hipertrofia para cliente nuevo [gimnasio]  ·  [[gym-rutinas]]
  ↳ Por qué hoy: el cliente arranca el lunes, hay que tenerla lista
  ↳ Por qué ahora: post-comida pero ventana suficiente

## Para después
- Cotizar catering casamiento → 2026-05-05. Holgura 2 semanas, hoy compite con el POS.
- Recontar stock tornillería → 2026-05-04. Bajo riesgo (vence en 13d).

## Recomendaciones
- El módulo "eventos" de la cocina tenía 0 tareas activas esta semana. Bloqueé tiempo el lunes.
- Si el fix del POS te lleva más de 3h, considerá pasar el block del jueves a esto también.

## Calibración
Factor 1.4 aplicado. Últimos 14 días: 13% optimista (estable, no ajusto).

---
**Módulos del día:** [[ferr-ventas]] · [[cocina-compras]] · [[gym-rutinas]]
```

### En `plans/YYYY-MM-DD.json`

```json
{
  "date": "2026-05-02",
  "generated_at": "2026-05-02T07:15:00-03:00",
  "calibration_factor": 1.4,
  "categories": {
    "ferreteria": "#f59e0b",
    "cocina":     "#10b981",
    "gimnasio":   "#3b82f6",
    "personal":   "#a78bfa",
    "calendar":   "#94a3b8",
    "buffer":     "#e5e7eb"
  },
  "blocks": [
    {
      "start": "08:00",
      "end": "10:00",
      "type": "deep_work",
      "category": "ferreteria",
      "module": "ferr-ventas",
      "title": "Arreglar el POS que duplica tickets",
      "task_id": "ferr-ventas-pos",
      "estimated_hours": 3,
      "deadline": "2026-05-12",
      "justification": {
        "why_today": "vence en 10d, est 3h con factor 1.4 → 4.2h, conviene arrancar",
        "why_order": "única ventana >90min hoy"
      },
      "source": "tasks.md"
    },
    {
      "start": "11:00",
      "end": "13:00",
      "type": "calendar",
      "category": "calendar",
      "title": "Turno en el mostrador",
      "id": "calendar-mostrador",
      "attention": "passive",
      "source": "context.md"
    },
    {
      "start": "11:00",
      "end": "12:30",
      "type": "shallow",
      "category": "cocina",
      "module": "cocina-menu",
      "title": "Armar el menú de la semana",
      "task_id": "cocina-menu-semana",
      "estimated_hours": 1,
      "concurrent_with": "calendar-mostrador",
      "justification": {
        "why_today": "para tener el menú listo el lunes",
        "why_order": "concurrente con el turno en el mostrador (attention: passive)"
      },
      "source": "tasks.md"
    },
    {
      "start": "14:00",
      "end": "15:30",
      "type": "deep_work",
      "category": "gimnasio",
      "module": "gym-rutinas",
      "title": "Rutina de hipertrofia para cliente nuevo",
      "task_id": "gym-rutina-hipertrofia",
      "estimated_hours": 2,
      "estimated_hours_default": true,
      "justification": {
        "why_today": "avanza el objetivo de sumar clientes, sin actividad esta semana",
        "why_order": "post-comida pero ventana suficiente"
      },
      "source": "tasks.md"
    }
  ],
  "deferred": [
    {
      "title": "Cotizar catering casamiento",
      "task_id": "cocina-eventos-catering",
      "moved_to": "2026-05-05",
      "reason": "holgura 2 semanas, hoy compite con el fix del POS que vence antes"
    }
  ],
  "strategic_recommendations": [
    "El módulo 'eventos' de la cocina tenía 0 tareas activas esta semana. Bloqueé tiempo el lunes."
  ],
  "calibration_notes": [
    "Factor 1.4 aplicado. Últimos 14 días: 13% optimista (estable, no ajusto)."
  ]
}
```

**Notas del schema**:
- `module` (opcional): slug del módulo al que pertenece la task, derivado del subheader `###` bajo el que
  vive en `state/tasks.md` (e.g. task en `## Ferretería` → `### Ventas` ⇒ `"module": "ferr-ventas"`). Alimenta el
  sufijo `· [[modulo]]` y el footer del `.md`, y el footer que regenera el viewer (`regenLogMd`). El viewer
  lo ignora para su UI. Bloques `calendar`/`buffer` no lo llevan.
- `id` en bloques de calendar: necesario si otros bloques referencian con `concurrent_with`. Slug determinístico desde el título (e.g., `calendar-<slug>`).
- `attention`: `full` (default) | `partial` | `passive`. Solo en bloques de calendar.
- `concurrent_with`: id del bloque "padre" (típicamente el calendar event). Solo se permite si el padre tiene `attention: partial` (entonces el hijo debe ser `shallow`/`admin`) o `passive` (cualquier energía).
- `estimated_hours_default: true`: marca tareas que no tenían `est` en `tasks.md` y se les aplicó default por energía. El viewer lo muestra con un asterisco.

## Schema del tablero (ADITIVO — no rompe el viewer)

Además de `blocks[]` (que ahora lleva **sólo los anclas FIJOS** del calendar + buffers, con `start`/`end`), el JSON gana cuatro arrays top-level. El viewer ignora los que no conoce hasta que se le agrega render; `computeStats`/revisor siguen leyendo `blocks`. **Mantené `blocks` con `start`/`end` siempre** (aunque sólo tenga calendar) para no romper la timeline ni las stats.

```json
{
  "must_dos": [
    { "title": "NLP Survey: repaso oral", "task_id": "nlp-survey-presentacion",
      "module": "uni-nlp", "deadline": "2026-06-04",
      "why": "oral mañana 16:50, vence <24h", "tactical": "~45min, fresco" }
  ],
  "carriles": [
    { "lane": "compromiso", "title": "GS-VTO: cerrar (no codear)", "task_id": "gsvto-widget",
      "module": "gsvto-widget", "concurrent_with": "calendar-robotica",
      "note": "code-complete; falta promover a main + E2E + handoff" },
    { "lane": "emergente", "title": "FluxNet: A/B EcoPerceiver en background", "task_id": "ad-hoc-fluxnet-2026-06-03",
      "module": "alethia-ai", "note": "dejar corriendo, concurrente" }
  ],
  "alertas": [
    { "kind": "scope-creep", "text": "GS-VTO: no agregar features, el cierre depende de deploy+handoff" },
    { "kind": "cabo-suelto", "text": "alethia-vercel-pause vencido (1/6) — decidir" }
  ],
  "proximos_anclas": [
    { "date": "2026-06-04", "text": "16:50 oral NLP" },
    { "date": "2026-06-05", "text": "DM1 Parcialito 4 + Diseño 18-21 (full)" }
  ]
}
```

- `must_dos[]`/`carriles[]` con `task_id`+`module` alimentan el footer `[[modulo]]` del `.md` y el `regenLogMd` (ya soporta leerlos). `lane` típico: `compromiso` | `emergente` | `uni` | `cierre`.
- `alertas[].kind`: `deadline` | `cabo-suelto` | `scope-creep` | `bloqueador`.
- El `.md` se escribe con las 5 secciones del tablero (⏰🎯🚦⚠️🔭). El footer `**Módulos del día:**` se arma con los módulos únicos de `blocks` + `must_dos` + `carriles`.
- Si tocás este schema, actualizá `viewer/viewer.js`, `examples/plan.example.json` y CLAUDE.md (regla del repo).

## Reglas duras

- **No** generes plan sin justificación por bloque.
- **No** plantees agendas minuto-a-minuto sin buffer (excepto bloques concurrentes que comparten slot por diseño).
- **No** ignores eventos del calendar con `attention: full` — son inamovibles.
- **No** metas tareas concurrentes contra eventos `attention: full`.
- **No** metas deep work concurrente contra eventos `attention: partial` (solo shallow/admin).
- **No** inventes deadlines que no estén en `tasks.md`. Si faltan, preguntá.
- **Estimaciones faltantes**: aplicá default por energía (sección 1b), no preguntes mid-flight.
- **Siempre** escribí los dos archivos: `plans/YYYY-MM-DD.md` y `plans/YYYY-MM-DD.json`. El viewer depende del JSON.
- **Wikilinks sólo en el `.md`, nunca en el JSON.** En el `.md` linkeá al **módulo** (sufijo por bloque +
  footer) y nunca a otras fechas ni a tasks individuales. En el JSON va el slug crudo en `block.module`.
