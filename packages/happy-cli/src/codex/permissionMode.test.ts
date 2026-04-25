import { describe, expect, it } from 'vitest';

import { resolveCodexMessagePermissionMode } from './permissionMode';

describe('resolveCodexMessagePermissionMode', () => {
    it('keeps startup mode when the remote UI sends default', () => {
        const resolved = resolveCodexMessagePermissionMode({
            startupPermissionMode: 'dangerous',
            currentPermissionMode: 'dangerous',
            incomingPermissionMode: 'default',
        });

        expect(resolved).toEqual({
            permissionMode: 'dangerous',
            currentPermissionMode: 'dangerous',
            ignoredDefaultOverride: true,
            ignoredInvalidMode: false,
        });
    });

    it('allows explicit non-default remote permission mode changes', () => {
        const resolved = resolveCodexMessagePermissionMode({
            startupPermissionMode: 'dangerous',
            currentPermissionMode: 'dangerous',
            incomingPermissionMode: 'read-only',
        });

        expect(resolved).toEqual({
            permissionMode: 'read-only',
            currentPermissionMode: 'read-only',
            ignoredDefaultOverride: false,
            ignoredInvalidMode: false,
        });
    });

    it('ignores invalid remote permission modes', () => {
        const resolved = resolveCodexMessagePermissionMode({
            startupPermissionMode: undefined,
            currentPermissionMode: 'safe-yolo',
            incomingPermissionMode: 'totally-unsafe',
        });

        expect(resolved).toEqual({
            permissionMode: 'safe-yolo',
            currentPermissionMode: 'safe-yolo',
            ignoredDefaultOverride: false,
            ignoredInvalidMode: true,
        });
    });
});
