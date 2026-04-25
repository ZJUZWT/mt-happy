import { authAndSetupMachineIfNeeded } from '@/ui/auth'
import { runCodex } from '@/codex/runCodex'
import { extractCodexResumeFlag } from '@/codex/cliArgs'
import { extractNoSandboxFlag } from '@/utils/sandboxFlags'
import { ensureDaemonRunning } from '@/daemon/ensureDaemonRunning'
import type { PermissionMode } from '@/api/types'

const VALID_CODEX_STARTUP_PERMISSION_MODES: readonly PermissionMode[] = [
  'default',
  'read-only',
  'safe-yolo',
  'yolo',
  'dangerous',
  'bypassPermissions',
  'acceptEdits',
  'plan',
]

export async function handleCodexCommand(args: string[]): Promise<void> {
  let startedBy: 'daemon' | 'terminal' | undefined = undefined
  let permissionMode: PermissionMode | undefined = undefined
  let title: string | undefined = undefined
  const sandboxArgs = extractNoSandboxFlag(args)
  const codexArgs = extractCodexResumeFlag(sandboxArgs.args)

  for (let i = 0; i < codexArgs.args.length; i++) {
    const arg = codexArgs.args[i]
    if (arg === '--started-by') {
      startedBy = codexArgs.args[++i] as 'daemon' | 'terminal'
    } else if (arg === '--yolo' || arg === '--full-access') {
      permissionMode = 'yolo'
    } else if (arg === '--dangerously-bypass-approvals-and-sandbox' || arg === '--dangerous') {
      permissionMode = 'dangerous'
    } else if (arg === '--safe-yolo') {
      permissionMode = 'safe-yolo'
    } else if (arg === '--read-only') {
      permissionMode = 'read-only'
    } else if (arg === '--permission-mode') {
      const value = codexArgs.args[++i]
      if (!VALID_CODEX_STARTUP_PERMISSION_MODES.includes(value as PermissionMode)) {
        throw new Error(`Invalid Codex permission mode: ${value}`)
      }
      permissionMode = value as PermissionMode
    } else if (arg.startsWith('--permission-mode=')) {
      const value = arg.slice('--permission-mode='.length)
      if (!VALID_CODEX_STARTUP_PERMISSION_MODES.includes(value as PermissionMode)) {
        throw new Error(`Invalid Codex permission mode: ${value}`)
      }
      permissionMode = value as PermissionMode
    } else if (arg === '--title' || arg === '--name') {
      const value = codexArgs.args[++i]
      if (!value || value.startsWith('-')) {
        throw new Error(`${arg} requires a title value`)
      }
      title = value
    } else if (arg.startsWith('--title=')) {
      const value = arg.slice('--title='.length).trim()
      if (!value) {
        throw new Error('--title requires a title value')
      }
      title = value
    } else if (arg.startsWith('--name=')) {
      const value = arg.slice('--name='.length).trim()
      if (!value) {
        throw new Error('--name requires a title value')
      }
      title = value
    }
  }

  const { credentials } = await authAndSetupMachineIfNeeded()
  await ensureDaemonRunning()

  await runCodex({
    credentials,
    startedBy,
    permissionMode,
    title,
    noSandbox: sandboxArgs.noSandbox,
    resumeThreadId: codexArgs.resumeThreadId ?? undefined,
  })
}
