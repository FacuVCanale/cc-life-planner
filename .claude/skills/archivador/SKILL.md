---
name: archivador
description: Archiva tareas cerradas y resuelve estados partial/deferred del planner. Usá al ejecutar /archivar o como preparación de /plan-hoy.
---

# Archivador

Mantené `state/tasks.md` como backlog activo. Archivá lo cerrado, conservá lo pausado como trabajo vivo y no resucites tareas que el usuario declaró hechas.

## Alcance

- Lee `state/tasks.md`, `state/tasks-archive.md`, `state/tasks-pausadas.md` y el log de ayer.
- Escribe sólo esos archivos de tasks y las secciones derivadas `## Tasks activas`/`status` de las notas-proyecto afectadas.
- Nunca modifica `log/*.json` ni `Brain/Conventions/`.
- En el flujo operacional, `./scripts/drive-sync.sh pull` va antes de leer y `push` después de terminar.

## Reconciliación

La actualización más nueva y explícita del usuario prevalece. Una task `[x]` o una confirmación explícita del usuario habilitan su archivo. Un log `done` sobre una task todavía `[ ]` es una discrepancia a resolver; un evento de Calendar prueba un compromiso, no que una tarea se hizo. Si el usuario dice que algo ya está hecho, no crees una task de “verificarlo” ni lo devuelvas al backlog.

Toda edición es un delta: preservá tasks y secciones no mencionadas. Sólo retires una task activa si está cerrada, el usuario decide dropearla o autoriza pausarla.

## Modo silent

Si el usuario pasa `silent` o ya configuró no interrumpir el prepaso del planner, archivá sólo cierres ya autorizados (`[x]` o confirmación explícita vigente). No preguntes ni decidas sobre discrepancias log/tasks o partial/deferred: conservalas y reportalas pendientes. Sin esa elección, usá el flujo completo.

## Flujo

1. Archivá las tasks ya `[x]`. Si el usuario confirmó inequívocamente un cierre por ID, podés marcarlo `[x]` y archivarlo sin reconfirmar, respetando cualquier reapertura más reciente. Si sólo el log dice `done` y tasks sigue `[ ]`, pedí una decisión antes de marcar o archivar; mientras esté pendiente, excluí esa discrepancia de las recomendaciones de trabajo para no resucitarla.
2. Append a `state/tasks-archive.md` bajo `## Archivado YYYY-MM-DD (N tasks)`, agrupando por tema/módulo y conservando cada línea completa.
3. Quitá únicamente esas líneas de `tasks.md`; si una sección queda vacía, conservá sus headers con `- _vacía_`.
4. Revisá el log de ayer. Para cada `partial`/`deferred` que todavía exista activa, pedí una sola decisión: mantener, cambiar deadline, dividir o dropear. No preguntes por ad-hoc o tasks ya archivadas.
5. Regenerá entera `## Tasks activas` de cada nota-proyecto afectada desde `tasks.md`.
6. Si un módulo queda sin tasks: `status: cerrado` sólo cuando todo `## Cierre` está completo; en otro caso `status: dormido`.

Al dropear, archivá como `[DROP]` con fecha ISO y motivo del usuario. Si una nota-proyecto no existe, reportala pero no la crees desde esta skill.

## Tasks pausadas

`state/tasks-pausadas.md` guarda trabajo vivo sin dueño o fecha actual. Pausar y despausar requiere pedido o confirmación explícita del usuario.

- Al pausar, mové la línea completa bajo su tema/módulo y agregá `— PAUSADA YYYY-MM-DD: <motivo> · DESTRABA CUANDO: <condición>`.
- Al despausar, devolvela a su ubicación original sin el sufijo.
- El planner diario no usa este archivo como backlog.
- Si una condición parece cumplida, avisá; no muevas la task solo.

## Invariantes

- `tasks-archive.md` es append-only. Un ID duplicado se agrega y se reporta; no se reescribe historia.
- Una task activa nunca se borra sin decisión del usuario.
- Una dependencia abierta no impide archivar una task marcada `[x]`.
- Para una partial con sesiones anteriores, sumá el contexto temporal al preguntar.
- Usá fecha local America/Argentina/Buenos_Aires y formato ISO.

Reportá IDs archivados, decisiones sobre partial/deferred, módulos actualizados y cualquier nota-proyecto faltante.
