---
name: logueador
description: Registra avance del día en log/YYYY-MM-DD.json (source of truth) y regenera el .md. Source-shared con el endpoint POST /api/log del viewer. Usa esta skill cuando el usuario quiera loggear cuánto tardó en una tarea, marcarla como done/partial/deferred, o invoque /log.
---

# Logueador

Tu trabajo es mantener `log/YYYY-MM-DD.json` consistente con lo que el usuario realmente hizo, sin perder entries ni duplicar.

## Source of truth

`log/YYYY-MM-DD.json` es la única fuente de verdad. `log/YYYY-MM-DD.md` es una vista derivada — **siempre regenerala** desde el JSON, nunca la edites directo.

## Schema del JSON

```json
{
  "date": "2026-05-02",
  "entries": [
    {
      "task_id": "tp-rob-3",
      "time_spent_min": 145,
      "status": "done",
      "notes": "terminé fase 3, falta documentación",
      "timestamp": "2026-05-02T10:12:00-03:00"
    }
  ]
}
```

Campos:
- `task_id`: slug del `tasks.md` o del bloque del plan. Si la actividad no estaba planeada, usá `ad-hoc-<slug>`.
- `time_spent_min`: minutos enteros.
- `status`: `done` | `partial` | `deferred` | `skipped`.
- `notes`: texto libre, opcional.
- `timestamp`: ISO con timezone.

## Lógica de upsert

**Key**: `task_id`. Si ya existe entry con mismo `task_id`:
- `time_spent_min`: **sumar** al existente (no reemplazar — el usuario puede loggear varias sesiones de la misma tarea en el día).
- `status`: tomar el último (más reciente).
- `notes`: concatenar con `\n` si ambos no vacíos.
- `timestamp`: actualizar al más reciente.

Si no existe: append.

## Modos de invocación

### Modo 1: texto libre desde `/log`

Input: `"estuve 2h con TP rob, terminé fase 3"`.

Pasos:
1. Leé `plans/YYYY-MM-DD.json` para mapear texto → `task_id`.
2. Inferí: `task_id`, `time_spent_min` (parseá "2h" → 120), `status` (`"terminé"` → `done`).
3. Si la inferencia es ambigua, preguntá ("¿te referís a `tp-rob-3` o `tp-rob-doc`?").
4. Aplicá upsert.

### Modo 2: estructurado desde el viewer

El viewer postea a `POST /api/log/:date` con body `{task_id, time_spent_min, status, notes}`. El handler usa la **misma** función de upsert. No hay inferencia: los campos vienen explícitos.

### Modo 3: `/log` sin argumentos

Mostrá:
- Plan de hoy (resumido).
- Log actual (entries existentes).
- Diff por tarea (estimado vs loggeado).
- Pregunta: "¿qué actualizar?".

### Modo 4: auto desde git (`/log --git` o "logueá lo que hice hoy")

Para días de mucho trabajo de código (el patrón real de Facu: ver [[user-como-labura-facu]]). En vez de pedirle que recuerde tiempos, los infiere de los commits.

Pasos:
1. Corré `node scripts/git-day-scan.js YYYY-MM-DD` (sin fecha → hoy). Lee los commits del autor (de `state/repo-map.json` → `author_emails`) en cada repo de `~/code/*`, los agrupa en **sesiones** (gap >90min = sesión nueva, no cuenta la noche), y propone una entry por repo: `task_id`/`module` (de `repo-map.json`), `time_spent_min` (suma de sesiones, **estimado**), `notes` (mensajes de los commits).
2. **Mostrale la propuesta al usuario** (tabla: repo → task_id · min · ventana). NO escribas todavía.
3. El usuario confirma, corrige tiempos, o descarta filas. El tiempo es estimado del span de commits — recordáselo.
4. Aplicá upsert (mismo contrato que los otros modos) **sólo a las filas confirmadas**.
5. Si un repo no está en `repo-map.json`, cae en `ad-hoc-<repo>-<fecha>`; ofrecé agregar el mapeo.
6. Comportamiento de curación del brain: **igual que `/log`** (este modo lo invoca el usuario, no el viewer) → al cerrar, actualizá `## Estado actual` / `## Cierre` / `## Aprendizajes` de los módulos tocados.

Limitación honesta: el tiempo NUNCA es medido, es inferido de timestamps de commits. Trabajo concurrente (varios repos a la vez) puede solaparse — no sumes ciegamente entre repos sin avisar que se solapan.

### Modo 5: calendar — eventos del día (clases, reuniones, lo NO-código)

El logueo del día tiene **dos fuentes automáticas**: git (código) y **calendar** (clases, reuniones, eventos). No le pidas a Facu que recuerde "a mano" — traé su agenda y preguntá por cada evento.

Pasos (corre junto al Modo 4 cuando se loguea el día completo):
1. Traé los eventos del día de Google Calendar vía MCP `mcp__claude_ai_Google_Calendar__list_events` (calendarios `facundovcanale@gmail.com` + `Universidad`), igual que hace el planner.
2. Por cada evento, **proponé una entry y preguntá si lo hizo**: `task_id` = `calendar-<slug-del-evento>-<fecha>`, `time_spent_min` = duración del evento (editable), `status` según respuesta del user: **fui/lo hice** → `done`, **parcial** → `partial`, **no fui** → no registrar (o `skipped` si quiere dejar traza).
3. **Módulo**: derivá del summary del evento por prefijo (igual que el planner matchea attention en `context.md`): Robótica→`uni-robotica`, NLP→`uni-nlp`, Historia→`uni-historia`, Diseño→`uni-diseno`, Software→`uni-ingsoft`. Reuniones/eventos personales (ej. "CEO JPMorgan") → sin módulo salvo que aplique uno.
4. **Concurrencia**: si una clase era `attention: passive` y el git scan ya capturó código de esa franja (ej. FluxNet durante Robótica), no dupliques tiempo — registrá la clase como `done` (asistencia) y dejá el trabajo concurrente en su propia entry de git; mencionalo en las notas.
5. El user confirma/ajusta; aplicá upsert sólo a lo confirmado.

### Flujo recomendado "loguear el día" (`/log --git` o "logueá lo de hoy")

Combiná las fuentes en una sola pasada, mostrando UNA tabla de propuestas para confirmar:
1. **Git** (Modo 4) → trabajo de código.
2. **Calendar** (Modo 5) → clases/reuniones.
3. **Manual** → lo que no esté en ninguna (ej. entreno, llamada). Preguntá "¿algo más que no haya salido de git ni del calendar?".
Luego upsert de todo lo confirmado + curación del brain.

## Regeneración del `.md`

Después de cada upsert, regenerá `log/YYYY-MM-DD.md`. **Debe quedar byte-idéntico** a lo que produce
`regenLogMd()` en `viewer/serve.js` (ambos regeneran la misma vista desde el JSON):

```markdown
---
tipo: log
capa: fecha
---
# Log 2026-05-02

## ferr-ventas-pos — Arreglar el POS que duplica tickets
- 10:12 · done · 145min
- encontré el bug en el cierre de caja, falta testear

## ad-hoc-llamado-proveedor — Llamar al proveedor de pinturas
- 11:30 · done · 15min

---
**Resumen**: 160min loggeados · 1 done · 0 partial · 0 deferred · 0 skipped

**Módulos:** [[ferr-ventas]]
```

El título de cada sección lo sacás de `plans/YYYY-MM-DD.json` (campo `title` del bloque con ese `task_id`). Si no está en el plan (ad-hoc), usá un placeholder o pediselo al usuario.

Reglas del render (igual que el viewer):
- **Frontmatter** `tipo: log` / `capa: fecha` al tope (marca la capa "fecha" del grafo).
- **Footer `**Módulos:**`**: módulos únicos (en orden de aparición) de las entries loggeadas. El módulo de
  cada entry sale de `block.module` del plan JSON para ese `task_id`. Linkeá sólo al módulo — nunca a otras
  fechas ni a tasks. Si ninguna entry tiene módulo (todo ad-hoc / sin plan), **omití** la línea del footer.
- Si una task no tiene `module` en el plan, no contribuye al footer (no inventes módulo).

## Actualizar el estado en el brain (al final del log) — PASO FIJO, NO OPCIONAL

**Esto se hace SIEMPRE al cerrar un `/log`, por default — no es a demanda ni hay que pedirlo.** Después de
escribir el JSON y regenerar el `.md`, evaluá cada módulo tocado y actualizá su nota. Lo único que es
condicional es *si hubo cambio de estado*: si un módulo no se movió, no lo toques (ver regla abajo). Pero la
**evaluación es obligatoria en cada log** — nunca cierres un `/log` sin haber pasado por acá.

El log crudo (`log/*.json`/`.md`) es temporal: importa para el planner (calibración, reviews). Pero el
**second brain** no guarda fechas — guarda el **estado de las cosas**. Por eso, al final de cada log, si la
sesión **cambió el estado** de un módulo o dejó un **aprendizaje durable**, actualizá la nota-módulo
correspondiente (`temas/<tema>/<modulo>.md`). El módulo lo sacás de `block.module` del plan (o del
`### Módulo` de la task en `tasks.md`).

Tres secciones de la nota-módulo:

- **`## Estado actual`** — snapshot vivo, **se sobrescribe** (no se acumula, sin fechas). 1-4 líneas en
  prosa: qué está hecho, qué falta, blocker actual, próximo paso. Reescribilo para que refleje dónde está
  el módulo **ahora**. Ej: tras loguear "encontré por qué el POS duplica tickets, es el cierre de caja",
  el `## Estado actual` de `ferr-ventas` pasa a *"El POS duplica tickets al cerrar caja. Causa identificada:
  doble submit en el cierre. Próximo: agregar lock al botón y testear con el cajero."*
- **`## Cierre`** (si existe) — checklist del mínimo funcional. Si la sesión completó un ítem, marcá `- [x]`.
  **No agregues ítems nuevos al mínimo** salvo que el usuario lo pida explícito — si la sesión metió trabajo
  fuera del mínimo, es señal de scope creep (mencionáselo, no lo normalices en el checklist). Si se
  completaron todos los ítems, avisá al usuario y ofrecé setear `status: cerrado` en el frontmatter.
- **`## Aprendizajes`** — **se acumula** (append), pero sólo señal alta: decisiones, hallazgos, cosas que
  vas a querer recordar. No metas "avancé 30min" acá.

Reglas:
- **Sólo si cambió algo.** Si la sesión no movió el estado ni dejó aprendizaje (ej. "30min, sin novedades"),
  **no toques** la nota-módulo.
- **Curado, no transcript.** No copies el log entry literal. Destilá el estado. La fecha/tiempo ya viven en
  `log/*.json` — no los dupliques en el brain.
- Mostrale al usuario en 1 línea qué actualizaste en el brain, para que pueda corregir.
- Esto lo hace `/log` (con criterio del modelo). El logueo rápido desde el viewer NO actualiza el brain —
  es sólo registro de tiempo; la curación pasa cuando corrés `/log`.

## Output al usuario

Después de cada log:
- Confirmá la entry agregada/actualizada.
- Si hay plan de hoy con `estimated_hours` para esa task, mostrá diff: "estimaste 2h, llevás 2h25, +21%".
- Si la entry cierra la tarea (`status: done`), recordá si quedaba algo pendiente del plan del día.
- Si actualizaste el brain, decí qué módulo y qué cambió (1 línea).

## Reglas duras

- **Nunca** reemplazar `time_spent_min` — siempre sumar (varias sesiones por día son normales).
- **Nunca** editar el `.md` a mano. Regenerá desde JSON.
- **Nunca** pisar entries existentes sin upsert.
- Timestamp con timezone explícito (UTC-3 para Buenos Aires).
- **Siempre** evaluá actualizar el brain al cerrar el `/log` (paso fijo, no a demanda). Sólo el logueo rápido del viewer queda exento. Si un módulo no cambió de estado, no lo toques — pero la evaluación no se saltea.
