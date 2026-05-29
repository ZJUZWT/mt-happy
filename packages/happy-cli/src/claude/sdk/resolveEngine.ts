/**
 * Resolves the path to the engine-specific CLI executable for remote mode.
 *
 * When MT_HAPPY_ENGINE is set to a non-default engine (e.g. 'claude-internal',
 * 'codebuddy'), this function finds the corresponding CLI binary so the SDK
 * spawns the correct process instead of the built-in @anthropic-ai/claude-code.
 *
 * Returns undefined for the default 'claude' engine (SDK uses its built-in).
 */

import { execSync } from 'child_process'
import { existsSync } from 'fs'
import { join, dirname } from 'path'

interface EngineConfig {
    binaryName: string
    npmPackage: string
    npmEntry: string
}

const ENGINE_CONFIG: Record<string, EngineConfig> = {
    'claude-internal': {
        binaryName: 'claude-internal',
        npmPackage: '@tencent/claude-code-internal',
        npmEntry: 'dist/claude-code-internal.js',
    },
    'codebuddy': {
        binaryName: 'codebuddy',
        npmPackage: '@tencent-ai/codebuddy-code',
        npmEntry: 'bin/codebuddy',
    },
    'codex': {
        binaryName: 'codex',
        npmPackage: '@openai/codex',
        npmEntry: 'bin/codex.js',
    },
}

function findEngineCliPath(engineName: string): string | null {
    const config = ENGINE_CONFIG[engineName]
    if (!config) return null

    // 1. Try PATH lookup
    try {
        const command = process.platform === 'win32'
            ? `where ${config.binaryName}`
            : `which ${config.binaryName}`
        const result = execSync(command, {
            encoding: 'utf8',
            stdio: ['pipe', 'pipe', 'pipe']
        }).trim()

        const lines = result.split('\n').map(l => l.trim()).filter(Boolean)

        // On Windows, prefer the .cmd shim (directly spawnable)
        if (process.platform === 'win32') {
            const cmdShim = lines.find(l => l.endsWith('.cmd'))
            if (cmdShim && existsSync(cmdShim)) {
                return cmdShim
            }
        }

        const binPath = lines[0]
        if (binPath && existsSync(binPath)) {
            // Check if it's a shim that points to a JS entry
            const isExecutable = binPath.endsWith('.js') || binPath.endsWith('.cjs') || binPath.endsWith('.exe') || binPath.endsWith('.cmd')
            if (!isExecutable) {
                // Try to find the actual JS entry via npm package structure
                const shimDir = dirname(binPath)
                const cliJsPath = join(shimDir, 'node_modules', config.npmPackage, config.npmEntry)
                if (existsSync(cliJsPath)) {
                    return cliJsPath
                }
            }
            return binPath
        }
    } catch {
        // Binary not in PATH
    }

    // 2. Try npm global
    try {
        const globalRoot = execSync('npm root -g', { encoding: 'utf8' }).trim()
        const globalCliPath = join(globalRoot, config.npmPackage, config.npmEntry)
        if (existsSync(globalCliPath)) {
            return globalCliPath
        }
    } catch {
        // npm not available or root not found
    }

    return null
}

/**
 * Returns the path to the engine CLI executable, or undefined if the
 * default SDK built-in should be used.
 */
export function resolveEngineExecutablePath(): string | undefined {
    const engine = process.env.MT_HAPPY_ENGINE
    if (!engine || engine === 'claude') {
        return undefined // Use SDK's built-in @anthropic-ai/claude-code
    }

    const result = findEngineCliPath(engine)
    if (result) {
        return result
    }

    // Engine specified but not found — return undefined and let the SDK
    // fall back to its built-in (will likely fail with auth error, but
    // at least won't crash here)
    return undefined
}
