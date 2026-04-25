import type { PermissionMode } from '@/api/types';

const VALID_REMOTE_PERMISSION_MODES: readonly PermissionMode[] = [
    'default',
    'read-only',
    'safe-yolo',
    'yolo',
    'dangerous',
];

export interface ResolveCodexMessagePermissionModeOptions {
    startupPermissionMode: PermissionMode | undefined;
    currentPermissionMode: PermissionMode | undefined;
    incomingPermissionMode: unknown;
}

export interface ResolveCodexMessagePermissionModeResult {
    permissionMode: PermissionMode | undefined;
    currentPermissionMode: PermissionMode | undefined;
    ignoredDefaultOverride: boolean;
    ignoredInvalidMode: boolean;
}

export function resolveCodexMessagePermissionMode(
    opts: ResolveCodexMessagePermissionModeOptions,
): ResolveCodexMessagePermissionModeResult {
    const { startupPermissionMode, currentPermissionMode, incomingPermissionMode } = opts;

    if (incomingPermissionMode === undefined || incomingPermissionMode === null) {
        return {
            permissionMode: currentPermissionMode,
            currentPermissionMode,
            ignoredDefaultOverride: false,
            ignoredInvalidMode: false,
        };
    }

    if (startupPermissionMode && incomingPermissionMode === 'default') {
        return {
            permissionMode: currentPermissionMode,
            currentPermissionMode,
            ignoredDefaultOverride: true,
            ignoredInvalidMode: false,
        };
    }

    if (!VALID_REMOTE_PERMISSION_MODES.includes(incomingPermissionMode as PermissionMode)) {
        return {
            permissionMode: currentPermissionMode,
            currentPermissionMode,
            ignoredDefaultOverride: false,
            ignoredInvalidMode: true,
        };
    }

    return {
        permissionMode: incomingPermissionMode as PermissionMode,
        currentPermissionMode: incomingPermissionMode as PermissionMode,
        ignoredDefaultOverride: false,
        ignoredInvalidMode: false,
    };
}
