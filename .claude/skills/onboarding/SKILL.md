---
name: onboarding
description: Guía interactiva paso a paso para poblar state/ (context.md, goals.md, tasks.md) desde cero. Ideal para usuarios nuevos que no quieren editar templates a mano. Usa esta skill cuando el usuario invoque /onboarding, diga que es la primera vez, no tenga state/ poblado, o pida ayuda para empezar.
---

# Onboarding interactivo

Tu trabajo es llevar al usuario por un setup conversacional de los tres archivos de `state/`, en orden: **context → goals → tasks**. Tiene que poder arrancar a usar el sistema en menos de 10 minutos.

## Detección inicial

Antes de empezar, leé `state/tasks.md`, `state/goals.md`, `state/context.md`:

- Si **ninguno existe o todos están vacíos** (solo headers / template sin contenido real): proceso completo.
- Si **alguno ya tiene contenido real**: avisá al usuario y preguntá qué hacer.
  - Opciones: (a) sobreescribir todo, (b) saltar los que tienen contenido y completar los vacíos, (c) modo "agregar" donde sumás a lo existente sin pisar.

No pises archivos con contenido sin confirmación explícita.

## Flujo: 3 etapas

Empezá con un mensaje corto explicando qué viene:

> Te voy a hacer ~10 preguntas en 3 bloques (contexto → objetivos → tareas). Vas a poder editar todo después. Si una pregunta no aplica decí "skip" y la salto.

### Etapa 1 — `state/context.md` (restricciones recurrentes)

Hacé estas preguntas, **en grupos lógicos** (no una por una):

**Grupo A — clases / reuniones recurrentes**:
> ¿Tenés actividades o reuniones recurrentes en la semana? Tirámelas con día y horario, ej "lunes 11–13 turno en el mostrador, viernes 9–10 reunión con proveedores". Si no tenés ninguna, decí "ninguna".

Después, **una pregunta de seguimiento** sobre concurrencia (saltala si dijo "ninguna"):
> ¿Alguna de esas requiere atención completa, parcial, o podés hacer otra cosa al mismo tiempo? Default: todas requieren atención completa. Decime cuáles cambian. Niveles:
> - **full** (default): atención total, no concurrente.
> - **partial**: podés hacer admin/shallow al mismo tiempo (mails, captura).
> - **passive**: podés hacer cualquier cosa (incluso deep work).

Marcá la anotación en el archivo: `(attention: passive)` después del título del evento.

**Grupo B — ventanas de energía**:
> ¿Cuándo rendís mejor para trabajo de concentración (deep work)? Default que asumo: mañanas 8–11 alta energía, post-comida media, noche baja. ¿Cambiás algo o lo dejás así?

**Grupo C — horas disponibles + días cortos**:
> ¿Cuántas horas reales de trabajo efectivo tenés por día (descontando clases, comidas, transición)? Default 5h. ¿Algún día de la semana es más corto (ej: viernes termino temprano)?

Después de cada grupo, escribí parcialmente el archivo. **No esperes a tener todo para escribir** — guardá incremental para que el usuario vea progreso.

Formato de `state/context.md`:

```markdown
# Contexto

## Recurrentes
- Lunes 11:00–13:00: Turno en el mostrador (attention: passive)
- Martes 18:00–19:00: Clase de spinning que doy (attention: full)
- Viernes 09:00–10:00: Reunión con proveedores (attention: partial)

## Ventanas de energía
- Mañanas (08:00–11:00): alta energía, deep work
- Tarde (14:00–17:00): media, shallow work
- Noche (20:00+): descanso

## Otros
- Horas disponibles por día: 5h
- Sábados el local cierra a las 13:00
- Buffer mínimo entre bloques: 15min
```

Si no se especifica `(attention: ...)`, asume `full`.

### Etapa 2 — `state/goals.md` (objetivos)

> Pasamos a objetivos. Te pregunto por tres horizontes; podés tirar 1–3 por horizonte, o "skip" si no tenés todavía.

**Pregunta única con 3 partes**:
> 1. **Corto plazo** (esta semana / este mes): ¿qué tenés que entregar / lograr? Si tienen deadline, dame fecha. Ej: "renovar la habilitación el 30/5".
> 2. **Mediano plazo** (semestre): ¿qué proyectos / metas tenés? Deadline opcional. Ej: "armar el servicio de catering, llegar a 50 clientes en el gimnasio".
> 3. **Largo plazo** (año+): ¿hacia dónde vas? Ej: "abrir una segunda sucursal".

Si el usuario no tiene de algún horizonte, marcalo como "(en blanco)" y seguí.

Formato:

```markdown
# Objetivos

## Corto plazo (semana / mes)
- Renovar la habilitación municipal (deadline: 2026-05-30)

## Mediano plazo (semestre)
- Armar el servicio de catering para eventos (deadline: 2026-07-01)
- Llegar a 50 clientes activos en el gimnasio (deadline: 2026-07-15)

## Largo plazo (año+)
- Abrir una segunda sucursal de la ferretería (sin deadline)
```

### Etapa 3 — `state/tasks.md` (tareas activas)

Esta es la más larga. Trabajá por **proyecto/tema**, no tarea por tarea.

**Pregunta inicial**:
> Para tareas, vamos por proyecto. ¿Qué proyectos / temas tenés activos? Ej: "ferretería, cocina, gimnasio, personal". Una lista corta.

Por cada tema, si tiene **subtemas / módulos** naturales, agrupalos (ej: Ferretería → por área: Inventario,
Ventas, Proveedores; Cocina → Menú, Compras, Eventos). Si el usuario no los menciona, preguntá rápido:
"¿La ferretería la dividís en partes (ej: inventario, ventas, proveedores) o va todo junto?". Cada task va
bajo un `### Módulo`.

Después, **por cada proyecto**, una pregunta única:
> Tareas activas de **<proyecto>**: tirámelas con el formato más natural que tengas, agrego deadlines y estimaciones. Ejemplo:
> - "Arreglar el POS que duplica tickets, vence lun 12/5, ~3h"
> - "Pedido a la verdulería, mañana, 15min"
>
> Si no sabés deadline o estimación, decímelo y lo marcamos como "TBD" — esas no se planean hasta que las completes.

Reglas de captura:
- Inferí `id` (slug kebab-case): `ferr-ventas-pos`, `cocina-compras-verduleria`, `gym-rutina-hipertrofia`.
- Resolvé deadlines relativos a fecha absoluta ISO usando hoy del sistema.
- Si falta deadline o est y el usuario dice "no sé": guardalas igual con `vence: TBD` y `est: TBD`. **Importante**: el planner aplica defaults por energía a las que tienen `est: TBD` (deep=2h, shallow=0.75h, admin=0.25h), no las descarta. Cuando sepas el real, refinalas con `/capturar`.
- `energía` default: deep si est ≥ 1h, shallow si < 1h, admin si es trámite. Si el usuario no dijo el tipo, asumí shallow.
- `depende`: solo si el usuario lo menciona explícito; default `nada`.

Formato (dos niveles: `## Tema` → `### Módulo`):

```markdown
# Tareas

## Ferretería
### Ventas
- [ ] Arreglar POS que duplica tickets (id: ferr-ventas-pos) — vence 2026-05-12 — est 3h — energía: deep — depende: nada
### Inventario
- [ ] Recontar stock de tornillería (id: ferr-inventario-recuento) — vence TBD — est TBD — energía: deep — depende: nada

## Cocina
### Compras
- [ ] Pedido a la verdulería (id: cocina-compras-verduleria) — vence 2026-05-10 — est 0.25h — energía: admin — depende: nada
```

### Etapa 4 — bootstrap de la capa de conocimiento (`temas/`) — opcional/skippable

> Última cosa (la podés saltar): te armo el "mapa" de tus temas en Obsidian para que el grafo conecte
> proyectos↔módulos↔días. ¿Lo hago ahora o lo dejamos para después?

Si acepta, generá la jerarquía de notas-MOC en `temas/` (ver skill `capturador` → "Sincronizar capa de
conocimiento" para el formato exacto):

1. **Categorías** (`temas/_categorias/<cat>.md`): agrupá los temas en pocas categorías padre. Preguntá si no
   es obvio (default sugerido: Trabajo / Estudio / Vida). Cada categoría lista sus temas con `[[ ]]`.
2. **Temas** (`temas/<tema>/<tema>.md`): uno por `## Tema`. Frontmatter `tipo: tema`, `categoria: <cat>`,
   `viewer-categoria: <color>`; `Parte de [[<categoria>]].`; sección `## Módulos` con `[[ ]]` a cada módulo.
3. **Módulos** (`temas/<tema>/<modulo>.md`): uno por `### Módulo`. Frontmatter `tipo: modulo`,
   `tema: <tema>`, `status: activo`; `Parte de [[<tema>]].`; secciones `## Estado actual` (snapshot vivo,
   lo mantiene el `logueador`), `## Conocimiento (Brain)` (preguntá UNA vez qué notas del Brain aplican por
   módulo), `## Tasks activas` (derivada de `tasks.md`), `## Aprendizajes` (decisiones/hallazgos durables).

Si lo saltea, mencioná al cierre que puede armarlo después capturando tasks (el capturador crea las notas
faltantes on-demand).

### Cierre

Cuando terminás las 3 etapas:

1. Mostrá un **resumen rápido**:
   - X tareas en Y proyectos.
   - Z goals (corto: A, mediano: B, largo: C).
   - Restricciones cargadas.

2. Identificá **gaps comunes** y los flaggeás:
   - Si hay tareas con `vence: TBD` o `est: TBD` → mencionalo: "tenés N tareas sin deadline/estimación; cuando las sepas, corré `/capturar` para actualizarlas".
   - Si algún goal de corto plazo no tiene tarea asociada → flaggealo: "tu goal X no tiene tareas concretas; ¿agregamos alguna ahora?".
   - Si un proyecto en `tasks.md` no aparece en ningún goal → mencionalo, no es bloqueante pero ayuda a la coherencia.

3. Ofrecé **siguiente paso**:
   > Listo. ¿Generamos tu primer plan ahora con `/plan-hoy`?

Si dice que sí, invocá la skill `planner-diario`.

## Reglas operativas

- **Una pregunta por turno como máximo** (puede tener sub-partes, pero un solo "input bag"). No bombardees.
- **Escribí incremental**: después de cada grupo, actualizá el archivo. Si el usuario corta a la mitad, lo cargado queda.
- **Resolvé fechas relativas** ("el viernes" → ISO absoluta) usando hoy del sistema. No dejes nunca fechas relativas en archivos.
- **No inventes**: si el usuario no dijo deadline o estimación, no la inventes. Marcá `TBD`.
- **Confirmá antes de pisar**: si los archivos tienen contenido real, no escribas sin permiso.
- **Tono terso**: no expliques de más. Hacé pregunta, escribí, próxima.

## Edge cases

- **Usuario tira datos en bulk** ("acá te tiro todo de una"): aceptalo, parsealo, mostrá lo que entendiste, pedí confirmación antes de escribir.
- **Usuario quiere saltar una etapa entera**: ok, dejá ese archivo vacío con headers o omitilo. Mencioná al cierre que lo puede llenar después con `/capturar`.
- **Usuario duda sobre el formato**: mostrale ejemplos cortos, no copies todo el template.
- **Usuario tiene > 20 tareas**: ofrecé hacerlo en dos sesiones — primero proyectos críticos, después el resto.
