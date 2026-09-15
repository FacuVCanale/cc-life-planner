---
name: logueador
description: Registra tiempo o estado de trabajo en el log diario del planner, incluido el modo estimado desde git/GitHub.
---

# Logueador

Registrá lo que realmente ocurrió en `log/YYYY-MM-DD.json` y regenerá su vista Markdown. No conviertas planes o eventos de Calendar en logros.

## Contrato

- JSON es source of truth: `{date, entries:[{task_id,time_spent_min,status,notes,timestamp}]}`.
- Estados: `done | partial | deferred | skipped`.
- Usá timestamps ISO con offset `-03:00` y la fecha local de America/Argentina/Buenos_Aires.
- `log/YYYY-MM-DD.md` siempre se regenera; nunca se edita a mano.
- El flujo operacional hace `./scripts/drive-sync.sh pull` antes de leer y `push` después de terminar.

Para escribir, importá `upsertEntry` y `regenLogMd` desde `viewer/log-utils.js`. No copies ni reimplementes su algoritmo. `upsertEntry` suma sesiones del mismo `task_id`, conserva el último estado/timestamp y concatena notas.

## Horas de frente

Logueá el tiempo del frente de trabajo, incluido trabajo ejecutado por agentes. La suma diaria puede superar 24h: no prorratees ni preguntes por horas-persona para forzarla a cerrar. Conservá el contexto de viaje u otra simultaneidad en `notes`.

## Modos

### Texto libre

Mapeá contra `plans/YYYY-MM-DD.json` y el log existente. Inferí sólo lo inequívoco; si dos IDs son plausibles, preguntá cuál. Si el usuario ya dio task, tiempo y estado, escribí sin reconfirmar.

### Sin argumentos

Mostrá plan resumido, log actual y los datos faltantes. Pedí una única actualización concreta.

### Viewer

`POST /api/log/:date` ya usa los mismos helpers. No dupliques lógica ni edites este camino desde la skill.

### Git/GitHub estimado

Corré `node scripts/git-day-scan.js YYYY-MM-DD`. El script cubre todas las ramas, deduplica worktrees y degrada a sólo git si GitHub no está disponible.

Mostrá las proposals con repo, `task_id`, minutos, ventana y actividad GitHub. Como los tiempos son estimados, pedí confirmación sólo si todavía no fue dada; una autorización previa para aceptar la propuesta persiste. Escribí únicamente las filas aceptadas. Para repos sin mapping, usá el ad-hoc propuesto y ofrecé actualizar `state/repo-map.json` fuera de esta escritura.

### Calendar — clases y reuniones

Cuando el usuario pide loguear el día completo o desde Calendar, consultá los eventos del día en los calendarios `facundovcanale@gmail.com` y `Universidad`. Usá el conector Google Calendar disponible: en Claude puede exponerse como `mcp__claude_ai_Google_Calendar__list_events`; en Codex descubrí su equivalente, sin asumir ese identificador. Si no está disponible, reportá el dato faltante y continuá con las fuentes accesibles.

Proponé una entry por evento con `task_id: calendar-<slug>-<YYYY-MM-DD>` y duración prevista editable. Registrá sólo asistencia/estado y minutos confirmados: asistió → `done`, parcial → `partial`, no asistió → omitir o `skipped` si lo pide. Una confirmación ya dada no se vuelve a pedir. Inferí módulo sólo con mapping inequívoco del plan/contexto; si falta, no lo inventes. Combiná propuestas git y Calendar en una sola revisión y no dupliques la misma actividad. Actividades diferentes simultáneas conservan entradas separadas y notas de simultaneidad, según horas de frente.

## Reconciliación y curación

La corrección más nueva del usuario prevalece. Calendar indica intención/compromiso, nunca prueba `done`. No reabras ni recrees una task que el usuario declaró hecha.

Después del upsert, si cambió el estado durable del módulo, actualizá su nota-proyecto localizada por `module`:

- Sobrescribí `## Estado actual` con el snapshot vigente, sin fechas.
- Marcá en `## Cierre` sólo hitos demostrados por el log o confirmados por el usuario.
- Append en `## Aprendizajes` sólo decisiones/hallazgos durables y de señal alta.
- Regenerá `## Tasks activas` desde `tasks.md` si cambió una task.
- Seteá `status: cerrado` sólo si el checklist de cierre quedó completo.

No edites `Brain/Conventions/` ni inventes hechos ausentes. Ofrecé archivador si se cerró una task, sin ejecutarlo fuera del write-set autorizado.

Reportá entries agregadas/actualizadas, total del día, estimaciones aceptadas y notas-proyecto curadas.
