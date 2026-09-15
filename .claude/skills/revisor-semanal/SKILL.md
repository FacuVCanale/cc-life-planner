---
name: revisor-semanal
description: Revisa una semana cerrada del planner y propone ajustes basados en logs y avance verificable.
---

# Revisor semanal

Generá `reviews/YYYY-WW.md` con una lectura honesta de ejecución, goals y cierre de proyectos.

## Fuentes

Ejecutá `./scripts/drive-sync.sh pull`. Leé los siete días de `plans/*.json` y `log/*.json`, tasks/goals vigentes y `## Cierre` de módulos relacionados mediante `viewer/vault-extractor.js`.

## Métricas con cobertura explícita

Desde el tablero, `blocks[]` contiene sólo Calendar/buffers. El trabajo planeado vive en `must_dos[]` y `carriles[]` sin duración. Por eso:

- `completion_rate`: calculalo sólo sobre ítems planeados con `task_id` que puedan vincularse inequívocamente con logs. Informá numerador, denominador y cobertura. Sin cobertura suficiente, no publiques un porcentaje total.
- `plan vs real`: compará minutos sólo donde exista una estimación válida. No derives `planned_min` de Calendar ni inventes duración para carriles.
- Calibración: informá por categoría cuando haya pares estimado/real; no recomiendes un factor escalar global.
- Calendar prueba compromisos, no tasks cumplidas.

El log real, la actividad vinculada a goals y el avance en `## Cierre` son las señales principales.

## Análisis

- Horas y resultados por goal con vínculo verificable; declaralos sin actividad cuando corresponda.
- Distribución por día/categoría sólo si el patrón tiene base suficiente.
- Para cada proyecto cerrable: ítems que avanzaron, mínimo restante y posible scope creep.
- Una corrección del usuario prevalece. No resucites trabajo declarado hecho ni conviertas planes en logros.

## Output

Usá frontmatter `tipo: review`, `capa: fecha`, período ISO, hallazgos cuantificados con sus límites y sugerencias accionables. Wikilinks sólo a módulos/temas/goals existentes; nunca a tasks o fechas. Footer: `**Módulos tocados:**` con módulos únicos derivados de planes/logs vinculados.

No edites goals ni tasks desde esta skill. Ejecutá `./scripts/drive-sync.sh push` después de escribir la review.
