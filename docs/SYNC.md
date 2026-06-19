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

La data **no se mueve** del repo. Las skills y el viewer escriben a `state/`, `plans/`, etc. como siempre. rclone **reconcilia** (bidireccional, vía `rclone bisync`) esas carpetas contra `Drive:/life-planner/` cuando corrés `pull`/`push`/`sync`. Cero symlinks, cero cambios en el código.

> **Por qué bisync y no `rclone sync`:** `rclone sync` espeja *ciego* (hace que el destino quede idéntico al origen). Con eso, un `pull` te pisaba el local con el Drive **aunque el local fuera más nuevo** → pérdida de data recurrente. `bisync` detecta los cambios de **cada lado** desde el último baseline y los propaga en ambos sentidos; en conflicto deja las dos versiones para mergear (ver abajo).

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

### 3. Primer `resync` (sembrar el baseline)

La **primera corrida en cada máquina** es `resync`: bisync no tiene baseline todavía y lo necesita para saber qué cambió después. El `resync` hace **union sin borrar** (junta lo de ambos lados) y, en conflicto, gana el más nuevo.

```powershell
# Windows
.\scripts\drive-sync.ps1 resync
```
```bash
# Mac / Linux
chmod +x scripts/drive-sync.sh
./scripts/drive-sync.sh resync
```

Reconcilia `state/ plans/ log/ reviews/` con `gdrive:life-planner/`. La primera vez crea las carpetas. Después de esto, el uso diario es `pull`/`push` (ver más abajo).

## Setup (segundo dispositivo — ej. la Mac)

1. Cloná **este** repo (cc-life-planner) como siempre.
2. Instalá rclone (`brew install rclone`).
3. Conectá el mismo Drive. Dos opciones:
   - **Re-autenticar:** `rclone config create gdrive drive` (mismo flujo OAuth).
   - **Copiar la config** desde la otra PC: copiá el archivo que imprime `rclone config file` (en Windows suele ser `%APPDATA%\rclone\rclone.conf`) al equivalente en la Mac (`~/.config/rclone/rclone.conf`). Así no re-autenticás.
4. Sembrá el baseline de **esta** máquina (cada device necesita su propio `resync` la primera vez):
   ```bash
   ./scripts/drive-sync.sh resync
   ```

Listo: la Mac queda con la misma data. De ahí en más, usá `pull`/`push`.

## Uso diario

La data se sincroniza on-demand, no en tiempo real. Con bisync, `pull` y `push` hacen **lo mismo** (reconcilian en ambos sentidos) — los dos nombres se mantienen sólo por costumbre del flujo:

- **`pull` al empezar** a laburar (traés lo último del Drive y subís lo pendiente).
- **`push` al terminar** (subís lo que cambiaste y bajás lo que haya).

```powershell
.\scripts\drive-sync.ps1 pull     # arranco
# ... trabajo, /plan-hoy, /log, etc. ...
.\scripts\drive-sync.ps1 push     # cierro
```

Como usás una PC por vez (no las dos en paralelo) y bisync ya no pisa lo nuevo, el orden importa mucho menos que antes. Igual conviene `pull` al empezar para arrancar con lo último.

### Conflictos

Un **conflicto** es el mismo archivo cambiado en **ambos** lados desde el último sync (raro si usás una PC por vez, pero puede pasar). En vez de elegir un ganador a ciegas, bisync deja **las dos versiones**:

```
tasks.md.conflict-local   ← la versión de esta máquina (Path1)
tasks.md.conflict-drive   ← la versión del Drive (Path2)
```

…y el `tasks.md` plano desaparece hasta resolver. La idea es **mergearlos semánticamente** (juntar los cambios de ambos lados, no descartar uno) — idealmente con el LLM que corre el sync. Flujo de resolución:

1. `./scripts/drive-sync.sh conflicts` lista los pares pendientes.
2. Mergeá cada par `*.conflict-local` + `*.conflict-drive` en el archivo base (`tasks.md`).
3. Borrá los dos `.conflict-*`.
4. `push` para propagar el merge y las bajas al Drive.

Si corrés el sync a mano sin LLM y hay conflicto, el script **avisa fuerte y sale con código 2** para que no quedes roto en silencio.

### Red de seguridad

Los scripts usan `rclone bisync` con `--backup-dir1`/`--backup-dir2`: si una corrida sobreescribe o borra algo, la versión vieja queda archivada con timestamp en vez de perderse.
- lado Drive → `gdrive:life-planner/.backups/<fecha>/`
- lado local → `<repo>/.drive-backups/<fecha>/` (gitignored)

Además, `--resilient --recover` hacen que una corrida interrumpida se recupere sola en la siguiente; si bisync queda en un estado que no puede reconciliar, corré `resync` para reconstruir el baseline.

### Automatizar (opcional)

Podés colgar el sync de una tarea programada (Windows Task Scheduler / `launchd` en Mac), o correrlo desde un hook de Claude Code. Ojo: si automatizás sin LLM en el loop, un conflicto queda como archivos `.conflict-*` sin resolver hasta que alguien los mergee.

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
- **`cannot find prior Path1 or Path2 listings`** → no hay baseline en esta máquina (primera vez o se corrompió). Corré `resync`.
- **Quedaron archivos `.conflict-local` / `.conflict-drive`** → hubo un conflicto sin resolver. Listalos con `drive-sync.sh conflicts`, mergealos en el archivo base, borrá los `.conflict-*` y `push`.
- **`Error 403: ... rateLimitExceeded` / quota del API de Drive** → rclone usa por default un `client_id` de Google compartido y muy rate-limiteado. Los scripts ya traen `--tpslimit 10` para aflojar; si igual molesta seguido, creá tu propio `client_id` (gratis): https://rclone.org/drive/#making-your-own-client-id y agregalo al remote con `rclone config`.
