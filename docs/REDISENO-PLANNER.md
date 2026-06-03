# Rediseño del planner — spec de implementación

Acordado con Facu (2026-06-03). Objetivo: que el planner entienda **qué estás haciendo** (no ordene tasks abstractas), partiendo de cómo laburás de verdad (multitasking, 10-12h, trabajo emergente, proyectos que se expanden). Ver memoria `feedback-plan-tablero-hibrido`, `user-como-labura-facu`.

## Principio de no-ruptura

El viewer (`viewer/viewer.js`), `serve.js:computeStats`, `stats.js`, `revisor-semanal` y `scripts/backfill-grafo.js` dependen de `plan.blocks[]` con `start`/`end`. **Todos los cambios de schema son ADITIVOS**: se mantienen `blocks` (anclas con hora) y se agregan arrays nuevos top-level. El viewer ignora claves desconocidas → no rompe. Render nuevo = cambio aditivo.

---

## Feature 1 — Logueo auto desde git  ✅ (base)

**Qué:** un modo nuevo del `/log` que lee los commits del día en `~/code/*` y propone las entries (task_id, ventana horaria real estimada del span de commits, notas desde los mensajes). El usuario confirma/edita → upsert.

**Artefactos:**
- `viewer/log-utils.js` — extrae `upsertEntry` + `regenLogMd` de `serve.js` (mata la duplicación; `serve.js` lo `require`a). Contrato byte-idéntico se preserva.
- `scripts/git-day-scan.js` — `node scripts/git-day-scan.js YYYY-MM-DD` → JSON `{date, repos:[{repo, task_id, module, first, last, minutes, commits:[...], notes}]}`. Heurística de tiempo = `last - first` commit del día por repo (marcado como estimado).
- `state/repo-map.json` — mapeo `repo → {task_id|task_id_template, module}`. Editable. Default sembrado del histórico.
- `logueador/SKILL.md` — 4º modo de invocación: `git`. Comportamiento = como `/log` (sí cura el brain).

**Mapeo repo→task_id (`state/repo-map.json`):**
- `GS-VTO` → `gsvto-widget` / módulo `gsvto-widget`
- `fluxnet-processing` → `ad-hoc-fluxnet-<fecha>` / módulo `alethia-ai`
- `Overworld` → `ad-hoc-overworld-<fecha>` / módulo `alethia-app`
- `alethia-oneflux`, `ONEFlux` → `alethia-pdd-review-ciencia` / módulo `alethia-pdd`
- `tpf-ing-soft` → `ingsoft-adenda-2` / módulo `uni-ingsoft`
- `cc-life-planner` → `ad-hoc-planner-<fecha>` / (sin módulo)
- fallback → `ad-hoc-<repo>-<fecha>`

## Feature 2 — Plan = tablero de decisión híbrido

**Qué:** el plan deja de ser agenda. Secciones: `⏰ FIJO` (calendar con hora, inamovible) · `🎯 MUST-DO` (deadline duro) · `🚦 CARRILES` (flexible/concurrente, sin hora) · `⚠️ ALERTAS` · `🔭 PRÓXIMOS ANCLAS`. Alimentado por **repo scouts** (subagentes por repo activo, antes de schedular).

**Schema aditivo de `plans/*.json`:**
- `blocks[]` — **sólo anclas FIJOS** (calendar con hora) + buffers. Mantiene `start`/`end` → viewer/stats no rompen.
- `must_dos[]` — `{title, task_id?, module?, deadline, why, tactical?}` (sin hora).
- `carriles[]` — `{lane, title, task_id?, module?, concurrent_with?, note}` (sin hora).
- `alertas[]` — `{kind: deadline|cabo-suelto|scope-creep|bloqueador, text}`.
- `proximos_anclas[]` — `{date, text}`.
- `repo_scouts[]` (opcional, debug) — resumen por repo.

**Cambios:** `planner-diario/SKILL.md` (metodología tablero + paso repo-scouts + leer `## Cierre`), `viewer/viewer.js` + `styles.css` (render aditivo de las 4 secciones nuevas), `examples/plan.example.json`, CLAUDE.md (schema). Regla dura "no inventes deadlines fuera de tasks.md" se relaja a: los scouts proponen contexto/tactical, pero deadlines duros sólo de tasks.md/calendar.

## Feature 3 — Tracking de cierre de proyectos abiertos

**Qué:** nueva sección `## Cierre` en las notas-módulo de proyectos abiertos. Separa el **mínimo funcional para cerrar** (criterios curados, estables) del scope creep.

**Anatomía nueva de nota-módulo** (orden): `## Estado actual` → **`## Cierre`** → `## Conocimiento (Brain)` → `## Tasks activas` → `## Aprendizajes`.
- `## Cierre` contiene: "**Mínimo funcional:**" (qué define cerrado) + checklist `- [ ]/[x]` de progreso. Frontmatter gana `status: cerrado` (además de `activo`/`dormido`).
- **Quién mantiene:** define el mínimo → capturador/onboarding (al crear módulo). Progreso → logueador (al cerrar `/log`). `status: cerrado` → archivador/logueador al alcanzar el mínimo.

**Cambios en skills:**
- `capturador` + `onboarding`: sumar `## Cierre` al template de nota-módulo nueva.
- `logueador`: actualizar checklist de `## Cierre` junto a `## Estado actual`.
- `planner-diario`: leer `## Cierre` → empujar MUST-DO hacia el mínimo + alerta `scope-creep` si se agregan features fuera del mínimo.
- `revisor-objetivos`: verdict `cerca-de-cierre` / `scope-creep`.
- `archivador`: distinguir `cerrado` (mínimo alcanzado) de `dormido` (0 tasks por inactividad).
- `revisor-semanal`: reportar avance-hacia-cierre.

---

## Estado de implementación
- [x] **F1** (verificada en vivo): `viewer/log-utils.js` (compartido, mata duplicación), `scripts/git-day-scan.js` (sesiones, gap 90min), `state/repo-map.json`, modo 4 en `logueador/SKILL.md`. Scan de hoy corrió: GS-VTO 154min + fluxnet 181min. Fix: el email de commits es `FacuVCanale@users.noreply.github.com`.
- [x] **F3**: convención `## Cierre` + seed `gsvto-widget.md` y `alethia-pdd.md`; hooks en `capturador` (template), `onboarding` (template), `logueador` (mantenimiento), `archivador` (`status: cerrado` vs `dormido`), `revisor-objetivos` (verdicts `cerca-de-cierre`/`scope-creep`), `revisor-semanal` (avance-hacia-cierre).
- [x] **F2**: `planner-diario/SKILL.md` reescrito (paradigma tablero + repo scouts + tracking cierre + schema aditivo); `viewer/viewer.js` render aditivo + `.alerta-kind` en styles.css; `examples/plan.example.json` migrado; CLAUDE.md actualizado (tabla + schema). Verificado que NO rompe viewer/stats.

## Verificación visual (✅ hecha 2026-06-03 con Playwright)
- Regeneré `plans/2026-06-03` al formato tablero con datos reales de los scouts y lo abrí en el viewer.
- Confirmado: timeline con los anclas FIJOS (Robótica passive, CEO JPMorgan) bien posicionados + las 4 secciones nuevas (🎯/🚦/⚠️/🔭) renderizando, chips de `alerta.kind` con estilo. Sin errores de consola (salvo favicon 404). No rompió la timeline ni el side panel existente.

## Próximo (cuando planifiques)
- Correr `/plan-hoy` real con el modo tablero (scouts en vivo + 5 secciones) para validar el flujo completo de generación end-to-end.

## Diseño del viewer — BRIEF editorial (mantener, no volver a "dashboard")

Facu rechazó el look dashboard (cards de colores, badges, grid con huecos = "vibecodeado"). El viewer es **lo que un asistente te da para el día**: un brief editorial. Reglas firmes (ver memoria `feedback-viewer-diseno`):
- **Una sola columna** (~720px, tipo documento), monocromo slate, 1px dividers, sin cards de colores, tipografía protagonista, mucho aire. Guía: skill `minimalist-ui`.
- **Orden:** encabezado (fecha grande + síntesis del día) → **Tu día** (agenda) → **Lo que importa** (must-do) → **En paralelo** (carriles) → **Ojo con** (alertas) → **Lo que viene** → **Notas**.
- **Labels humanos** (no "MUST-DO/CARRILES"), sin emojis. Números en mono/tabular.
- **Descripción al abrir:** items de "Lo que importa" y "En paralelo" colapsados = solo título + meta + toggle `+/−`; al click abren la descripción + el form de logueo (`.loggable[data-task-id]`).
- **Alertas:** punto por severidad (no chips). **Lane de carril por proyecto** (Alethia/Overworld = `alethia`, no `uni`).
- Zero-dep (vanilla). Skills taste global en `~/.claude/skills/`.
- **`/plan-hoy` abre el viewer solo** → `scripts/open-viewer.sh` (paso 8 del command).
