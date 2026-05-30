#!/usr/bin/env bash
# cc-life-planner - sync de data personal con Google Drive via rclone (Mac/Linux).
#
# La data personal (state/, plans/, log/, reviews/) NO viaja con el repo (esta
# .gitignored). Este script la espeja contra una carpeta privada en tu Drive.
#
# Uso:
#   ./scripts/drive-sync.sh push    # sube  local -> Drive  (al terminar de laburar)
#   ./scripts/drive-sync.sh pull    # baja  Drive -> local  (al empezar a laburar)
#
# Regla de oro: pull ANTES de editar, push DESPUES. Asi no pisas data nueva.
# Red de seguridad: lo que se sobreescribe/borra se archiva con timestamp
#   - push -> gdrive:life-planner/.backups/<stamp>/
#   - pull -> <repo>/.drive-backups/<stamp>/   (gitignored)
#
# Requiere un remote de rclone llamado 'gdrive' (ver docs/SYNC.md).

set -euo pipefail

DIRECTION="${1:-}"
REMOTE="${RCLONE_REMOTE:-gdrive}"
REMOTE_DIR="${RCLONE_REMOTE_DIR:-life-planner}"

if [ "$DIRECTION" != "push" ] && [ "$DIRECTION" != "pull" ]; then
  echo "uso: ./scripts/drive-sync.sh push|pull" >&2
  exit 1
fi

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
FOLDERS=(state plans log reviews temas)
STAMP="$(date +%Y-%m-%d_%H%M%S)"

# Sanity: el remote existe?
if ! rclone listremotes | grep -qx "${REMOTE}:"; then
  echo "No existe el remote '${REMOTE}:' en rclone." >&2
  echo "Configuralo una vez con:  rclone config create $REMOTE drive" >&2
  exit 1
fi

for f in "${FOLDERS[@]}"; do
  local_path="$REPO_ROOT/$f"
  remote_path="${REMOTE}:${REMOTE_DIR}/$f"

  if [ "$DIRECTION" = "push" ]; then
    src="$local_path"
    dst="$remote_path"
    backup="${REMOTE}:${REMOTE_DIR}/.backups/$STAMP/$f"
  else
    src="$remote_path"
    dst="$local_path"
    backup="$REPO_ROOT/.drive-backups/$STAMP/$f"
  fi

  # En pull, si la carpeta todavía no existe en el remote (ej. `temas` recién agregada,
  # aún sin push), saltala en vez de fallar: no hay nada que bajar.
  if [ "$DIRECTION" = "pull" ] && ! rclone lsf "$remote_path" >/dev/null 2>&1; then
    echo "[$DIRECTION] $f — (no existe en el remote todavía, salto)"
    mkdir -p "$local_path"
    continue
  fi

  echo "[$DIRECTION] $f"
  rclone sync "$src" "$dst" --backup-dir "$backup" --create-empty-src-dirs --progress
done

echo ""
echo "Listo ($DIRECTION)."
