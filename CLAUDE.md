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
| `/onboarding` (onboarding) | `state/*.md` (para detectar contenido existente) | `state/context.md`, `state/goals.md`, `state/tasks.md` (incremental, con confirmación si hay contenido); **bootstrap de `temas/*.md`** (opcional, incluye `## Cierre`) |
| `/archivar` (archivador) | `state/tasks.md`, `log/YYYY-MM-DD.json` (ayer) | `state/tasks.md` (remueve `[x]`), `state/tasks-archive.md` (append); **regenera `## Tasks activas` de los `temas/*.md` afectados** (`status: cerrado` si el `## Cierre` está completo, si no `dormido` si quedan en 0). Para partial/deferred consulta al user antes de editar. |
| `/plan-hoy` (planner-diario) | `state/*.md`, `log/` últimos 7d, Google Calendar, **`## Cierre` de notas-módulo**, **repo scouts sobre `~/code/*`** | `plans/YYYY-MM-DD.md` (tablero: ⏰FIJO/🎯MUST-DO/🚦CARRILES/⚠️ALERTAS/🔭PRÓXIMOS + footer `[[modulo]]`), `plans/YYYY-MM-DD.json` (`blocks`=anclas FIJOS + `must_dos`/`carriles`/`alertas`/`proximos_anclas`). **Invoca `archivador` antes.** |
| `/capturar` (capturador) | `state/tasks.md`, `state/goals.md` | `state/tasks.md` o `state/goals.md` o `state/inbox.md`; **crea/actualiza `temas/<tema>/<modulo>.md`** (incluye `## Cierre` si el proyecto tiene cierre definible) |
| `/log` (logueador) | `plans/YYYY-MM-DD.json` (infiere task_id/`module`); **`scripts/git-day-scan.js` + `state/repo-map.json`** (modo git) | `log/YYYY-MM-DD.json`, `log/YYYY-MM-DD.md` (+ footer `[[modulo]]`); **actualiza `## Estado actual`/`## Cierre`/`## Aprendizajes` de la nota-módulo si la sesión cambió el estado** |
| `/revisar-semana` (revisor-semanal) | `log/` semana, `state/goals.md`, **`## Cierre` de módulos** | `reviews/YYYY-WW.md` (+ `[[modulo/tema]]` y footer; reporta avance-hacia-cierre) |
| `/revisar-objetivos` (revisor-objetivos) | `state/goals.md`, `log/` últimos 30-90d, **`## Cierre` de módulos** | sugiere edits a `state/goals.md` (con confirmación; verdicts `cerca-de-cierre`/`scope-creep`) |

Regla: si una skill necesita modificar un archivo fuera de su columna "escribe", **pedí confirmación al usuario** antes de tocar.

## Capa de conocimiento (`temas/`) y grafo de Obsidian

El vault de Obsidian de Facu accede al repo vía symlink: `~/second-brain/life-planner` → `~/code/cc-life-planner`
(el git del vault gitignorea `/life-planner`; la data sincroniza por Drive, no por el git del vault). Para que
el grafo sea un **mapa de conocimiento** y no una nube de fechas, hay una jerarquía de notas-MOC en `temas/`:
**categoría → tema → módulo**. El principio: **el brain guarda el ESTADO de las cosas, no las fechas.**

**Anatomía de una nota-módulo** (`temas/<tema>/<modulo>.md`), en orden:
- `## Estado actual` — snapshot vivo del módulo, **se sobrescribe** (sin fechas). Lo mantiene el `logueador`.
- `## Conocimiento (Brain)` — links one-way a notas de `Brain/` (ej. `[[supabase]]`, `[[ml]]`).
- `## Tasks activas` — **vista derivada** de `tasks.md` (se regenera, nunca al revés), texto plano (las tasks no son nodos).
- `## Aprendizajes` — decisiones/hallazgos durables, **se acumula** (append), sólo señal alta.

Reglas:
- **`state/tasks.md` es el único source of truth de tasks.** Cada task vive bajo un `## Tema` → `### Módulo`.
  El `### Módulo` determina `block.module` en el JSON del plan y a qué nota-módulo pertenece.
- **El brain tiene el estado, los días no van al grafo.** El `logueador`, al final de `/log`, actualiza
  `## Estado actual` / `## Aprendizajes` del módulo si la sesión cambió algo (distila, no copia el log). Los
  días crudos (`plans/`, `log/`) siguen en repo/Drive (los usa el planner para calibración/reviews) pero están
  **excluidos del grafo** vía `.obsidian/app.json` → `userIgnoreFilters`. El logueo rápido del **viewer** NO
  actualiza el brain (sólo registra tiempo); la curación pasa en `/log`.
- **Wikilinks sólo en los `.md`** (temas/reviews; plans/log llevan footer `[[modulo]]` pero están fuera del
  grafo), **nunca en el JSON** (el viewer consume JSON). Nunca linkees día↔día ni tasks individuales.
- **Links planner→Brain son one-way.** Una nota-módulo linkea a `Brain/`, pero **ninguna skill edita `Brain/`**
  sin confirmación del usuario.
- **`temas/` está en `.gitignore`** (dato personal, como `state/`/`plans/`/`log/`/`reviews/`): sincroniza por
  Drive (`drive-sync.sh` incluye `temas`), no por git.
- Config del grafo (en el vault, no en el repo): `~/second-brain/.obsidian/app.json` → `userIgnoreFilters`
  excluye `life-planner/{plans,log,examples,scripts,viewer,docs}` del grafo/búsqueda; `graph.json` →
  `showOrphans: false` + color groups por `path` (`life-planner/temas` = verde, `Brain` = violeta,
  `life-planner/reviews` = ámbar). **Ojo:** editar `.obsidian/*.json` con Obsidian abierto lo pisa (editá con
  la app cerrada); y agregar carpetas dentro del symlink necesita **quit+relaunch** de Obsidian (Cmd+R no basta).

## Source of truth para logs

- `log/YYYY-MM-DD.json` es el **source of truth**. Schema: `{date: string, entries: [{task_id, time_spent_min, status, notes, timestamp}]}`.
- `log/YYYY-MM-DD.md` es una **vista**: regenerarla siempre desde el JSON, nunca editar el `.md` a mano.
- El skill `logueador` y el endpoint `POST /api/log` del viewer comparten la misma lógica de upsert (key: `task_id`), centralizada en `viewer/log-utils.js` (`upsertEntry` + `regenLogMd`). No la dupliques: importá de ahí.
- **Logueo auto desde git** (modo del `/log`): `scripts/git-day-scan.js YYYY-MM-DD` lee commits del autor (de `state/repo-map.json`) en `~/code/*`, los agrupa en sesiones (gap >90min) y propone entries. El tiempo es **estimado** del span de commits, no medido. El usuario confirma antes del upsert.

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

`state/`, `plans/`, `log/`, `reviews/`, `temas/` están en `.gitignore`. **Nunca** commitees archivos de esas carpetas, ni siquiera por error. Si el usuario te pide commit, validá con `git status` que no haya archivos de esas rutas staged.
