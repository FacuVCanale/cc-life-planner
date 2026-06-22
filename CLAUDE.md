# Reglas globales — cc-life-planner

Estas reglas aplican a todas las skills y slash commands de este repo. Léelas antes de cualquier acción.

## Idioma y tono

- Respondé siempre en **español rioplatense** (voz "vos", no "tú").
- Tono terso, directo. Sin disclaimers, sin "¡claro!", sin emojis salvo que el usuario los use.
- Justificaciones explícitas pero cortas: una línea por decisión.

## Convención de fechas

- **Siempre** ISO `YYYY-MM-DD` en archivos.
- En diálogo con el usuario podés decir "mañana" / "el viernes", pero al escribir a archivos resolvelo a fecha absoluta usando la fecha del sistema.
- Hora local del usuario: America/Argentina/Buenos_Aires (UTC-3).

## Quién edita qué

Cada slash command edita sólo sus archivos. No mezclar.

| Comando / skill | Lee | Escribe |
|---|---|---|
| `/onboarding` (onboarding) | `state/*.md` (para detectar contenido existente) | `state/context.md`, `state/goals.md`, `state/tasks.md` (incremental, con confirmación si hay contenido); **bootstrap de notas-proyecto en `~/second-brain/Projects/`** (opcional, incluye `## Cierre`) |
| `/archivar` (archivador) | `state/tasks.md`, `log/YYYY-MM-DD.json` (ayer) | `state/tasks.md` (remueve `[x]`), `state/tasks-archive.md` (append); **regenera `## Tasks activas` de las notas-proyecto del vault afectadas** (`status: cerrado` si el `## Cierre` está completo, si no `dormido` si quedan en 0). Para partial/deferred consulta al user antes de editar. |
| `/plan-hoy` (planner-diario) | `state/*.md`, `log/` últimos 7d, Google Calendar, **`## Cierre` de notas-módulo**, **repo scouts sobre `~/code/*`** | `plans/YYYY-MM-DD.md` (tablero: ⏰FIJO/🎯MUST-DO/🚦CARRILES/⚠️ALERTAS/🔭PRÓXIMOS + footer `[[modulo]]`), `plans/YYYY-MM-DD.json` (`blocks`=anclas FIJOS + `must_dos`/`carriles`/`alertas`/`proximos_anclas`). **Invoca `archivador` antes.** |
| `/capturar` (capturador) | `state/tasks.md`, `state/goals.md` | `state/tasks.md` o `state/goals.md` o `state/inbox.md`; **crea/actualiza `~/second-brain/Projects/<Contexto>/<modulo>.md`** (incluye `## Cierre` si el proyecto tiene cierre definible) |
| `/log` (logueador) | `plans/YYYY-MM-DD.json` (infiere task_id/`module`); **`scripts/git-day-scan.js` + `state/repo-map.json`** (modo git) | `log/YYYY-MM-DD.json`, `log/YYYY-MM-DD.md` (+ footer `[[modulo]]`); **actualiza `## Estado actual`/`## Cierre`/`## Aprendizajes` de la nota-módulo si la sesión cambió el estado** |
| `/revisar-semana` (revisor-semanal) | `log/` semana, `state/goals.md`, **`## Cierre` de módulos** | `reviews/YYYY-WW.md` (+ `[[modulo/tema]]` y footer; reporta avance-hacia-cierre) |
| `/revisar-objetivos` (revisor-objetivos) | `state/goals.md`, `log/` últimos 30-90d, **`## Cierre` de módulos** | sugiere edits a `state/goals.md` (con confirmación; verdicts `cerca-de-cierre`/`scope-creep`) |

Regla: si una skill necesita modificar un archivo fuera de su columna "escribe", **pedí confirmación al usuario** antes de tocar.

## Capa de conocimiento (vault `~/second-brain`) y la frontera con el planner

**El conocimiento durable vive en el vault de Obsidian (`~/second-brain`), no en el planner.** El planner es la
capa **operacional** (tasks, planes, logs, reviews); el vault es el **hub de conocimiento** (estado de
proyectos, personas, empresas, decisiones, lecciones). El planner accede al vault por **ruta absoluta**
`~/second-brain/` (Obsidian lo navega al revés vía el symlink `~/second-brain/life-planner` → este repo).
Principio: **el brain guarda el ESTADO de las cosas, no las fechas.**

**Las notas-proyecto** (antes `temas/<tema>/<modulo>.md`) ahora viven en **`~/second-brain/Projects/<Contexto>/<modulo>.md`**
(`type: project`). Se localizan por el **`module` slug** (glob `Projects/**/<modulo>.md`) — usá el extractor
`viewer/vault-extractor.js`, no hardcodees la carpeta de contexto. Anatomía (en orden), sin cambios:
- `## Estado actual` — snapshot vivo, **se sobrescribe** (sin fechas). Lo mantiene el `logueador`.
- `## Cierre` — checklist del mínimo funcional. El planner lo lee para priorizar.
- `## Conocimiento (Brain)` — links one-way a `Brain/` (ej. `[[supabase]]`, `[[ml]]`).
- `## Tasks activas` — **vista derivada** de `tasks.md` (se regenera, nunca al revés).
- `## Aprendizajes` — decisiones/hallazgos durables, **se acumula** (append), señal alta.

Frontmatter de la nota-proyecto (lo fija el schema del vault `~/second-brain/_meta/taxonomy.md`):
`type: project` · `status: active|dormido|cerrado|archived` · `context: trabajo|estudio|vida` · `module: <slug>`
· `repos` · `people` · `companies` · `decisions` · `summary` · `tags`.

**Extractor (lectura) — el planner LEE el vault, no parsea a mano:**
`const { extractModuleState, listProjects } = require('./viewer/vault-extractor')`.
`extractModuleState('gsvto-widget')` → `{status, summary, estado_actual, cierre:[{text,done}], cierre_pendiente,
aprendizajes, people, companies, repos}`. Lo usan `planner-diario` y `revisor-*` para leer estado/cierre.
CLI rápida: `node viewer/vault-extractor.js <slug>` (o sin args lista proyectos activos).

**Productor (escritura) — el planner ESCRIBE el vault:** el `logueador` (al cerrar `/log`) y el `capturador`
escriben `## Estado actual` / `## Cierre` / `## Aprendizajes` / `## Tasks activas` directo en la nota de
`~/second-brain/Projects/` del vault. El `git-day-scan` sigue capturando avances de `~/code/*`; su destilado
va al vault.

Reglas:
- **`state/tasks.md` es el único source of truth de tasks.** Cada task vive bajo `## Tema` → `### Módulo`; el
  `### Módulo` (slug) determina `block.module` y a qué nota-proyecto del vault pertenece.
- **El brain tiene el estado; los días no van al grafo.** `plans/` y `log/` crudos quedan en el planner
  (calibración/reviews), fuera del vault. El logueo rápido del **viewer** NO cura el vault (sólo registra
  tiempo); la curación pasa en `/log`.
- **Wikilinks sólo en los `.md`** del vault, **nunca en el JSON** (el viewer consume JSON).
- **Links planner→Brain son one-way.** Una nota-proyecto linkea a `Brain/`, pero **ninguna skill edita
  `Brain/Conventions/`** sin confirmación del usuario (el resto de `Projects/` sí lo mantiene el planner).
- El vault está en **git/GitHub** (no en Drive). `temas/` quedó **obsoleto** (migrado a `Projects/`).
- Editar `.obsidian/*.json` con Obsidian abierto lo pisa (editá con la app cerrada).

## Source of truth para logs

- `log/YYYY-MM-DD.json` es el **source of truth**. Schema: `{date: string, entries: [{task_id, time_spent_min, status, notes, timestamp}]}`.
- `log/YYYY-MM-DD.md` es una **vista**: regenerarla siempre desde el JSON, nunca editar el `.md` a mano.
- El skill `logueador` y el endpoint `POST /api/log` del viewer comparten la misma lógica de upsert (key: `task_id`), centralizada en `viewer/log-utils.js` (`upsertEntry` + `regenLogMd`). No la dupliques: importá de ahí.
- **Logueo auto desde git+GitHub** (modo del `/log`): `scripts/git-day-scan.js YYYY-MM-DD` captura el trabajo del autor (de `state/repo-map.json`) en `~/code/*` y propone entries. Mira commits de **todas las ramas** (`git log --all`, no solo el HEAD), **deduplica worktrees** del mismo repo (`GS-VTO*` comparten `.git`), y suma **actividad de GitHub** (PRs/reviews/comentarios/issues vía `gh search`, on por default, `--no-github` la apaga, degrada a solo-git si no hay auth/red). El tiempo es **estimado**, no medido (commits = span de sesiones; GitHub = costo fijo por evento). El usuario confirma antes del upsert.

## Schema del plan diario

Cuando `/plan-hoy` genera un plan, **siempre** escribe los dos archivos:
- `plans/YYYY-MM-DD.md` — **tablero** humano: ⏰FIJO / 🎯MUST-DO / 🚦CARRILES / ⚠️ALERTAS / 🔭PRÓXIMOS ANCLAS (ver `planner-diario/SKILL.md`).
- `plans/YYYY-MM-DD.json` — data estructurada (schema completo en `.claude/skills/planner-diario/SKILL.md`).

El plan es un **tablero de decisión**, no una agenda horaria (Facu no ejecuta en agenda — ver `state/context.md`). El JSON es **aditivo**: `blocks[]` lleva sólo los anclas FIJOS del calendar (con `start`/`end`, para no romper viewer/stats), y el trabajo flexible vive en `must_dos[]` / `carriles[]` / `alertas[]` / `proximos_anclas[]`. El planner corre **repo scouts** (subagentes por repo de `~/code/*`) antes de armar el tablero, y lee `## Cierre` de las notas-módulo.

El viewer **sólo** consume el JSON. Si tocás el schema, actualizá también el viewer (`viewer/viewer.js`) y `examples/plan.example.json`.

Campos no obvios de un block:
- `module` (opcional): slug del módulo de la task (derivado del `### Módulo` bajo el que vive en `tasks.md`). Alimenta los `[[modulo]]` de las notas-día y el footer que regenera el viewer. El viewer lo ignora para su UI.
- `id` (opcional, requerido si otro block referencia con `concurrent_with`): slug determinístico para identificar el bloque.
- `attention` (solo en bloques `type: calendar`): `full` | `partial` | `passive`. Default `full`.
- `concurrent_with` (opcional): id del block padre con el que comparte slot. Solo permitido si el padre tiene `attention: partial` (hijo debe ser shallow/admin) o `passive` (cualquier energía).
- `estimated_hours_default: true` (opcional): la estimación se aplicó por default según energía porque la tarea tenía `est: TBD`. El viewer la muestra con asterisco.

## Categorías

Las categorías para colorear bloques se definen en cada `plans/*.json` bajo el campo `categories: {nombre: color_hex}`. Reusá las del último plan a menos que el usuario agregue una nueva. Default palette:

- `ferreteria`: `#f59e0b` (ámbar)
- `cocina`: `#10b981` (verde)
- `gimnasio`: `#3b82f6` (azul)
- `personal`: `#a78bfa` (violeta)
- `calendar`: `#94a3b8` (gris — eventos externos)
- `buffer`: `#e5e7eb` (gris claro — descansos/transiciones)

## Privacidad

`state/`, `plans/`, `log/`, `reviews/` están en `.gitignore`. **Nunca** commitees archivos de esas carpetas, ni siquiera por error. Si el usuario te pide commit, validá con `git status` que no haya archivos de esas rutas staged. (El conocimiento durable ya no vive en el planner: está en el vault `~/second-brain`, que tiene su propio git.)
