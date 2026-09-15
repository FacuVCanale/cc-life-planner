---
name: capturador
description: Registra tareas, objetivos o notas en cc-life-planner cuando el usuario pide guardarlos o invoca /capturar.
---

# Capturador

Convertí el contenido dado por el usuario al formato del planner sin volver a pedir datos ya presentes ni inventar los que faltan.

## Cuándo escribir

- Tarea concreta con resultado verificable → `state/tasks.md`.
- Objetivo o milestone amplio → `state/goals.md`.
- Idea todavía no accionable → `state/inbox.md`.

Un pedido de implementar, investigar o explicar algo no es por sí mismo un pedido de captura. Si el usuario dice que una tarea ya se hizo, no la agregues como pendiente ni inventes una task de verificación.

En el flujo operacional, ejecutá `./scripts/drive-sync.sh pull` antes de leer y `push` al terminar.

## Ediciones incrementales

Tratálas como deltas: conservá todos los ítems no mencionados. Actualizá una task existente cuando el usuario corrige su estado o campos; duplicá sólo si pide otra task distinta. Si confirma que terminó una task, marcala `[x]` conservando su ID y campos; `archivador` la trasladará al archivo en su siguiente ejecución. No inferir `done` de un evento de Calendar. Si pide una variante de una lista o artefacto, creá una versión nueva sin reemplazar la vigente.

## Tareas

Cada task vive bajo `## Tema` → `### Módulo`:

```markdown
- [ ] <título> (id: <slug-único>) — vence <YYYY-MM-DD|TBD> — est <Nh|TBD> — energía: <deep|shallow|admin> — depende: <id|nada>
```

- Inferí `id`, módulo, energía y `depende: nada` cuando sean inequívocos.
- Resolvé fechas relativas con la fecha local de America/Argentina/Buenos_Aires.
- Si deadline o estimación no fueron dados, usá `TBD`; no conviertas el dato faltante en bloqueo.
- Default de energía: `shallow`; dependencias sólo explícitas.
- Preguntá una sola aclaración corta únicamente si cambia archivo, módulo o identidad de la task.

## Goals e inbox

Goals: `## Corto plazo (semana/mes)`, `## Mediano plazo (semestre)`, `## Largo plazo (año+)`; formato `- <título> (deadline: <YYYY-MM-DD|sin deadline>)`. El corto plazo necesita deadline o `TBD` explícito.

Inbox es append-only: `- [YYYY-MM-DD HH:MM] <texto literal>`.

## Nota-proyecto

Después de crear o editar una task, localizá la nota por `module` con `node viewer/vault-extractor.js <slug>` o glob `~/second-brain/Projects/**/<slug>.md`; no hardcodees el contexto.

- Para una nota nueva, elegí una carpeta de contexto ya existente en `Projects/`; no crees contextos nuevos sin una decisión explícita del usuario.
- Si falta, creala según `~/second-brain/_meta/taxonomy.md` con `type: project`, `status: active`, `context`, `module`, `repos`, `people`, `companies`, `decisions`, `summary` y `tags`.
- Orden del cuerpo: `## Estado actual`, `## Cierre` si tiene final definible, `## Conocimiento (Brain)`, `## Tasks activas`, `## Aprendizajes`.
- Para un proyecto cerrable, usá el mínimo funcional ya definido en el pedido o la nota y expresalo como checklist; preguntá una sola vez sólo si falta esa decisión. Omití `## Cierre` en flujos continuos.
- Regenerá entera `## Tasks activas` desde `tasks.md`; la nota nunca es source of truth de tasks.
- Podés enlazar Brain desde Projects. No edites `Brain/Conventions/` sin confirmación explícita.

## Resultado

Mostrá archivo, sección e ítem exacto escrito. Mencioná sólo las suposiciones que puedan requerir corrección.
