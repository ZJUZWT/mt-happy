import { describe, it, expect, vi } from "vitest";
import axios from "axios";
import { testAuthEndToEnd } from "./test-auth-e2e";
import { getRandomBytes, encodeBase64, encryptWithDataKey, deriveContentKeyPair, libsodiumEncryptForPublicKey } from "./encryption";
import type { Config } from "./config";

vi.mock("axios");

describe("testAuthEndToEnd", () => {
    const mockConfig: Config = {
        serverUrl: "http://localhost:3005",
        homeDir: "/tmp/test",
        credentialPath: "/tmp/test/creds",
    };

    it("succeeds with all steps working", async () => {
        const secret = getRandomBytes(32);
        const sessionKey = getRandomBytes(32);

        // Mock POST /v1/auth
        vi.mocked(axios.post).mockResolvedValueOnce({
            data: { success: true, token: "test-token-123" },
        } as any);

        // Mock POST /v1/sessions
        vi.mocked(axios.post).mockResolvedValueOnce({
            data: { session: { id: "sess-123", seq: 1 } },
        } as any);

        // Mock POST /v3/sessions/{id}/messages
        vi.mocked(axios.post).mockResolvedValueOnce({
            data: { messages: [{ id: "msg-1", seq: 1, localId: "test-msg" }] },
        } as any);

        // Mock GET /v3/sessions/{id}/messages
        vi.mocked(axios.get).mockResolvedValueOnce({
            data: { messages: [], hasMore: false },
        } as any);

        const result = await testAuthEndToEnd(mockConfig, secret);

        expect(result.success).toBe(true);
        expect(result.steps).toHaveLength(4);
        expect(result.steps[0].step).toBe("auth");
        expect(result.steps[0].success).toBe(true);
        expect(result.steps[1].step).toBe("session");
        expect(result.steps[2].step).toBe("message");
        expect(result.steps[3].step).toBe("retrieve");
    });

    it("fails when auth fails", async () => {
        const secret = getRandomBytes(32);

        vi.mocked(axios.post).mockRejectedValueOnce(new Error("Auth failed"));

        const result = await testAuthEndToEnd(mockConfig, secret);

        expect(result.success).toBe(false);
        expect(result.steps[0].success).toBe(false);
        expect(result.error).toBeDefined();
    });
});

