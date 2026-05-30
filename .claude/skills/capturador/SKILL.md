---
name: capturador
description: Captura tareas, goals, o notas en el formato canónico de cc-life-planner. Decide entre tasks.md, goals.md, e inbox.md según completitud y tipo. Usa esta skill cuando el usuario quiera agregar una tarea, registrar un objetivo, o invoque /capturar.
---

# Capturador

Tu trabajo es traducir texto libre del usuario al formato canónico de los archivos de estado, sin perder información ni inventar la que falta.

## Decisión: ¿qué tipo de captura es?

1. **Tarea concreta**: tiene un verbo de acción y un resultado verificable. → `state/tasks.md`.
2. **Objetivo / goal**: aspiración, milestone, "quiero lograr X". → `state/goals.md`.
3. **Idea / nota / item ambiguo**: no es accionable, falta contexto, o es un brain dump. → `state/inbox.md`.

Si dudás, pedí una aclaración cortita ("¿es una tarea concreta o un objetivo más amplio?") antes de escribir.

## Formato — `state/tasks.md`

Estructura de **dos niveles**: `## Tema` (proyecto/área) y dentro `### Módulo` (subtema). Cada tarea es un
checklist item bajo su módulo:

```markdown
- [ ] <título corto> (id: <slug-único>) — vence <YYYY-MM-DD> — est <Nh> — energía: <deep|shallow|admin> — depende: <id otra tarea | nada>
```

Ejemplo:
```markdown
## Ferretería
### Ventas
- [ ] arreglar POS que duplica tickets (id: ferr-ventas-pos) — vence 2026-05-12 — est 3h — energía: deep — depende: nada
### Inventario
- [ ] recontar stock de tornillería (id: ferr-inventario-recuento) — vence 2026-05-18 — est 4h — energía: deep — depende: nada
```

Reglas:
- `id`: slug kebab-case, único en todo `tasks.md`. Inferí desde el proyecto y el título: `ferr-ventas-pos`, `cocina-menu-semana`, `gym-rutina-hipertrofia`.
- `vence`: ISO. **Obligatorio**. Si el usuario no dijo cuándo, preguntá. Si no sabe → guardá con `vence: TBD` (no la mandes a inbox — sigue siendo una tarea, solo sin urgencia).
- `est`: estimación en horas. Si no sabe, **guardá `est: TBD`**. El planner aplica un default por energía (deep=2h, shallow=0.75h, admin=0.25h) y la marca con asterisco en el plan. Cuando el usuario sepa el real, corre `/capturar` para actualizarla.
- `energía`: deep / shallow / admin. Default `shallow` si no es claro.
- `depende`: id de otra tarea, o `nada`.
- **Toda tarea va bajo un `### Módulo`.** El módulo determina a qué nota-módulo del grafo pertenece (ver
  "Sincronizar capa de conocimiento"). Si no es obvio bajo qué módulo va, preguntá; no la dejes suelta
  directamente bajo el `##`.

Si el **tema** (`## <Nombre>`) no existe, creá la sección. Si el **módulo** (`### <Nombre>`) no existe
dentro del tema, creá el subheader (y su nota-módulo, ver abajo).

## Sincronizar capa de conocimiento (`temas/`)

El vault de Obsidian tiene una jerarquía de notas-MOC en `temas/`: categoría → tema → módulo. Las tasks
**no** son nodos del grafo; aparecen como texto plano dentro de la sección `## Tasks activas` de su
nota-módulo, que es una **vista derivada** de `tasks.md` (igual que `log/*.md` lo es de `log/*.json`).

Cada vez que creás/editás una task:

1. **Ubicá el módulo** (el `### <Módulo>` bajo el que va la task). Slug del módulo = kebab-case, prefijado
   por el tema cuando ayuda a la unicidad (`ferr-ventas`, `cocina-menu`, `gym-rutinas`).
2. **Si la nota-módulo no existe** (`temas/<tema>/<modulo>.md`): creala con frontmatter
   `tipo: modulo`, `tema: <tema>`, `capa: conocimiento`, `tags: [life-planner, modulo]`, `status: activo`;
   `# <Tema> · <Módulo>`; línea `Parte de [[<tema>]].`; y secciones, en este orden:
   `## Estado actual` (snapshot vivo del módulo, lo mantiene el `logueador`; arrancá con una línea o vacío),
   `## Conocimiento (Brain)` (preguntá UNA vez qué notas del Brain aplican, ej. `[[supabase]]`, `[[ml]]`),
   `## Tasks activas`, y `## Aprendizajes` (decisiones/hallazgos durables, append).
   Si el `### Módulo` es nuevo, agregá también su `[[<modulo>]]` a la sección `## Módulos` de la nota-tema.
3. **Si el tema no existe** como nota: creá `temas/<tema>/<tema>.md` (`tipo: tema`, `categoria: <cat>`,
   `viewer-categoria: <color>`) con `Parte de [[<categoria>]].`, y sumá el tema a la nota-categoría.
4. **Regenerá entera** la sección `## Tasks activas` de la nota-módulo afectada desde `tasks.md` (no la
   parchees línea por línea). Formato de cada línea: `` - `<id>` — <título> — <vence/est relevante> ``.

Reglas duras de esta capa:
- **`tasks.md` es el único source of truth de tasks.** Las notas-módulo son vista; nunca al revés.
- **Wikilinks planner→Brain son one-way.** Podés linkear a `Brain/` desde una nota-módulo, pero **no edites
  archivos de `Brain/`** desde esta skill sin confirmación del usuario.
- Mapeo header→slug: lowercase-kebab (`Ferretería`→`ferreteria`, `Personal / Hobby`→`personal`).

## Formato — `state/goals.md`

Tres secciones fijas: `## Corto plazo (semana/mes)`, `## Mediano plazo (semestre)`, `## Largo plazo (año+)`. Cada goal:

```markdown
- <título> (deadline: <YYYY-MM-DD | "sin deadline">)
```

Para goals de corto plazo el deadline es **obligatorio**. Para mediano/largo es opcional pero recomendado.

## Formato — `state/inbox.md`

Append-only, timestamped. Cada item:

```markdown
- [<YYYY-MM-DD HH:MM>] <texto literal del usuario, sin parafrasear>
```

Cuando el usuario después corra `/capturar` sobre un item del inbox (ej. "procesá el inbox"), aplicá la lógica completa para promoverlo a `tasks.md` o `goals.md`.

## Edge cases

- **Múltiples tareas en un solo input**: separalas y procesá una por una. Confirmá con el usuario el desglose si es ambiguo.
- **Tarea ya existente** (mismo título o similar): mencionalo y preguntá si actualizar o duplicar.
- **Deadline relativo** ("para el viernes"): resolvé a fecha absoluta usando hoy del sistema antes de escribir.
- **Estimación vaga** ("un par de horas"): usá `~2h` y aclará que es gruesa.

## Output

Después de escribir, mostrá al usuario:
- Dónde quedó (archivo + sección).
- El item exactamente como lo escribiste.
- Si hubo asunción importante (deadline relativo, estimación gruesa, proyecto inferido), explicitá la asunción para que pueda corregir.
