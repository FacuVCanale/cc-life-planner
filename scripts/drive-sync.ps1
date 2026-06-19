#!/usr/bin/env pwsh
# cc-life-planner - sync de data personal con Google Drive via rclone BISYNC (Windows).
#
# La data personal (state/, plans/, log/, reviews/) NO viaja con el repo (esta
# .gitignored). Este script la reconcilia (bidireccional) contra una carpeta
# privada en tu Drive.
#
# Uso:
#   .\scripts\drive-sync.ps1 pull      # reconcilia local <-> Drive (gana lo que cambio cada lado)
#   .\scripts\drive-sync.ps1 push      # idem: con bisync ambos reconcilian en ambos sentidos
#   .\scripts\drive-sync.ps1 sync      # alias explicito de la reconciliacion
#   .\scripts\drive-sync.ps1 resync    # PRIMERA VEZ / recuperacion: reconstruye el baseline
#   .\scripts\drive-sync.ps1 conflicts # lista archivos en conflicto sin sincronizar
#
# Por que bisync (y no `rclone sync`):
#   `rclone sync` espeja CIEGO src->dst: un `pull` pisaba tu local con el Drive
#   AUNQUE el local fuera mas nuevo (data loss recurrente). bisync es bidireccional
#   real: detecta los cambios de cada lado desde el ultimo baseline y los propaga.
#
# Manejo de conflictos (--conflict-resolve none, el default):
#   Un "conflicto" = el MISMO archivo cambio en AMBOS lados desde el ultimo sync.
#   bisync deja LAS DOS versiones renombradas y copiadas a ambos lados:
#       tasks.md.conflict-local   (Path1 = esta maquina)
#       tasks.md.conflict-drive   (Path2 = Drive)
#   ...y el archivo plano deja de existir hasta resolver. La idea: el LLM que corre
#   el sync los MERGEA, reescribe el base, borra los .conflict-*, y push. Si corres
#   a mano sin LLM, este script AVISA y sale con codigo 2 (no quedas roto en silencio).
#
# Primera vez en ESTA maquina (o tras cambiar settings / recuperar de un error):
#   .\scripts\drive-sync.ps1 resync
#   (bisync mantiene un baseline POR MAQUINA. Cada dispositivo necesita su propio
#    resync la primera vez. El resync hace UNION sin borrar y en conflicto gana el
#    mas nuevo: --resync-mode newer.)
#
# Red de seguridad: lo pisado/borrado se archiva con timestamp
#   - lado local : <repo>\.drive-backups\<stamp>\
#   - lado Drive : gdrive:life-planner/.backups/<stamp>/
#
# Requiere un remote de rclone llamado 'gdrive' (ver docs/SYNC.md).

param(
  [Parameter(Mandatory)][ValidateSet("pull", "push", "sync", "resync", "conflicts")][string]$Mode,
  [string]$Remote = "gdrive",
  [string]$RemoteDir = "life-planner"
)

$ErrorActionPreference = "Stop"

$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$Folders = @("state", "plans", "log", "reviews")
$Stamp = Get-Date -Format "yyyy-MM-dd_HHmmss"

function Get-Conflicts {
  $found = @()
  foreach ($f in $Folders) {
    $dir = Join-Path $RepoRoot $f
    if (Test-Path $dir) {
      $found += Get-ChildItem -Path $dir -Recurse -File -Include "*.conflict-local", "*.conflict-drive" -ErrorAction SilentlyContinue
    }
  }
  return $found
}

# Subcomando 'conflicts': solo lista (local, no toca la red) y sale.
if ($Mode -eq "conflicts") {
  $confs = Get-Conflicts
  if ($confs.Count -eq 0) {
    Write-Host "Sin conflictos pendientes." -ForegroundColor Green
  }
  else {
    Write-Host "Conflictos pendientes de merge ($($confs.Count)):" -ForegroundColor Yellow
    $confs | ForEach-Object { Write-Host "  $($_.FullName)" }
    Write-Host ""
    Write-Host "Resolvelos: mergea cada par .conflict-local + .conflict-drive en el archivo base,"
    Write-Host "borra los dos .conflict-*, y corre un push para propagar."
  }
  exit 0
}

# Sanity: el remote existe?
$remotes = rclone listremotes 2>$null
if ($remotes -notcontains "${Remote}:") {
  Write-Host "No existe el remote '${Remote}:' en rclone." -ForegroundColor Red
  Write-Host "Configuralo una vez con:  rclone config create $Remote drive" -ForegroundColor Yellow
  exit 1
}

# Flags comunes de robustez (recomendados por la doc de bisync).
$Common = @(
  "--create-empty-src-dirs",
  "--conflict-resolve", "none",
  "--conflict-loser", "pathname",
  "--conflict-suffix", "conflict-local,conflict-drive",
  "--resilient", "--recover", "--max-lock", "2m",
  "--tpslimit", "10",
  "--progress"
)

$rc = 0
foreach ($f in $Folders) {
  $local = Join-Path $RepoRoot $f                 # Path1 = local  -> .conflict-local
  $remotePath = "${Remote}:${RemoteDir}/$f"       # Path2 = Drive  -> .conflict-drive
  New-Item -ItemType Directory -Force -Path $local | Out-Null

  $resyncFlags = @()
  if ($Mode -eq "resync") {
    $resyncFlags = @("--resync", "--resync-mode", "newer")
    Write-Host "[resync] $f  (baseline; union sin borrar, gana el mas nuevo)" -ForegroundColor Cyan
  }
  else {
    Write-Host "[$Mode] $f  (reconcilia bidireccional)" -ForegroundColor Cyan
  }

  $backup1 = Join-Path $RepoRoot ".drive-backups\$Stamp\$f"
  $backup2 = "${Remote}:${RemoteDir}/.backups/$Stamp/$f"

  rclone bisync $local $remotePath @Common @resyncFlags --backup-dir1 $backup1 --backup-dir2 $backup2
  if ($LASTEXITCODE -ne 0) {
    Write-Host "  ! bisync fallo en '$f'." -ForegroundColor Red
    if ($Mode -ne "resync") {
      Write-Host "    Si es la primera vez en esta maquina (o cambiaste settings), corre:" -ForegroundColor Yellow
      Write-Host "      .\scripts\drive-sync.ps1 resync" -ForegroundColor Yellow
    }
    $rc = 1
  }
}

# Post-run: quedaron conflictos sin resolver?
$confs = Get-Conflicts
if ($confs.Count -gt 0) {
  Write-Host ""
  Write-Host "################################################################" -ForegroundColor Yellow
  Write-Host "#  CONFLICTOS: $($confs.Count) archivo(s) cambiaron en AMBOS lados." -ForegroundColor Yellow
  Write-Host "#  bisync dejo las dos versiones (.conflict-local / .conflict-drive)." -ForegroundColor Yellow
  Write-Host "#  HAY QUE MERGEARLOS (idealmente con el LLM que corre el sync):" -ForegroundColor Yellow
  $confs | ForEach-Object { Write-Host "#    $($_.FullName)" -ForegroundColor Yellow }
  Write-Host "#  Mergea cada par en el archivo base, borra los .conflict-*, y push." -ForegroundColor Yellow
  Write-Host "################################################################" -ForegroundColor Yellow
  if ($rc -eq 0) { $rc = 2 }
}

Write-Host ""
if ($rc -eq 0) {
  Write-Host "Listo ($Mode) - sin conflictos." -ForegroundColor Green
}
elseif ($rc -eq 2) {
  Write-Host "Listo ($Mode) PERO con conflictos a resolver (ver arriba)." -ForegroundColor Yellow
}
else {
  Write-Host "Termino con errores ($Mode). Ver mensajes arriba." -ForegroundColor Red
}
exit $rc
