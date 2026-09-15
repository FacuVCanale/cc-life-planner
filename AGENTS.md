# Reglas para Codex — cc-life-planner

Este archivo adapta `CLAUDE.md` a Codex. Las referencias a slash commands corresponden a las skills equivalentes `life-planner-*`.

## Idioma, fechas y estado

- Español rioplatense, voseo y tono directo.
- Archivos: fechas ISO `YYYY-MM-DD`; zona de usuario America/Argentina/Buenos_Aires (UTC-3), aunque la máquina esté en otra zona.
- La actualización más nueva y explícita del usuario prevalece. No resucites tareas declaradas hechas ni conviertas “verificar algo ya hecho” en una task nueva.
- Una edición parcial es un delta: conservá ítems no mencionados. Si una incompatibilidad obliga a retirar algo, explicalo en una línea. Una variante no sobrescribe el artefacto vigente.
- Separá hechos cumplidos, trabajo en curso y planes. Calendar prueba un compromiso, no por sí solo que una tarea se completó.

## Data operacional y Drive

`state/`, `plans/`, `log/` y `reviews/` no están en git; sincronizan por Google Drive.

Todo workflow que lea o escriba esa data ejecuta:

1. `./scripts/drive-sync.sh pull`
2. operación completa
3. `./scripts/drive-sync.sh push`

No omitas el push después de una escritura. Para ver el planner en Obsidian, `~/second-brain/life-planner` apunta a este repo.

## Write-set por workflow

| Skill | Lee | Escribe |
|---|---|---|
| onboarding | `state/*.md` | `state/context.md`, `goals.md`, `tasks.md`; bootstrap opcional en `~/second-brain/Projects/` |
| archivador | tasks, archive, pausadas, log de ayer | tasks/archive/pausadas; `## Tasks activas` y status de Projects afectadas |
| planner-diario | state, logs recientes, Calendar, Projects relevantes, repos relevantes | los dos `plans/YYYY-MM-DD.*` |
| capturador | tasks, goals, inbox | uno de esos archivos; nota Project del módulo afectado |
| logueador | plan/log del día; scanner git en ese modo | los dos `log/YYYY-MM-DD.*`; estado/cierre/aprendizajes Project si cambió |
| revisor-semanal | semana, goals/tasks, cierres | `reviews/YYYY-WW.md` |
| revisor-objetivos | goals, 30–90d, cierres | propone edits; modifica `goals.md` sólo con confirmación |

Si una skill necesita escribir fuera de su fila, requiere confirmación explícita.

## Sources of truth

- `state/tasks.md`: único source of truth de tasks activas.
- `state/tasks-archive.md`: historia append-only.
- `state/tasks-pausadas.md`: trabajo vivo pausado; sólo se mueve con confirmación. El planner diario no lo lee.
- `log/YYYY-MM-DD.json`: source of truth del log. El Markdown se regenera con `viewer/log-utils.js` (`upsertEntry`, `regenLogMd`).
- `plans/YYYY-MM-DD.json`: source of truth para el viewer; el Markdown es la vista humana equivalente.
- `~/second-brain`: conocimiento durable. Los días crudos permanecen en el planner.

## Vault y Projects

Las notas-proyecto viven en `~/second-brain/Projects/<Contexto>/<module>.md`. Localizalas por slug con `viewer/vault-extractor.js`; no hardcodees la carpeta.

Orden del cuerpo: `## Estado actual`, `## Cierre` si aplica, `## Conocimiento (Brain)`, `## Tasks activas`, `## Aprendizajes`. `Tasks activas` siempre se regenera desde `tasks.md`.

El frontmatter sigue `~/second-brain/_meta/taxonomy.md`: `type: project`, `status: active|dormido|cerrado|archived`, `context`, `module`, `repos`, `people`, `companies`, `decisions`, `summary`, `tags`.

Links Planner→Brain son one-way. Ninguna skill edita `Brain/Conventions/` sin confirmación explícita. No borres una nota Project al quedarse sin tasks: `cerrado` requiere checklist de cierre completo; de otro modo queda `dormido`.

## Plan diario

El plan es un tablero:

- `blocks[]`: sólo Calendar/buffers con `start`/`end`.
- `must_dos[]`: imprescindibles sin hora.
- `carriles[]`: trabajo flexible sin hora.
- `alertas[]`: riesgos/bloqueos.
- `proximos_anclas[]`: compromisos futuros con fecha.

El Markdown lleva las cinco secciones y footer de módulos; wikilinks sólo en Markdown. El schema detallado está en `.claude/skills/planner-diario/references/plan-schema.md` y el ejemplo canónico en `examples/plan.example.json`.

Repo scouts sólo para tareas candidatas de código cuyo estado pueda cambiar la decisión. Los scouts aportan estado/táctica. Un deadline duro requiere evidencia explícita del usuario, tasks, Calendar o un compromiso documentado en la nota-proyecto; no se infiere de actividad o menciones vagas.

## Privacidad

`state/`, `plans/`, `log/` y `reviews/` están en `.gitignore`. Nunca los commitees ni los dejes staged. El vault tiene su propio git.
