# Sync entre dispositivos

Tu data personal (`state/`, `plans/`, `log/`, `reviews/`) vive fuera del repo público — todo `.gitignored`. Para tenerla en más de una PC hay que sincronizarla a un lugar privado aparte.

La ruta recomendada usa **rclone** + **Google Drive**: un CLI, gratis, cross-platform (Windows + Mac + Linux), sin instalar la app de escritorio de Drive ni montar unidades. Subís y bajás con un comando.

## Arquitectura (rclone + Drive)

```
Google Drive (privado)
└── life-planner/
    ├── state/    plans/    log/    reviews/
    └── .backups/<timestamp>/   ← red de seguridad

<este repo>/
├── state/ plans/ log/ reviews/   ← carpetas reales, se quedan acá
└── scripts/drive-sync.{ps1,sh}   ← suben/bajan contra Drive
```

La data **no se mueve** del repo. Las skills y el viewer escriben a `state/`, `plans/`, etc. como siempre. rclone sólo espeja esas carpetas contra `Drive:/life-planner/` cuando corrés `push` o `pull`. Cero symlinks, cero cambios en el código.

## Setup (primer dispositivo — donde está la data)

### 1. Instalar rclone

- **Windows:** `scoop install rclone` (o `winget install Rclone.Rclone`)
- **Mac:** `brew install rclone`
- **Linux:** `curl https://rclone.org/install.sh | sudo bash`

### 2. Conectar tu Google Drive (una vez, OAuth)

Corré en una terminal:

```
rclone config create gdrive drive
```

Esto abre el navegador → logueás con tu cuenta de Google → "Allow" → listo. Queda un remote llamado `gdrive`. Verificá con `rclone listremotes` (tiene que aparecer `gdrive:`).

> Si la terminal no puede abrir navegador (server headless), usá `rclone authorize "drive"` en una máquina con navegador y pegá el token. Ver https://rclone.org/drive/.

### 3. Primer push (sembrar Drive)

```powershell
# Windows
.\scripts\drive-sync.ps1 push
```
```bash
# Mac / Linux
chmod +x scripts/drive-sync.sh
./scripts/drive-sync.sh push
```

Sube `state/ plans/ log/ reviews/` a `gdrive:life-planner/`. La primera vez crea las carpetas.

## Setup (segundo dispositivo — ej. la Mac)

1. Cloná **este** repo (cc-life-planner) como siempre.
2. Instalá rclone (`brew install rclone`).
3. Conectá el mismo Drive. Dos opciones:
   - **Re-autenticar:** `rclone config create gdrive drive` (mismo flujo OAuth).
   - **Copiar la config** desde la otra PC: copiá el archivo que imprime `rclone config file` (en Windows suele ser `%APPDATA%\rclone\rclone.conf`) al equivalente en la Mac (`~/.config/rclone/rclone.conf`). Así no re-autenticás.
4. Bajá todo:
   ```bash
   ./scripts/drive-sync.sh pull
   ```

Listo: la Mac queda con la misma data.

## Uso diario

La data se sincroniza on-demand, no en tiempo real. Regla de oro:

- **`pull` al empezar** a laburar en una máquina (bajás lo último).
- **`push` al terminar** (subís lo que cambiaste).

```powershell
.\scripts\drive-sync.ps1 pull     # arranco
# ... trabajo, /plan-hoy, /log, etc. ...
.\scripts\drive-sync.ps1 push     # cierro
```

Como usás una PC por vez (no las dos en paralelo), con esto alcanza y no hay conflictos.

### Red de seguridad

Los scripts usan `rclone sync` (espejo) con `--backup-dir`: si un `sync` sobreescribe o borra algo, la versión vieja queda archivada con timestamp en vez de perderse.
- `push` → `gdrive:life-planner/.backups/<fecha>/`
- `pull` → `<repo>/.drive-backups/<fecha>/` (gitignored)

Aun así, **si te olvidás de `pull` y hacés `push` con data vieja**, el espejo pisa lo nuevo en Drive (recuperable desde `.backups/`, pero molesto). Por eso: pull primero, siempre.

### Automatizar (opcional)

Si no querés acordarte, podés colgar el `push` de una tarea programada (Windows Task Scheduler / `launchd` en Mac), o correrlo desde un hook al cerrar la sesión de Claude Code. No viene configurado para evitar pushes a destiempo.

## Privacidad

El remote `gdrive` apunta a **tu** Drive privado. Este repo (público) nunca ve tu data: `state/`, `plans/`, `log/`, `reviews/` siguen en `.gitignore`, y rclone sube a una carpeta privada de tu cuenta. El token de OAuth vive en `rclone.conf` local — no lo commitees.

---

## Alternativa: Obsidian vault + junctions

Si además querés navegar tu data como base de conocimiento, podés mover las 4 carpetas a un Obsidian vault y sincronizar el vault con un repo privado vía Obsidian Git. Esta ruta usa junctions/symlinks desde el repo.

Los scripts `scripts/sync-setup.{ps1,sh}` arman ese setup (mueven la data al vault y dejan junctions). Detalle:

1. Creá un vault (cualquier carpeta) y un repo privado vacío en GitHub.
2. Corré `.\scripts\sync-setup.ps1 -VaultPath <ruta-al-vault>` (o `./scripts/sync-setup.sh <ruta>` en Mac). Mueve la data y crea los junctions.
3. Abrí el vault en Obsidian, instalá el plugin **Obsidian Git**, configurá auto-pull/auto-push cada ~10 min contra el repo privado.

En el segundo dispositivo: cloná este repo y el vault privado, corré el script apuntando al vault clonado, abrí Obsidian.

Tradeoff vs rclone: sync automático cada 10 min y data navegable en Obsidian, a cambio de instalar Obsidian y mantener junctions. Para sólo sincronizar, rclone es más liviano.

## Troubleshooting

- **Windows: "script is not digitally signed / execution policy"** → corré el script con bypass puntual: `powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\drive-sync.ps1 push`. O habilitá scripts para tu usuario una vez: `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`.
- **`rclone: command not found`** → no quedó en el PATH. Reabrí la terminal o revisá la instalación.
- **`No existe el remote 'gdrive:'`** → corré `rclone config create gdrive drive` (paso 2).
- **OAuth no abre navegador** → `rclone authorize "drive"` en otra máquina y pegá el token; ver https://rclone.org/drive/.
- **Mac: `permission denied`** → `chmod +x scripts/drive-sync.sh`.
- **Recuperar algo pisado** → buscá en `.backups/<fecha>/` (Drive) o `.drive-backups/<fecha>/` (local).
