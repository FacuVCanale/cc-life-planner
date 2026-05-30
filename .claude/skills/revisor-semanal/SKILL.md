---
name: revisor-semanal
description: Revisa la semana cerrada — avance vs goals, balance de categorías, completion rate. Sugiere ajustes para la semana siguiente. Usa esta skill cuando el usuario invoque /revisar-semana o pida una revisión de la semana.
---

# Revisor semanal

Tu trabajo es cerrar el loop entre planificación y ejecución a nivel semana, y proponer ajustes accionables para la próxima.

## Inputs

- `state/goals.md` — objetivos vigentes.
- `plans/*.json` y `log/*.json` de los 7 días de la semana.
- `state/tasks.md` — para ver qué está activo.

## Análisis

### 1. Completion rate

```
completion_rate = (entries con status=done) / (bloques planeados con task_id)
```

Por categoría también. Llamá la atención si:
- Total < 60%: hay un problema sistemático (sobre-planificación, interrupciones, energía mal estimada).
- Una categoría < 30% mientras otras > 80%: desbalance — ¿esa categoría está mal estimada o mal priorizada?

### 2. Avance contra goals

Por cada goal vigente:
- Listá las tareas que contribuyeron (logs cuyas categorías o task_ids matchean).
- Horas reales invertidas.
- ¿Hubo avance medible? Si el goal tiene un milestone próximo, ¿cuánto se redujo la distancia?
- Goals **sin actividad esta semana** → flaggear con prioridad.

### 3. Diff plan vs real

```
diff_pct_semana = (sum(actual_min) - sum(planned_min)) / sum(planned_min) * 100
```

Si > 30%: estimaciones siguen optimistas, sugerí subir factor.
Si < -30%: o sobreestimás o no estás llenando los bloques. Investigar.

### 4. Distribución por día de la semana

¿Hay días con load desbalanceado? ¿Lunes vs viernes? Mencionar si hay patrón claro (ej. "los viernes loggeás la mitad que el resto — ¿deadline cognitive load o realmente días más cortos?").

## Output: `reviews/YYYY-WW.md`

Lleva **frontmatter** (capa "fecha" del grafo) y un **footer `**Módulos tocados:**`** con los módulos
únicos de la semana (derivados de `block.module` de los planes). En el cuerpo, linkeá **módulos/temas y
goals** con `[[ ]]` cuando los nombres existan como nota — **nunca** linkees tasks individuales ni fechas.

```markdown
---
tipo: review
capa: fecha
---
# Review semana 2026-W18 (2026-04-27 → 2026-05-03)

## Completion
- Total: 12 done / 18 planeadas (67%)
- Por categoría:
  - ferreteria: 5/5 (100%)
  - cocina: 3/6 (50%) ← bajo
  - gimnasio: 4/7 (57%)

## Avance contra goals

### Corto plazo
- ✅ "Lanzar el menú de otoño" (2026-05-22): 8h invertidas esta semana, ~40% completado. [[cocina-menu]]

### Mediano plazo
- ⚠️ "Armar servicio de catering": 0h invertidas. Sin actividad por 2da semana consecutiva.
- ✅ "Estabilizar el control de stock": 5h en inventario, on track. [[ferr-inventario]]

### Largo plazo
- (sin actividad — esperable, son de horizonte largo)

## Diff plan vs real
- Total planeado: 1620min · real: 1980min · +22%
- Factor implícito 1.22, default 1.4 → estás siendo *menos* optimista que tu factor. Bajar a 1.25?

## Patrones
- Sábados loggeaste 90min, mitad del resto. Patrón consistente últimas 3 semanas.
- "Cocina" sub-completada — bloques los puse muy temprano (8am) y faltaste 2 veces.

## Sugerencias para la semana siguiente
1. **Bloquear 2h el sábado para el catering** — cotizar es el siguiente milestone.
2. **Mover bloques de Cocina a la tarde** — patrón claro de no llegar a las 8am.
3. **Bajar factor de optimismo a 1.25** — calibración estable últimas 3 semanas.
4. **Revisar el menú de otoño** — quedan 19 días para el lanzamiento, ~16h estimadas, holgura cómoda pero no descuidar.

---
**Módulos tocados:** [[ferr-inventario]] · [[cocina-menu]] · [[gym-rutinas]]
```

## Reglas

- **Sé específico**: "bajo en cocina" no sirve; "bloques de 8am, faltaste 2 días" sí.
- **Cuantificá**: porcentajes, horas, conteos. Sin números no hay revisión.
- **Sugerencias accionables**: cada sugerencia tiene que poder traducirse a una acción concreta esta semana.
- **No prescribas**: el usuario decide. Vos sugerís y justificás.
