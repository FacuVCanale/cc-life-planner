#!/usr/bin/env pwsh
# cc-life-planner - sync de data personal con Google Drive via rclone (Windows).
#
# La data personal (state/, plans/, log/, reviews/) NO viaja con el repo (esta
# .gitignored). Este script la espeja contra una carpeta privada en tu Drive.
#
# Uso:
#   .\scripts\drive-sync.ps1 push    # sube  local -> Drive  (al terminar de laburar)
#   .\scripts\drive-sync.ps1 pull    # baja  Drive -> local  (al empezar a laburar)
#
# Regla de oro: pull ANTES de editar, push DESPUES. Asi no pisas data nueva.
# Red de seguridad: lo que se sobreescribe/borra se archiva con timestamp
#   - push -> gdrive:life-planner/.backups/<stamp>/
#   - pull -> <repo>/.drive-backups/<stamp>/   (gitignored)
#
# Requiere un remote de rclone llamado 'gdrive' (ver docs/SYNC.md).

param(
  [Parameter(Mandatory)][ValidateSet("push", "pull")][string]$Direction,
  [string]$Remote = "gdrive",
  [string]$RemoteDir = "life-planner"
)

$ErrorActionPreference = "Stop"

$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$Folders = @("state", "plans", "log", "reviews", "temas")
$Stamp = Get-Date -Format "yyyy-MM-dd_HHmmss"

# Sanity: el remote existe?
$remotes = rclone listremotes 2>$null
if ($remotes -notcontains "${Remote}:") {
  Write-Host "No existe el remote '${Remote}:' en rclone." -ForegroundColor Red
  Write-Host "Configuralo una vez con:  rclone config create $Remote drive" -ForegroundColor Yellow
  exit 1
}

foreach ($f in $Folders) {
  $local = Join-Path $RepoRoot $f
  $remotePath = "${Remote}:${RemoteDir}/$f"

  if ($Direction -eq "push") {
    $src = $local
    $dst = $remotePath
    $backup = "${Remote}:${RemoteDir}/.backups/$Stamp/$f"
  }
  else {
    $src = $remotePath
    $dst = $local
    $backup = Join-Path $RepoRoot ".drive-backups\$Stamp\$f"
  }

  Write-Host "[$Direction] $f" -ForegroundColor Cyan
  rclone sync $src $dst --backup-dir $backup --create-empty-src-dirs --progress
}

Write-Host ""
Write-Host "Listo ($Direction)." -ForegroundColor Green
