#!/usr/bin/env bash
# Levanta el viewer (si no está corriendo) y abre el front en el navegador.
# Lo invoca /plan-hoy al final, pero también se puede correr solo:  bash scripts/open-viewer.sh [puerto]
set -e
PORT="${1:-5173}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

# ¿ya hay un viewer respondiendo en ese puerto?
if ! curl -s -o /dev/null "http://localhost:$PORT/"; then
  ( cd "$ROOT" && nohup node viewer/serve.js "$PORT" >/tmp/cc-life-planner-viewer.log 2>&1 & )
  # esperar a que levante (máx ~3s)
  for i in $(seq 1 15); do
    sleep 0.2
    curl -s -o /dev/null "http://localhost:$PORT/" && break
  done
fi

URL="http://localhost:$PORT/"
# abrir en el navegador (macOS: open; Linux: xdg-open)
open "$URL" 2>/dev/null || xdg-open "$URL" 2>/dev/null || echo "Viewer en $URL"
echo "Viewer listo en $URL"
