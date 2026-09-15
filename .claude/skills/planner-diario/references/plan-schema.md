# Schema del plan diario

Leé esta referencia al generar o validar `plans/YYYY-MM-DD.{md,json}`.

## JSON

Campos top-level requeridos:

```json
{
  "date": "YYYY-MM-DD",
  "generated_at": "YYYY-MM-DDTHH:MM:SS-03:00",
  "categories": { "calendar": "#94a3b8", "buffer": "#e5e7eb" },
  "blocks": [],
  "must_dos": [],
  "carriles": [],
  "alertas": [],
  "proximos_anclas": [],
  "deferred": [],
  "strategic_recommendations": [],
  "calibration_notes": []
}
```

Reusá las categorías y colores del plan más reciente. Si no existe, usá la paleta establecida para categorías presentes: `ferreteria: #f59e0b`, `cocina: #10b981`, `gimnasio: #3b82f6`, `personal: #a78bfa`, `calendar: #94a3b8`, `buffer: #e5e7eb`. Agregá categorías nuevas sólo cuando aparezcan en el tablero.

### `blocks[]`

Sólo anclas horarias:

- Calendar: `{start,end,type:"calendar",category:"calendar",title,id?,attention?,source}`.
- Buffer: `{start,end,type:"buffer",category:"buffer",title,source}`, sólo para una transición o reserva realmente fija. No inventes buffers horarios para volver a agendar el trabajo flexible.
- `attention`: `full` por default, `partial` o `passive`.
- `id` es obligatorio si un carril lo referencia con `concurrent_with`.
- No agregues `task_id`, `module` ni trabajo flexible a `blocks`.

### `must_dos[]`

`{title,task_id?,module?,deadline?,why,tactical?,estimated_hours_default?}`. No lleva `start`/`end`.

### `carriles[]`

`{lane,title,task_id?,module?,concurrent_with?,note,estimated_hours_default?}`. No lleva `start`/`end`. `lane` típico: `compromiso`, `emergente`, `uni`, `cierre`, `admin`.

Si `concurrent_with` referencia un ancla, el padre debe tener `id` y `attention: partial` o `passive`. Con `partial`, sólo trabajo shallow/admin; con `passive`, cualquier energía. Un ancla `full` no admite trabajo concurrente. Inferí la energía desde la task, sin agregar campos obligatorios al JSON.

### Otros arrays

- `alertas[]`: `{kind,text}`, con `kind` en `deadline|cabo-suelto|scope-creep|bloqueador`.
- `proximos_anclas[]`: `{date,text}`.
- `deferred[]`: `{title,task_id?,moved_to,reason}`.
- `calibration_notes[]`: factores por categoría usados, ventana y confianza; nunca un promedio escalar.
- `repo_scouts[]` es opcional y contiene sólo resúmenes tácticos de scouts realmente necesarios.

El viewer tolera campos aditivos, pero cualquier cambio de contrato requiere actualizar `viewer/viewer.js`, `examples/plan.example.json` y los docs del repo.

## Markdown

Frontmatter:

```markdown
---
tipo: plan
capa: fecha
---
```

Secciones, en orden: `⏰ FIJO`, `🎯 MUST-DO`, `🚦 CARRILES`, `⚠️ ALERTAS`, `🔭 PRÓXIMOS ANCLAS`. El footer `**Módulos del día:**` contiene módulos únicos de MUST-DO/carriles; Calendar y buffers no llevan módulo. El contenido debe coincidir con el JSON.
