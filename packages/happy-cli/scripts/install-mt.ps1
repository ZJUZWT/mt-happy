# =====================================================
# install-mt.ps1
# Self-contained installer for the mt-happy fork (Windows / PowerShell).
#
# What it does:
#   0. Preflight: check Node>=20, pnpm>=10, npm.
#   1. pnpm install (workspace deps).
#   2-3. Build + npm link via the upstream cli:install script.
#   4. Verify mt-happy is on PATH.
#   5. Write serverUrl/webappUrl into ~/.mt-happy/settings.json so users
#      can run `mt-happy` directly without env-var wrappers.
#
# Usage:
#   # From the mt-happy repo root:
#   powershell -ExecutionPolicy Bypass -File packages/happy-cli/scripts/install-mt.ps1
#
#   # Optional flags:
#   -Force            # skip interactive confirmations (overwrite, cleanup)
#   -SkipInstall      # skip pnpm install (only build + link), useful for iterating
#   -ServerUrl <url>  # override the default server URL (defaults to mt fork's)
#
# Non-Windows users:
#   No bash port is shipped. The logic is small enough that an AI assistant
#   can produce one from this file when needed.
# =====================================================

[CmdletBinding()]
param(
    [switch] $SkipInstall,
    [switch] $Force,
    [string] $ServerUrl = 'https://mt.hk.swannzh.icu'
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

# --- Resolve repo root ---
# This script lives at: <repo>/packages/happy-cli/scripts/install-mt.ps1
# So the repo root is three levels up.
$happyRoot   = (Resolve-Path (Join-Path $PSScriptRoot '..\..\..')).Path
$happyCliDir = Join-Path $happyRoot 'packages\happy-cli'

if (-not (Test-Path (Join-Path $happyCliDir 'package.json'))) {
    throw "mt-happy source not found. Expected $happyCliDir/package.json. Run this script from the mt-happy repo."
}

# =====================================================
# Step 0: Preflight checks
# =====================================================
Write-Host "=== Step 0/5: Preflight checks ===" -ForegroundColor Cyan

# --- Node version: requires >= 20 ---
$nodeCmd = Get-Command 'node' -ErrorAction SilentlyContinue
if (-not $nodeCmd) {
    throw "Node.js not found in PATH. Install Node.js 20+ from https://nodejs.org/"
}
$nodeVersionRaw = (& node --version).Trim()         # e.g. "v20.20.0"
$nodeMajor = [int]($nodeVersionRaw -replace '^v(\d+)\..*', '$1')
Write-Host "  Node:      $nodeVersionRaw"
if ($nodeMajor -lt 20) {
    throw "Node.js >= 20 is required (found $nodeVersionRaw). Upgrade at https://nodejs.org/"
}

# --- pnpm: required (this repo is a pnpm workspace) ---
$pnpmCmd = Get-Command 'pnpm' -ErrorAction SilentlyContinue
if (-not $pnpmCmd) {
    Write-Host ""
    Write-Host "ERROR: pnpm is required but not found in PATH." -ForegroundColor Red
    Write-Host "  mt-happy is a pnpm workspace; npm/yarn will produce a broken install."
    Write-Host ""
    Write-Host "  Install pnpm with one of:"
    Write-Host "    corepack enable; corepack prepare pnpm@10.11.0 --activate"
    Write-Host "    npm install -g pnpm@10"
    throw "pnpm not found"
}
$pnpmVersionRaw = (& pnpm --version).Trim()
$pnpmMajor = [int]($pnpmVersionRaw -split '\.')[0]
Write-Host "  pnpm:      $pnpmVersionRaw"
if ($pnpmMajor -lt 10) {
    throw "pnpm >= 10 is required (found $pnpmVersionRaw). Run: corepack prepare pnpm@10.11.0 --activate"
}

# --- npm: needed for `npm link` step ---
$npmCmd = Get-Command 'npm' -ErrorAction SilentlyContinue
if (-not $npmCmd) {
    throw "npm not found in PATH (it ships with Node.js — verify your Node install)."
}
$npmVersionRaw = (& npm --version).Trim()
Write-Host "  npm:       $npmVersionRaw  (needed for 'npm link')"

# --- Detect prior wrong-package-manager install (yarn/npm) ---
# pnpm creates node_modules/.pnpm; yarn/npm don't. If node_modules exists
# but .pnpm doesn't, the previous install was wrong and would conflict.
$nodeModulesDir = Join-Path $happyRoot 'node_modules'
$pnpmMarker     = Join-Path $nodeModulesDir '.pnpm'
$wrongPmInstall = (Test-Path $nodeModulesDir) -and (-not (Test-Path $pnpmMarker))
if ($wrongPmInstall) {
    Write-Host ""
    Write-Host "  Detected a non-pnpm node_modules in $nodeModulesDir" -ForegroundColor Yellow
    Write-Host "  (likely from a previous yarn/npm install). It must be removed."
    if (-not $Force) {
        $reply = Read-Host "  Delete it and reinstall with pnpm? [y/N]"
        if ($reply -notmatch '^[Yy]') {
            throw "Aborted. Re-run with -Force to skip this prompt."
        }
    }
    Write-Host "  Removing $nodeModulesDir ..." -ForegroundColor Yellow
    Remove-Item -Recurse -Force $nodeModulesDir
}

# --- Detect already-installed mt-happy ---
$existingHappy = Get-Command 'mt-happy' -ErrorAction SilentlyContinue
if ($existingHappy) {
    $existingVersion = (& mt-happy --version 2>&1 | Out-String).Trim()
    Write-Host "  mt-happy:  $existingVersion (already installed at $($existingHappy.Source))" -ForegroundColor Yellow
    if (-not $Force) {
        $reply = Read-Host "  Reinstall? [y/N]"
        if ($reply -notmatch '^[Yy]') {
            Write-Host "Skipped." -ForegroundColor Green
            exit 0
        }
    }
}

# --- Detect running daemon (cli:install will stop+restart it, just notify) ---
$daemonState = Join-Path $env:USERPROFILE '.mt-happy\daemon.state.json'
if (Test-Path $daemonState) {
    Write-Host "  Daemon state file found - upstream cli:install will stop & restart it." -ForegroundColor DarkGray
}

Write-Host ""

# =====================================================
# Step 1: Install dependencies (pnpm only)
# =====================================================
if ($SkipInstall) {
    Write-Host "=== Step 1/5: Skipping dependency install (-SkipInstall) ===" -ForegroundColor DarkGray
} else {
    Write-Host "=== Step 1/5: Installing dependencies (pnpm) ===" -ForegroundColor Cyan
    Write-Host "  This can take several minutes on first run." -ForegroundColor DarkGray
    Push-Location $happyRoot
    try {
        & pnpm install
        if ($LASTEXITCODE -ne 0) { throw "pnpm install failed (exit code $LASTEXITCODE)" }
    } finally {
        Pop-Location
    }
    Write-Host ""
}

# =====================================================
# Step 2 & 3: Delegate to upstream cli:install script
# (does build -> stop daemon -> npm link -> start daemon -> verify)
# =====================================================
Write-Host "=== Step 2-3/5: Building and linking via upstream cli:install ===" -ForegroundColor Cyan
Push-Location $happyRoot
try {
    & pnpm --filter mt-happy run cli:install
    if ($LASTEXITCODE -ne 0) { throw "cli:install failed (exit code $LASTEXITCODE)" }
} finally {
    Pop-Location
}
Write-Host ""

# =====================================================
# Step 4: Final verification
# =====================================================
Write-Host "=== Step 4/5: Verifying ===" -ForegroundColor Cyan
$mtHappy = Get-Command 'mt-happy' -ErrorAction SilentlyContinue
if ($mtHappy) {
    $version = (& mt-happy --version 2>&1 | Out-String).Trim()
    Write-Host "mt-happy installed successfully: $version" -ForegroundColor Green
    Write-Host "  Location: $($mtHappy.Source)" -ForegroundColor DarkGray
} else {
    Write-Host "WARNING: mt-happy not found in PATH after install." -ForegroundColor Yellow
    Write-Host "  Try restarting your terminal so the new global bin is picked up." -ForegroundColor Yellow
    Write-Host "  Global npm prefix: " -NoNewline
    & npm config get prefix
    exit 1
}
Write-Host ""

# =====================================================
# Step 5: Sync serverUrl into ~/.mt-happy/settings.json
# Precedence at runtime (see configuration.ts):
#   HAPPY_SERVER_URL env  >  settings.json#serverUrl  >  hardcoded default
# We write the middle layer here. Env var still wins as an explicit override.
# =====================================================
Write-Host "=== Step 5/5: Syncing serverUrl into ~/.mt-happy/settings.json ===" -ForegroundColor Cyan

$happyHomeDir   = Join-Path $env:USERPROFILE '.mt-happy'
$happySettings  = Join-Path $happyHomeDir 'settings.json'

if (-not (Test-Path $happyHomeDir)) {
    New-Item -ItemType Directory -Path $happyHomeDir | Out-Null
}

# Read existing settings (if any) and merge - never blow away other fields
# the daemon may have written (machineId, onboardingCompleted, schemaVersion...).
$settings = $null
if (Test-Path $happySettings) {
    try {
        $settings = Get-Content $happySettings -Raw -Encoding UTF8 | ConvertFrom-Json
    } catch {
        Write-Host "  Existing settings.json was malformed; rewriting from scratch." -ForegroundColor Yellow
        $settings = $null
    }
}
if ($null -eq $settings) {
    $settings = [PSCustomObject]@{ schemaVersion = 2 }
}

# webappUrl is what auth flow opens in the browser; it must match serverUrl
# for self-hosted setups, otherwise auth opens app.happy.engineering while
# the API call goes to the private server (handshake fails).
$settings | Add-Member -NotePropertyName 'serverUrl' -NotePropertyValue $ServerUrl -Force
$settings | Add-Member -NotePropertyName 'webappUrl' -NotePropertyValue $ServerUrl -Force

$json = $settings | ConvertTo-Json -Depth 10
[System.IO.File]::WriteAllText($happySettings, $json, [System.Text.UTF8Encoding]::new($false))

Write-Host "  Wrote serverUrl = $ServerUrl" -ForegroundColor Green
Write-Host "  Wrote webappUrl = $ServerUrl" -ForegroundColor Green
Write-Host "  Path: $happySettings" -ForegroundColor DarkGray
Write-Host ""
Write-Host "Done. You can now run 'mt-happy' directly in any terminal." -ForegroundColor Green

exit 0
