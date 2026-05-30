#!/usr/bin/env pwsh
# cc-life-planner - sync setup (Windows)
#
# Mueve state/, plans/, log/, reviews/ adentro de <ObsidianVault>/life-planner/
# y los reemplaza por junctions en el repo. La data queda en el vault
# (sincronizable via Obsidian Git, Drive, etc.) y los slash commands siguen
# escribiendo a las rutas relativas de siempre.
#
# Uso:
#   .\scripts\sync-setup.ps1                       # interactivo
#   .\scripts\sync-setup.ps1 -VaultPath C:\...     # directo
#
# Idempotente: si el folder ya es junction, lo deja como está.

param(
  [string]$VaultPath
)

$ErrorActionPreference = "Stop"

$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$DataFolders = @("state", "plans", "log", "reviews")

if (-not $VaultPath) {
  $VaultPath = Read-Host "Path al Obsidian vault (ej: C:\Users\$env:USERNAME\Documents\ObsidianVault)"
}

if (-not $VaultPath) {
  Write-Host "Cancelado." -ForegroundColor Yellow
  exit 1
}

$VaultPath = [System.IO.Path]::GetFullPath($VaultPath)

if (-not (Test-Path $VaultPath)) {
  $answer = Read-Host "El vault '$VaultPath' no existe. Crear? (y/N)"
  if ($answer -ne "y" -and $answer -ne "Y") {
    Write-Host "Cancelado." -ForegroundColor Yellow
    exit 1
  }
  New-Item -ItemType Directory -Path $VaultPath -Force | Out-Null
}

$LifeRoot = Join-Path $VaultPath "life-planner"
if (-not (Test-Path $LifeRoot)) {
  New-Item -ItemType Directory -Path $LifeRoot | Out-Null
  Write-Host "Creado: $LifeRoot" -ForegroundColor Green
}

foreach ($folder in $DataFolders) {
  $repoFolder = Join-Path $RepoRoot $folder
  $vaultFolder = Join-Path $LifeRoot $folder

  $item = Get-Item -Path $repoFolder -Force -ErrorAction SilentlyContinue

  if ($item -and ($item.Attributes -band [System.IO.FileAttributes]::ReparsePoint)) {
    Write-Host "  $folder/ ya es junction -> $($item.Target) (skip)" -ForegroundColor DarkGray
    continue
  }

  if (-not (Test-Path $vaultFolder)) {
    New-Item -ItemType Directory -Path $vaultFolder | Out-Null
  }

  if (Test-Path $repoFolder) {
    $files = Get-ChildItem -Path $repoFolder -Force
    foreach ($f in $files) {
      $dest = Join-Path $vaultFolder $f.Name
      if (Test-Path $dest) {
        Write-Warning "  $folder/$($f.Name) ya existe en el vault -> skip (revisá manualmente)"
      } else {
        Move-Item -Path $f.FullName -Destination $dest
      }
    }
    Remove-Item -Path $repoFolder -Recurse -Force
  }

  New-Item -ItemType Junction -Path $repoFolder -Target $vaultFolder | Out-Null
  Write-Host "  $folder/ -> $vaultFolder" -ForegroundColor Green
}

Write-Host ""
Write-Host "Listo. Tu data ahora vive en:" -ForegroundColor Cyan
Write-Host "  $LifeRoot"
Write-Host ""
Write-Host "Proximos pasos:" -ForegroundColor Cyan
Write-Host "  1. Abri '$VaultPath' como vault en Obsidian."
Write-Host "  2. Instala el plugin community 'Obsidian Git'."
Write-Host "  3. Configura sync a un repo privado (ver docs/SYNC.md)."
