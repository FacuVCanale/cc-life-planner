---
name: onboarding
description: Inicializa o completa context.md, goals.md y tasks.md de cc-life-planner cuando el usuario quiere configurar el planner.
---

# Onboarding

Dejá el planner utilizable con contexto, objetivos y tareas suficientes. Aceptá información en bulk y no fuerces una entrevista si el usuario ya dio los datos.

## Inicio

En el flujo operacional, ejecutá `./scripts/drive-sync.sh pull`. Leé `state/context.md`, `state/goals.md` y `state/tasks.md`.

- Si están vacíos, completalos incrementalmente.
- Si contienen datos, preservalos y agregá el delta. Sobrescribir requiere confirmación explícita.
- Una corrección nueva del usuario reemplaza el dato viejo; no resucites tareas declaradas hechas.

Hacé como máximo una pregunta por turno, agrupando campos relacionados. Los datos faltantes no esenciales quedan como `TBD`.

## Contexto

Capturá:

- Recurrentes con día/hora y `attention: full|partial|passive` (`full` por default).
- Ventanas de energía.
- Capacidad, días cortos, buffers y hábitos diarios.

Guardá fechas en ISO y usá America/Argentina/Buenos_Aires. Los hábitos viven en `state/context.md`, no en tasks.

## Objetivos

Usá los horizontes corto, mediano y largo. No conviertas algo planificado en logrado. Si un horizonte no aplica, dejalo explícitamente vacío.

## Tareas

Trabajá por tema/módulo y escribí:

```markdown
- [ ] <título> (id: <slug>) — vence <YYYY-MM-DD|TBD> — est <Nh|TBD> — energía: <deep|shallow|admin> — depende: <id|nada>
```

Toda edición es delta: conservá ítems no mencionados. Una tarea ya hecha no entra como pendiente. Si faltan deadline o estimación, usá `TBD`; el planner aplica defaults por energía.

## Bootstrap opcional del vault

Sólo si el usuario lo acepta, creá notas en `~/second-brain/Projects/` según la taxonomía vigente. Localizá por `module`, no por carpeta hardcodeada.

Cada nota-módulo usa, en orden: `## Estado actual`, `## Cierre` si tiene final definible, `## Conocimiento (Brain)`, `## Tasks activas`, `## Aprendizajes`. `Tasks activas` se deriva de `tasks.md`. No edites `Brain/Conventions/`.

## Cierre

Mostrá cantidad de tareas, goals y restricciones. Señalá `TBD` y goals cortos sin acción asociada. Si el usuario pide planificar, pasá a `planner-diario`; no lo conviertas en un paso obligatorio. Ejecutá `./scripts/drive-sync.sh push` después de las escrituras operacionales.
