/**
 * End-to-end authentication and API flow testing for mt-happy
 */

import axios, { AxiosError } from "axios";
import {
    encodeBase64,
    decodeBase64,
    getRandomBytes,
    encryptWithDataKey,
    decryptWithDataKey,
    authChallenge,
    libsodiumEncryptForPublicKey,
    deriveContentKeyPair,
} from "./encryption";
import type { Config } from "./config";

export interface TestResult {
    success: boolean;
    steps: StepResult[];
    timing: {
        totalMs: number;
        authMs: number;
        sessionMs: number;
        messageMs: number;
        retrieveMs: number;
    };
    error?: string;
}

export interface StepResult {
    step: "auth" | "session" | "message" | "retrieve";
    success: boolean;
    duration: number;
    details?: unknown;
    error?: string;
}

interface AuthResponse {
    success: boolean;
    token: string;
}

interface SessionResponse {
    session: {
        id: string;
        seq: number;
    };
}

interface SendMessageResponse {
    messages: Array<{ id: string; seq: number; localId: string }>;
}

interface GetMessagesResponse {
    messages: Array<{ id: string; seq: number; content: unknown }>;
    hasMore: boolean;
}

export async function testAuthEndToEnd(config: Config, secret?: Uint8Array): Promise<TestResult> {
    const startTime = Date.now();
    const steps: StepResult[] = [];
    const accountSecret = secret || getRandomBytes(32);

    try {
        const authStart = Date.now();
        const authResult = await performAuth(config, accountSecret);
        const authDuration = Date.now() - authStart;
        if (!authResult.success) {
            steps.push({ step: "auth", success: false, duration: authDuration, error: authResult.error });
            return { success: false, steps, timing: { totalMs: Date.now() - startTime, authMs: authDuration, sessionMs: 0, messageMs: 0, retrieveMs: 0 }, error: authResult.error };
        }
        const token = authResult.token!;
        steps.push({ step: "auth", success: true, duration: authDuration, details: { tokenLength: token.length } });

        const sessionStart = Date.now();
        const sessionKey = getRandomBytes(32);
        const sessionResult = await createSession(config, token, sessionKey);
        const sessionDuration = Date.now() - sessionStart;
        if (!sessionResult.success) {
            steps.push({ step: "session", success: false, duration: sessionDuration, error: sessionResult.error });
            return { success: false, steps, timing: { totalMs: Date.now() - startTime, authMs: authDuration, sessionMs: sessionDuration, messageMs: 0, retrieveMs: 0 }, error: sessionResult.error };
        }
        const sessionId = sessionResult.sessionId!;
        steps.push({ step: "session", success: true, duration: sessionDuration, details: { sessionId } });

        const messageStart = Date.now();
        const messageResult = await sendMessage(config, token, sessionId, sessionKey);
        const messageDuration = Date.now() - messageStart;
        if (!messageResult.success) {
            steps.push({ step: "message", success: false, duration: messageDuration, error: messageResult.error });
            return { success: false, steps, timing: { totalMs: Date.now() - startTime, authMs: authDuration, sessionMs: sessionDuration, messageMs: messageDuration, retrieveMs: 0 }, error: messageResult.error };
        }
        steps.push({ step: "message", success: true, duration: messageDuration, details: messageResult.details });

        const retrieveStart = Date.now();
        const retrieveResult = await retrieveMessages(config, token, sessionId, sessionKey);
        const retrieveDuration = Date.now() - retrieveStart;
        if (!retrieveResult.success) {
            steps.push({ step: "retrieve", success: false, duration: retrieveDuration, error: retrieveResult.error });
            return { success: false, steps, timing: { totalMs: Date.now() - startTime, authMs: authDuration, sessionMs: sessionDuration, messageMs: messageDuration, retrieveMs: retrieveDuration }, error: retrieveResult.error };
        }
        steps.push({ step: "retrieve", success: true, duration: retrieveDuration, details: retrieveResult.details });

        return { success: true, steps, timing: { totalMs: Date.now() - startTime, authMs: authDuration, sessionMs: sessionDuration, messageMs: messageDuration, retrieveMs: retrieveDuration } };
    } catch (err) {
        const error = err instanceof Error ? err.message : String(err);
        return { success: false, steps, timing: { totalMs: Date.now() - startTime, authMs: 0, sessionMs: 0, messageMs: 0, retrieveMs: 0 }, error };
    }
}

async function performAuth(
    config: Config,
    secret: Uint8Array
): Promise<{ success: boolean; token?: string; error?: string }> {
    try {
        const { challenge, publicKey, signature } = authChallenge(secret);
        const response = await axios.post<AuthResponse>(
            `${config.serverUrl}/v1/auth`,
            {
                challenge: encodeBase64(challenge),
                publicKey: encodeBase64(publicKey),
                signature: encodeBase64(signature),
            }
        );
        if (!response.data.success || !response.data.token) {
            return { success: false, error: "No token in response" };
        }
        return { success: true, token: response.data.token };
    } catch (err) {
        const error = extractErrorMessage(err);
        return { success: false, error };
    }
}

async function createSession(
    config: Config,
    token: string,
    sessionKey: Uint8Array
): Promise<{ success: boolean; sessionId?: string; error?: string }> {
    try {
        const metadata = {
            tag: `test-e2e-${Date.now()}`,
            path: "/test",
            summary: "E2E test session",
        };
        const encryptedMetadata = encryptWithDataKey(metadata, sessionKey);
        const contentKeyPair = deriveContentKeyPair(sessionKey);
        const encryptedKey = libsodiumEncryptForPublicKey(sessionKey, contentKeyPair.publicKey);
        const withVersion = new Uint8Array(1 + encryptedKey.length);
        withVersion[0] = 0x00;
        withVersion.set(encryptedKey, 1);

        const response = await axios.post<SessionResponse>(
            `${config.serverUrl}/v1/sessions`,
            {
                tag: `test-e2e-${Date.now()}`,
                metadata: encodeBase64(encryptedMetadata),
                dataEncryptionKey: encodeBase64(withVersion),
            },
            { headers: { Authorization: `Bearer ${token}` } }
        );

        if (!response.data.session?.id) {
            return { success: false, error: "No session ID in response" };
        }

        return { success: true, sessionId: response.data.session.id };
    } catch (err) {
        const error = extractErrorMessage(err);
        return { success: false, error };
    }
}

async function sendMessage(
    config: Config,
    token: string,
    sessionId: string,
    sessionKey: Uint8Array
): Promise<{ success: boolean; details?: unknown; error?: string }> {
    try {
        const messageContent = {
            role: "user",
            content: [{ type: "text", text: "Test message from E2E test" }],
        };
        const encryptedContent = encryptWithDataKey(messageContent, sessionKey);

        const response = await axios.post<SendMessageResponse>(
            `${config.serverUrl}/v3/sessions/${sessionId}/messages`,
            {
                messages: [{
                    content: encodeBase64(encryptedContent),
                    localId: `test-msg-${Date.now()}`,
                }],
            },
            { headers: { Authorization: `Bearer ${token}` } }
        );

        if (!response.data.messages?.length) {
            return { success: false, error: "No messages in response" };
        }

        return {
            success: true,
            details: {
                messageCount: response.data.messages.length,
                firstMessage: response.data.messages[0],
            },
        };
    } catch (err) {
        const error = extractErrorMessage(err);
        return { success: false, error };
    }
}

async function retrieveMessages(
    config: Config,
    token: string,
    sessionId: string,
    sessionKey: Uint8Array
): Promise<{ success: boolean; details?: unknown; error?: string }> {
    try {
        const response = await axios.get<GetMessagesResponse>(
            `${config.serverUrl}/v3/sessions/${sessionId}/messages?after_seq=0`,
            { headers: { Authorization: `Bearer ${token}` } }
        );

        if (!Array.isArray(response.data.messages)) {
            return { success: false, error: "No messages array in response" };
        }

        const decryptedMessages = [];
        for (const msg of response.data.messages) {
            try {
                if (typeof msg.content === "object" && msg.content !== null && "t" in msg.content && "c" in msg.content) {
                    const encryptedData = decodeBase64((msg.content as any).c);
                    const decrypted = decryptWithDataKey(encryptedData, sessionKey);
                    decryptedMessages.push({ id: msg.id, seq: msg.seq, content: decrypted });
                }
            } catch (e) {
                // Skip messages we cannot decrypt
            }
        }

        return {
            success: true,
            details: {
                totalMessages: response.data.messages.length,
                decryptedMessages: decryptedMessages.length,
                hasMore: response.data.hasMore,
            },
        };
    } catch (err) {
        const error = extractErrorMessage(err);
        return { success: false, error };
    }
}

function extractErrorMessage(err: unknown): string {
    if (err instanceof AxiosError) {
        if (err.response?.data) {
            const data = err.response.data as any;
            if (typeof data === "object" && "error" in data) {
                return `${err.response.status}: ${data.error}`;
            }
            return `${err.response.status}: ${JSON.stringify(data)}`;
        }
        return `${err.code}: ${err.message}`;
    }
    if (err instanceof Error) {
        return err.message;
    }
    return String(err);
}
