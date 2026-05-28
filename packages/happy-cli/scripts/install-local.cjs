#!/usr/bin/env node

/**
 * Install this workspace as the global `happy` binary for local development.
 *
 * Steps:
 *   1. build
 *   2. stop any running daemon (ignores failure)
 *   3. npm link (replaces the globally-installed `happy` with a symlink to this workspace)
 *   4. start the daemon again
 *   5. verify by running `happy --version`
 *
 * Reuses ~/.happy/ — no separate dev home dir. Auth and sessions carry over.
 * To undo: `npm unlink -g happy && npm i -g happy@latest`.
 */

const { spawnSync } = require('child_process');
const path = require('path');

const PACKAGE_DIR = path.resolve(__dirname, '..');
const IS_WINDOWS = process.platform === 'win32';

function run(cmd, args, { allowFailure = false } = {}) {
    const label = [cmd, ...args].join(' ');
    console.log(`\n▶ ${label}`);
    const result = spawnSync(cmd, args, {
        cwd: PACKAGE_DIR,
        stdio: 'inherit',
        // shell: true resolves `.cmd` shims on Windows so `pnpm` / `npm` / `happy` are found.
        shell: IS_WINDOWS,
    });
    if (result.error) {
        console.error(`Failed to spawn: ${label}`, result.error.message);
        if (!allowFailure) process.exit(1);
        return 1;
    }
    const status = result.status ?? 1;
    if (status !== 0 && !allowFailure) {
        console.error(`\nExit ${status}: ${label}`);
        process.exit(status);
    }
    return status;
}

run('pnpm', ['run', 'build']);
run('mt-happy', ['daemon', 'stop'], { allowFailure: true });
run('npm', ['link']);
// Post-link probes are best-effort: on Windows the freshly-written npm shim
// may not be visible to this child shell yet (PATH is cached in the parent
// process). A failure here does NOT mean the install failed — the shim is on
// disk and a fresh shell will pick it up. Downstream steps (e.g. writing
// ~/.mt-happy/settings.json) must not be blocked by this.
const daemonStatus = run('mt-happy', ['daemon', 'start'], { allowFailure: true });
const versionStatus = run('mt-happy', ['--version'], { allowFailure: true });

if (daemonStatus !== 0 || versionStatus !== 0) {
    console.warn('\n⚠ Post-link probes failed (likely stale PATH in this shell).');
    console.warn('  The npm link itself succeeded — open a fresh terminal and run');
    console.warn('  `mt-happy --version` to confirm, then `mt-happy daemon start`.');
}

console.log(`\n✓ Installed from ${PACKAGE_DIR}`);
console.log('  To undo: npm unlink -g happy && npm i -g happy@latest');
