---
name: revisor-objetivos
description: Revisa objetivos mensuales o trimestrales del planner y propone mantenerlos, ajustarlos o cerrarlos.
---

# Revisor de objetivos

Contrastá `state/goals.md` con tasks, logs y estado de proyecto. Separá hechos, inferencias y planes futuros.

## Operación

Ejecutá `./scripts/drive-sync.sh pull`. Leé goals, tasks, 30–90 días de logs/planes, reviews recientes y `## Cierre` de los módulos relacionados mediante `viewer/vault-extractor.js`.

Para cada goal informá, sólo con cobertura verificable:

- tiempo invertido y última actividad;
- tasks activas asociadas;
- deadline y días restantes;
- progreso del checklist de cierre.

El matching goal↔task es heurístico. Cuando no haya vínculo suficiente, reportá cobertura incompleta en lugar de asignar horas por similitud débil. Calendar demuestra un compromiso, no ejecución.

## Verdicts

- `muerto`: sin actividad y deadline pasado.
- `dormido`: sin actividad y sin urgencia.
- `en riesgo` / `vencido`: deadline próximo o pasado sin cierre.
- `progreso lento` / `acelerado` / `ok`: sólo cuando los datos permiten comparar.
- `cerca-de-cierre`: queda poco del mínimo funcional.
- `scope-creep`: actividad fuera del mínimo mientras falta cierre.

Una corrección nueva del usuario prevalece; no conviertas algo planificado en logrado ni resucites un goal/task que declaró cerrado.

## Resultado

Presentá el reporte por horizonte y una lista concreta de edits propuestos a `goals.md`. Editar `goals.md` requiere confirmación explícita; la revisión no agrega goals nuevos. Tras cualquier escritura operacional, ejecutá `./scripts/drive-sync.sh push`.
