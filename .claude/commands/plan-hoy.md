---
description: Genera el plan del día con justificaciones, escribe plans/*.md y plans/*.json
argument-hint: "[fecha opcional YYYY-MM-DD, default hoy]"
---

Antes de planificar: limpiá `state/tasks.md`. Después generá el plan.

**Entrada**: $ARGUMENTS (si está vacío, usá la fecha de hoy del sistema).

**Pasos**:
0. **Cargá la skill `archivador` primero** y aplicá su flujo: archivá tasks `[x]` a `state/tasks-archive.md` y consultá al user qué hacer con partial/deferred del log de ayer. Esto deja `tasks.md` lean antes de que el planner lo lea.
1. Cargá la skill `planner-diario`.
2. Leé `state/tasks.md`, `state/goals.md`, `state/context.md`.
3. Corré `node scripts/calibration.js --days 30` para el **factor de optimismo bimodal por categoría** (real, de los logs). Aplicá el factor de la categoría de cada task al estimar (no el 1.4 genérico); categorías sin dato → default bimodal de `context.md`.
4. Si la integración de Google Calendar está disponible (MCP `mcp__claude_ai_Google_Calendar__*`), traé los eventos del día.
5. Aplicá la metodología completa definida en `.claude/skills/planner-diario/SKILL.md` (slack-based + alineación a goals + energía + buffers). Para los **repo scouts** y el **paradigma tablero**, seguí el SKILL.
6. Mostrá el plan en el chat con el formato del SKILL.
7. Escribí `plans/YYYY-MM-DD.md` (idéntico al chat) y `plans/YYYY-MM-DD.json` (data estructurada según schema).
8. **Levantá y abrí el viewer**: corré `bash scripts/open-viewer.sh` (levanta el server si no está corriendo y abre `http://localhost:5173` en el navegador, ya posicionado en el plan de hoy).

**Importante**: nunca escribas el plan sin justificación por bloque. Si te falta info para justificar, pedila al usuario antes de generar.
