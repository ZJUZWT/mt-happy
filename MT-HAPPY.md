# mt-happy

Fork of [happy-coder](https://github.com/slopus/happy) with multi-engine support
(claude-internal / codebuddy / codex / claude) and a self-hosted server. Data
directory is `~/.mt-happy`. Default branch for daily use is `mt-happy`.

This README is written so that an AI coding assistant (Codebuddy / Cursor /
Claude Code / etc.) can read it and install the tool for the user end-to-end.
Humans can follow the same steps.

---

## Install (Windows)

**Prerequisites** — install these once if missing:

- Node.js 20+ — https://nodejs.org/
- pnpm 10+ — `corepack enable; corepack prepare pnpm@10.11.0 --activate`

**Run the installer** (from the mt-happy repo root):

```powershell
powershell -ExecutionPolicy Bypass -File packages/happy-cli/scripts/install-mt.ps1
```

The script does five steps and prints progress:

1. Preflight: verifies Node, pnpm, npm. Detects prior wrong-package-manager
   installs and offers to clean them.
2. `pnpm install` (workspace deps).
3. Build + `npm link` via the upstream `cli:install`.
4. Verifies `mt-happy` is on PATH.
5. Writes `serverUrl` and `webappUrl` into `~/.mt-happy/settings.json` so users
   can run `mt-happy` directly without env-var wrappers.

**Optional flags:**

| Flag | Purpose |
|------|---------|
| `-Force` | Skip interactive confirmations (overwrite existing install, clean broken `node_modules`). Use this when running from automation or a fresh machine. |
| `-SkipInstall` | Skip `pnpm install`, only build + link. Useful when iterating on source code. |
| `-ServerUrl <url>` | Override the default server URL (`https://swann.phlax.top`). |

---

## Install (macOS / Linux)

No Bash port is shipped. The PowerShell installer is short (~200 lines) and
purely sequential. If you're on macOS or Linux, ask your AI assistant to:

> "Read `packages/happy-cli/scripts/install-mt.ps1` and write me an equivalent
> Bash script for my platform."

The five steps above are all the logic.

---

## Use

After install, just run `mt-happy` in any terminal — server URL is already
configured.

```bash
# Start a coding session with the default engine (claude-internal)
mt-happy

# Pick a specific engine
mt-happy --engine codebuddy
mt-happy --engine codex
mt-happy --engine claude

# Start the daemon (keeps the device online for remote control)
mt-happy daemon start
mt-happy daemon stop
mt-happy daemon status

# Diagnostics
mt-happy doctor
```

**First run will trigger an authentication flow** (Mobile App or Web Browser).
This must be done in a real interactive terminal — non-interactive runners
(CI, scripted shells, AI tool wrappers) cannot complete the auth prompt.
After auth, credentials are saved to `~/.mt-happy/access.key`.

---

## Where things live

| Path | What |
|------|------|
| `~/.mt-happy/settings.json` | Per-user config (serverUrl, webappUrl, machineId). Written by `install-mt.ps1`, read by the CLI at startup. |
| `~/.mt-happy/access.key` | Auth credentials. Created by the first auth flow. Lose this and you re-auth. |
| `~/.mt-happy/daemon.state.json` | Daemon PID + port. Removed when daemon stops cleanly. |
| `~/.mt-happy/daemon.state.json.lock` | Daemon lock file. If a daemon dies abnormally and this file is left behind, `mt-happy daemon start` will fail with "Failed to start daemon" — delete it manually and retry. |
| `~/.mt-happy/logs/` | Daemon and session logs. |

---

## Server URL precedence

The CLI resolves the server URL in this order (first match wins):

1. `HAPPY_SERVER_URL` environment variable
2. `serverUrl` field in `~/.mt-happy/settings.json`
3. Built-in default (`https://api.cluster-fluster.com` upstream — but on the
   `mt-happy` branch the installer fills in `https://swann.phlax.top` at step 5)

---

## Branches

- `main` — synced with upstream slopus/happy.
- `mt-happy` — our customized branch (use this for daily work).

---

## Sync from upstream

```bash
git fetch upstream
git checkout mt-happy
git merge upstream/main
git push origin mt-happy
```

---

## Self-hosting the server

See [docs/self-hosting.md](docs/self-hosting.md).

---

## Troubleshooting

**`Failed to start daemon`** during install.
A previous daemon process likely died abnormally and left a stale lock file.

```bash
rm -f ~/.mt-happy/daemon.state.json.lock
mt-happy daemon start
```

If that doesn't help, kill any leftover happy processes and try again:

```powershell
Get-CimInstance Win32_Process -Filter "Name='node.exe'" |
  Where-Object { $_.CommandLine -match 'happy' } |
  ForEach-Object { Stop-Process -Id $_.ProcessId -Force }
rm -f ~/.mt-happy/daemon.state.json.lock
mt-happy daemon start
```

**`mt-happy --version` returns non-zero / "Claude Code is not installed"**.
Older versions of the CLI passed `--version` through to Claude Code. The
`mt-happy` branch fixes this — `mt-happy --version` now exits cleanly. If you
still see the old behavior, your install is stale; rerun `install-mt.ps1`.

**`401` errors during install / `pnpm install`**.
There's an old `mt-happy` (or `happy`) globally installed via npm. The installer
calls `npm link` which can collide. Clean them and retry:

```bash
npm uninstall -g mt-happy happy 2>/dev/null
powershell -ExecutionPolicy Bypass -File packages/happy-cli/scripts/install-mt.ps1 -Force
```
