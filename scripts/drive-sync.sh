#!/usr/bin/env bash
# cc-life-planner - sync de data personal con Google Drive via rclone BISYNC (Mac/Linux).
#
# La data personal (state/, plans/, log/, reviews/) NO viaja con el repo (esta
# .gitignored). Este script la reconcilia (bidireccional) contra una carpeta
# privada en tu Drive.
#
# Uso:
#   ./scripts/drive-sync.sh pull      # reconcilia local <-> Drive (gana lo que cambio cada lado)
#   ./scripts/drive-sync.sh push      # idem: con bisync ambos reconcilian en ambos sentidos
#   ./scripts/drive-sync.sh sync      # alias explicito de la reconciliacion
#   ./scripts/drive-sync.sh resync    # PRIMERA VEZ / recuperacion: reconstruye el baseline
#   ./scripts/drive-sync.sh conflicts # lista archivos en conflicto sin sincronizar
#
# Por que bisync (y no `rclone sync`):
#   `rclone sync` espeja CIEGO src->dst: un `pull` pisaba tu local con el Drive
#   AUNQUE el local fuera mas nuevo (data loss recurrente). bisync es bidireccional
#   real: detecta los cambios de cada lado desde el ultimo baseline y los propaga.
#   pull/push quedan como el mismo reconcile (se conserva el flujo "pull al empezar
#   / push al terminar"), pero ya no se pisa lo nuevo de ningun lado.
#
# Manejo de conflictos (--conflict-resolve none, el default):
#   Un "conflicto" = el MISMO archivo cambio en AMBOS lados desde el ultimo sync.
#   En vez de elegir un ganador a ciegas (que perderia los cambios del otro lado),
#   bisync deja LAS DOS versiones renombradas y copiadas a ambos lados:
#       tasks.md.conflict-local   (la version de esta maquina / Path1)
#       tasks.md.conflict-drive   (la version del Drive / Path2)
#   ...y el `tasks.md` plano deja de existir hasta que se resuelve. La idea es que
#   el LLM que corre el sync los MERGEE semanticamente (juntar los cambios de ambos),
#   reescriba `tasks.md`, y borre los .conflict-* en ambos lados (un push posterior
#   propaga el merge y las bajas). Si corres el sync a mano sin LLM, este script te
#   AVISA fuerte y sale con codigo 2 para que no quedes roto en silencio.
#
# Primera vez en ESTA maquina (o tras cambiar settings / recuperar de un error):
#   ./scripts/drive-sync.sh resync
#   (bisync mantiene un baseline POR MAQUINA en ~/.cache/rclone/bisync/. Cada
#    dispositivo necesita su propio `resync` la primera vez. El resync hace UNION
#    sin borrar nada y, en conflicto, gana el mas nuevo: --resync-mode newer.)
#
# Red de seguridad: lo que se sobreescribe/borra se archiva con timestamp
#   - lado local : <repo>/.drive-backups/<stamp>/   (gitignored)
#   - lado Drive : gdrive:life-planner/.backups/<stamp>/
#
# Requiere un remote de rclone llamado 'gdrive' (ver docs/SYNC.md).
# Compatible con bash 3.2 (el default de macOS): sin mapfile ni arrays opcionales.

set -uo pipefail

MODE="${1:-}"
REMOTE="${RCLONE_REMOTE:-gdrive}"
REMOTE_DIR="${RCLONE_REMOTE_DIR:-life-planner}"

case "$MODE" in
  pull|push|sync|resync|conflicts) ;;
  *)
    echo "uso: ./scripts/drive-sync.sh pull|push|sync|resync|conflicts" >&2
    echo "  pull|push|sync : reconcilia local <-> Drive (bidireccional)" >&2
    echo "  resync         : primera vez en esta maquina o recuperacion (reconstruye baseline)" >&2
    echo "  conflicts      : lista archivos en conflicto pendientes de merge" >&2
    exit 1
    ;;
esac

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
FOLDERS="state plans log reviews"
STAMP="$(date +%Y-%m-%d_%H%M%S)"

# Imprime (uno por linea) los archivos en conflicto que dejo bisync. Vacio si no hay.
scan_conflicts() {
  for f in $FOLDERS; do
    find "$REPO_ROOT/$f" -type f \( -name '*.conflict-local' -o -name '*.conflict-drive' \) 2>/dev/null
  done
}

# Subcomando 'conflicts': solo lista (local, no toca la red) y sale.
if [ "$MODE" = "conflicts" ]; then
  confs="$(scan_conflicts)"
  if [ -z "$confs" ]; then
    echo "Sin conflictos pendientes."
  else
    n="$(printf '%s\n' "$confs" | grep -c .)"
    echo "Conflictos pendientes de merge ($n):"
    printf '%s\n' "$confs" | while IFS= read -r p; do [ -n "$p" ] && echo "  $p"; done
    echo ""
    echo "Resolvelos: mergea cada par .conflict-local + .conflict-drive en el archivo"
    echo "base, borra los dos .conflict-*, y corre un push para propagar."
  fi
  exit 0
fi

# Sanity: el remote existe?
if ! rclone listremotes | grep -qx "${REMOTE}:"; then
  echo "No existe el remote '${REMOTE}:' en rclone." >&2
  echo "Configuralo una vez con:  rclone config create $REMOTE drive" >&2
  exit 1
fi

# Flags comunes de robustez (recomendados por la doc de bisync):
#   --conflict-resolve none  : NO elige ganador; deja ambas versiones renombradas (ver header)
#   --conflict-loser pathname + --conflict-suffix : sufijos parlantes .conflict-local / .conflict-drive
#   --resilient --recover    : se recupera solo de interrupciones / corridas abortadas
#   --max-lock 2m            : refresca el lock para que una corrida colgada no bloquee la proxima
#   --tpslimit 10            : afloja la presion sobre el quota del API de Drive (evita 403 rate-limit)
COMMON="--create-empty-src-dirs \
  --conflict-resolve none --conflict-loser pathname \
  --conflict-suffix conflict-local,conflict-drive \
  --resilient --recover --max-lock 2m --tpslimit 10 --progress"

rc=0
for f in $FOLDERS; do
  local_path="$REPO_ROOT/$f"                 # Path1 = local  -> sufijo .conflict-local
  remote_path="${REMOTE}:${REMOTE_DIR}/$f"   # Path2 = Drive  -> sufijo .conflict-drive
  mkdir -p "$local_path"

  resync_flags=""
  if [ "$MODE" = "resync" ]; then
    # --resync-mode newer: al reconstruir el baseline, en conflicto gana el mas nuevo
    # (el default seria 'path1' = local siempre; 'newer' no pierde data fresca del Drive).
    resync_flags="--resync --resync-mode newer"
    echo "[resync] $f  (baseline; union sin borrar, gana el mas nuevo)"
  else
    echo "[$MODE] $f  (reconcilia bidireccional)"
  fi

  # COMMON / resync_flags no llevan espacios en sus valores -> word-splitting intencional.
  # shellcheck disable=SC2086
  if ! rclone bisync "$local_path" "$remote_path" $COMMON $resync_flags \
        --backup-dir1 "$REPO_ROOT/.drive-backups/$STAMP/$f" \
        --backup-dir2 "${REMOTE}:${REMOTE_DIR}/.backups/$STAMP/$f"; then
    echo "  ! bisync fallo en '$f'." >&2
    if [ "$MODE" != "resync" ]; then
      echo "    Si es la primera vez en esta maquina (o cambiaste settings), corre:" >&2
      echo "      ./scripts/drive-sync.sh resync" >&2
    fi
    rc=1
  fi
done

# Post-run: quedaron conflictos sin resolver?
confs="$(scan_conflicts)"
if [ -n "$confs" ]; then
  n="$(printf '%s\n' "$confs" | grep -c .)"
  echo ""
  echo "################################################################"
  echo "#  CONFLICTOS: $n archivo(s) cambiaron en AMBOS lados."
  echo "#  bisync dejo las dos versiones (.conflict-local / .conflict-drive)."
  echo "#  HAY QUE MERGEARLOS (idealmente con el LLM que corre el sync):"
  printf '%s\n' "$confs" | while IFS= read -r p; do [ -n "$p" ] && echo "#    $p"; done
  echo "#  Mergea cada par en el archivo base, borra los .conflict-*, y push."
  echo "################################################################"
  [ "$rc" = "0" ] && rc=2
fi

echo ""
if [ "$rc" = "0" ]; then
  echo "Listo ($MODE) - sin conflictos."
elif [ "$rc" = "2" ]; then
  echo "Listo ($MODE) PERO con conflictos a resolver (ver arriba)."
else
  echo "Termino con errores ($MODE). Ver mensajes arriba."
fi
exit $rc
