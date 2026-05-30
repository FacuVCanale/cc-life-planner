#!/usr/bin/env bash
# cc-life-planner - sync setup (Mac / Linux)
#
# Mueve state/, plans/, log/, reviews/ adentro de <ObsidianVault>/life-planner/
# y los reemplaza por symlinks en el repo. La data queda en el vault
# (sincronizable via Obsidian Git, Drive, etc.) y los slash commands siguen
# escribiendo a las rutas relativas de siempre.
#
# Uso:
#   ./scripts/sync-setup.sh                       # interactivo
#   ./scripts/sync-setup.sh /path/to/vault        # directo
#
# Idempotente: si el folder ya es symlink, lo deja como está.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
DATA_FOLDERS=(state plans log reviews)

VAULT_PATH="${1:-}"
if [ -z "$VAULT_PATH" ]; then
  read -r -p "Path al Obsidian vault (ej: ~/Documents/ObsidianVault): " VAULT_PATH
fi

if [ -z "$VAULT_PATH" ]; then
  echo "Cancelado." >&2
  exit 1
fi

VAULT_PATH="${VAULT_PATH/#\~/$HOME}"

if [ ! -d "$VAULT_PATH" ]; then
  read -r -p "El vault '$VAULT_PATH' no existe. Crear? (y/N) " answer
  if [ "$answer" != "y" ] && [ "$answer" != "Y" ]; then
    echo "Cancelado." >&2
    exit 1
  fi
  mkdir -p "$VAULT_PATH"
fi

VAULT_PATH="$(cd "$VAULT_PATH" && pwd)"
LIFE_ROOT="$VAULT_PATH/life-planner"
mkdir -p "$LIFE_ROOT"

for folder in "${DATA_FOLDERS[@]}"; do
  repo_folder="$REPO_ROOT/$folder"
  vault_folder="$LIFE_ROOT/$folder"

  if [ -L "$repo_folder" ]; then
    target="$(readlink "$repo_folder")"
    echo "  $folder/ ya es symlink -> $target (skip)"
    continue
  fi

  mkdir -p "$vault_folder"

  if [ -d "$repo_folder" ]; then
    shopt -s dotglob nullglob
    for src in "$repo_folder"/*; do
      base="$(basename "$src")"
      dest="$vault_folder/$base"
      if [ -e "$dest" ]; then
        echo "  WARN: $folder/$base ya existe en el vault -> skip (revisá manualmente)" >&2
      else
        mv "$src" "$dest"
      fi
    done
    shopt -u dotglob nullglob
    rmdir "$repo_folder" 2>/dev/null || rm -rf "$repo_folder"
  fi

  ln -s "$vault_folder" "$repo_folder"
  echo "  $folder/ -> $vault_folder"
done

echo ""
echo "Listo. Tu data ahora vive en:"
echo "  $LIFE_ROOT"
echo ""
echo "Proximos pasos:"
echo "  1. Abri '$VAULT_PATH' como vault en Obsidian."
echo "  2. Instala el plugin community 'Obsidian Git'."
echo "  3. Configura sync a un repo privado (ver docs/SYNC.md)."
