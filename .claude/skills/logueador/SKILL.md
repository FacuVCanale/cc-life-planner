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

## Actualizar el estado en el brain (al final del log)

El log crudo (`log/*.json`/`.md`) es temporal: importa para el planner (calibración, reviews). Pero el
**second brain** no guarda fechas — guarda el **estado de las cosas**. Por eso, al final de cada log, si la
sesión **cambió el estado** de un módulo o dejó un **aprendizaje durable**, actualizá la nota-módulo
correspondiente (`temas/<tema>/<modulo>.md`). El módulo lo sacás de `block.module` del plan (o del
`### Módulo` de la task en `tasks.md`).

Dos secciones de la nota-módulo:

- **`## Estado actual`** — snapshot vivo, **se sobrescribe** (no se acumula, sin fechas). 1-4 líneas en
  prosa: qué está hecho, qué falta, blocker actual, próximo paso. Reescribilo para que refleje dónde está
  el módulo **ahora**. Ej: tras loguear "encontré por qué el POS duplica tickets, es el cierre de caja",
  el `## Estado actual` de `ferr-ventas` pasa a *"El POS duplica tickets al cerrar caja. Causa identificada:
  doble submit en el cierre. Próximo: agregar lock al botón y testear con el cajero."*
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
