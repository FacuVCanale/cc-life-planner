---
name: planner-diario
description: Genera el tablero diario de cc-life-planner cuando el usuario pide planificar o priorizar su día.
---

# Planner diario

Generá un tablero de decisión, no una agenda de tareas. Las horas pertenecen a compromisos fijos; el trabajo flexible se prioriza sin encajarlo artificialmente en slots.

## Contrato operacional

1. Ejecutá `./scripts/drive-sync.sh pull`.
2. Invocá `archivador` antes de planificar y resolvé sus preguntas pendientes.
3. Leé `state/tasks.md`, `goals.md`, `context.md`, logs recientes, Calendar de hoy + 6 días y las notas-proyecto relevantes mediante `viewer/vault-extractor.js`.
4. Escribí siempre `plans/YYYY-MM-DD.md` y `.json` coherentes entre sí.
5. Ejecutá `./scripts/open-viewer.sh`, inspeccioná el plan renderizado y corregí problemas visibles.
6. Ejecutá `./scripts/drive-sync.sh push`.

Usá America/Argentina/Buenos_Aires para la fecha y hora del plan, aunque la máquina esté en otra zona.

## Reconciliar antes de priorizar

La actualización más nueva y explícita del usuario prevalece sobre fuentes anteriores. Reconciliá tasks con logs, plan vigente y estado del vault. Calendar aporta compromisos y deadlines, pero su presencia no prueba que una task se completó.

- No resucites tareas que el usuario declaró hechas ni agregues “verificar” como sustituto.
- Una edición del plan es un delta: conservá ítems no mencionados, salvo incompatibilidad real; explicá esa excepción en una línea.
- Fechas límite duras requieren evidencia explícita: indicación del usuario, `tasks.md`, Calendar o un compromiso documentado en la nota-proyecto. Vault y repos pueden aportar estado y táctica; no deduzcas deadlines de actividad o menciones vagas.
- Priorizá primero compromisos y deadlines no repetibles, luego backlog flexible.

## Fuentes relevantes

Calendar incluye `facundovcanale@gmail.com` y `Universidad`. Usá el conector Google Calendar disponible (en Claude, `mcp__claude_ai_Google_Calendar__list_events`; en Codex, su equivalente descubierto). Identificá el calendario exacto antes de leer; si una fuente falta, señalá la cobertura sin inventar eventos.

Leé el `## Cierre` de los módulos candidatos para empujar el mínimo pendiente y detectar scope creep. Corré scouts sólo para repos asociados a tareas de código candidatas cuando el estado del repo pueda cambiar la prioridad o el siguiente paso. Un día sin tareas de código no requiere explorar `~/code/*`.

Los ítems de `## Hábitos diarios` de `context.md` entran como carril `admin`, o MUST-DO si tienen un vencimiento real esa semana.

## Estructura del tablero

- `blocks[]`: únicamente Calendar y buffers, con `start`/`end`. `attention` es `full` por default, `partial` o `passive`.
- `must_dos[]`: entregas o decisiones imprescindibles hoy, sin hora.
- `carriles[]`: trabajo flexible, concurrente o emergente, sin hora.
- `alertas[]`: deadline, cabo suelto, scope creep o bloqueador.
- `proximos_anclas[]`: compromisos con fecha de los próximos días.

El Markdown usa las cinco secciones equivalentes y footer de módulos. Wikilinks sólo en Markdown; JSON usa slugs crudos. Leé [references/plan-schema.md](references/plan-schema.md) antes de escribir los archivos.

## Priorización

Para cada candidata considerá deadline/slack, alineación a goals, dependencias, energía, carga de los próximos siete días y progreso hacia `## Cierre`.

- `est: TBD`: usá defaults `deep=2h`, `shallow=0.75h`, `admin=0.25h` y marcá `estimated_hours_default: true` en el ítem flexible.
- No descartes tareas sin deadline si avanzan directamente un goal relevante.
- Un evento `full` no admite concurrencia; `partial` sólo admin/shallow; `passive` admite cualquier energía. `carriles[].concurrent_with` referencia el `id` del bloque Calendar.
- Si la capacidad normal no alcanza y existe deadline ≤24h, explicá el conflicto y proponé un override de urgencia. Preferencia: extender hasta 02:00 antes de adelantar la mañana. Como el tablero no agenda trabajo flexible, registrá la decisión/costo sin fabricar bloques horarios.

Cada MUST-DO incluye `why`; cada carril, `note`; toda postergación, fecha ISO y razón. No inventes precisión de agenda ni cumplimiento.

## Calibración

Corré `node scripts/calibration.js --days 30`. Usá sus factores por categoría sólo cuando haya datos observados suficientes; con muestra baja, declaralo. Para categorías sin evidencia, aplicá la guía por tipo de `context.md`/defaults del script (`dev`, `research`, `admin`).

La calibración ajusta la carga esperada y el ranking; no convierte el tablero en agenda ni justifica un `calibration_factor` escalar. El runtime actual aprende de estimaciones históricas presentes en `blocks`; no afirmes que mide automáticamente los ítems flexibles nuevos.

## Cierre

Mostrá el mismo tablero que guardaste. Señalá sólo decisiones materiales, datos faltantes y conflictos reales. El plan está terminado cuando ambos archivos existen, coinciden en contenido y el viewer muestra el target correcto.
