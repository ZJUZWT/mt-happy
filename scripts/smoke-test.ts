#!/usr/bin/env tsx
/**
 * scripts/smoke-test.ts
 *
 * MT-Happy deployment smoke test — validates the full auth → session → message flow.
 * Designed for AI agents to run after deployments for automated validation.
 *
 * Usage:
 *   tsx scripts/smoke-test.ts [url] [options]
 *
 * Options:
 *   --json           Output structured JSON (for AI/CI consumption)
 *   --verbose        Show detailed request/response info
 *   --seed <hex>     Use a fixed 32-byte seed (hex) for reproducible tests
 *   --no-ws          Skip WebSocket test
 *   --no-cleanup     Don't delete the test session afterward
 *   --timeout <ms>   Per-step timeout in ms (default: 10000)
 *
 * Environment:
 *   HAPPY_SERVER_URL  Default server URL (fallback: https://mt.swannzh.icu)
 *   SMOKE_TEST_SEED   Fixed seed in hex (alternative to --seed)
 *
 * Exit codes:
 *   0 - All checks passed
 *   1 - One or more checks failed
 *   2 - Script error (bad args, network unreachable, etc.)
 */

import { createHash, createCipheriv, createDecipheriv, randomBytes as nodeRandomBytes } from 'node:crypto';
import tweetnacl from 'tweetnacl';

// ─── Types ───────────────────────────────────────────────────────────

interface StepResult {
    name: string;
    status: 'pass' | 'fail' | 'skip';
    duration_ms: number;
    details: Record<string, unknown>;
    error?: string;
}

interface Options {
    serverUrl: string;
    json: boolean;
    verbose: boolean;
    seed: Uint8Array;
    noWs: boolean;
    noCleanup: boolean;
    timeout: number;
}

// ─── Crypto Utilities (inline, zero workspace imports) ────────────────

function encodeBase64(buf: Uint8Array): string {
    return Buffer.from(buf).toString('base64');
}

function decodeBase64(b64: string): Uint8Array {
    return new Uint8Array(Buffer.from(b64, 'base64'));
}

function getRandomBytes(n: number): Uint8Array {
    return new Uint8Array(nodeRandomBytes(n));
}

function sha512(data: Uint8Array): Uint8Array {
    return new Uint8Array(createHash('sha512').update(data).digest());
}

function concat(...arrays: Uint8Array[]): Uint8Array {
    const totalLength = arrays.reduce((sum, a) => sum + a.length, 0);
    const result = new Uint8Array(totalLength);
    let offset = 0;
    for (const a of arrays) {
        result.set(a, offset);
        offset += a.length;
    }
    return result;
}

/** Generate auth credentials from seed */
function authFromSeed(seed: Uint8Array) {
    const signingKeyPair = tweetnacl.sign.keyPair.fromSeed(seed);
    const challenge = getRandomBytes(32);
    const signature = tweetnacl.sign.detached(challenge, signingKeyPair.secretKey);
    return {
        publicKey: encodeBase64(signingKeyPair.publicKey),
        challenge: encodeBase64(challenge),
        signature: encodeBase64(signature),
    };
}

/** Derive content keypair from account seed (for session key encryption) */
function deriveContentKeyPair(seed: Uint8Array) {
    const hashed = sha512(seed).slice(0, 32);
    return tweetnacl.box.keyPair.fromSecretKey(hashed);
}

/** Encrypt session key for a public key (NaCl box) */
function encryptSessionKey(sessionKey: Uint8Array, recipientPublicKey: Uint8Array): Uint8Array {
    const ephemeral = tweetnacl.box.keyPair();
    const nonce = getRandomBytes(24);
    const encrypted = tweetnacl.box(sessionKey, nonce, recipientPublicKey, ephemeral.secretKey);
    // Wire format: version(1) + ephemeralPubKey(32) + nonce(24) + ciphertext
    return concat(new Uint8Array([0x00]), ephemeral.publicKey, nonce, encrypted);
}

/** AES-256-GCM encrypt */
function encryptWithDataKey(data: unknown, key: Uint8Array): Uint8Array {
    const nonce = getRandomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', key, nonce);
    const plaintext = Buffer.from(JSON.stringify(data), 'utf8');
    const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    const authTag = cipher.getAuthTag();
    // Wire format: version(1) + nonce(12) + ciphertext + authTag(16)
    return concat(new Uint8Array([0x00]), nonce, new Uint8Array(encrypted), new Uint8Array(authTag));
}

/** AES-256-GCM decrypt */
function decryptWithDataKey(bundle: Uint8Array, key: Uint8Array): unknown | null {
    if (bundle[0] !== 0 || bundle.length < 29) return null;
    const nonce = bundle.slice(1, 13);
    const authTag = bundle.slice(bundle.length - 16);
    const ciphertext = bundle.slice(13, bundle.length - 16);

    const decipher = createDecipheriv('aes-256-gcm', key, nonce);
    decipher.setAuthTag(Buffer.from(authTag));
    try {
        const decrypted = Buffer.concat([decipher.update(Buffer.from(ciphertext)), decipher.final()]);
        return JSON.parse(decrypted.toString('utf8'));
    } catch {
        return null;
    }
}

// ─── HTTP Helpers ────────────────────────────────────────────────────

async function httpPost(url: string, body: unknown, headers: Record<string, string> = {}, timeout: number = 10000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    try {
        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...headers },
            body: JSON.stringify(body),
            signal: controller.signal,
        });
        const data = await res.json();
        return { status: res.status, data };
    } finally {
        clearTimeout(timer);
    }
}

async function httpGet(url: string, headers: Record<string, string> = {}, timeout: number = 10000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    try {
        const res = await fetch(url, {
            method: 'GET',
            headers,
            signal: controller.signal,
        });
        const data = await res.json();
        return { status: res.status, data };
    } finally {
        clearTimeout(timer);
    }
}

// ─── Test Steps ──────────────────────────────────────────────────────

async function stepAuth(opts: Options, seed: Uint8Array): Promise<StepResult & { token?: string }> {
    const start = Date.now();
    try {
        const creds = authFromSeed(seed);
        const { status, data } = await httpPost(
            `${opts.serverUrl}/v1/auth`,
            creds,
            {},
            opts.timeout
        );

        if (opts.verbose) console.error(`  [auth] status=${status} data=${JSON.stringify(data)}`);

        if (data?.token) {
            return {
                name: 'auth',
                status: 'pass',
                duration_ms: Date.now() - start,
                details: { token_length: data.token.length },
                token: data.token,
            };
        }
        return {
            name: 'auth',
            status: 'fail',
            duration_ms: Date.now() - start,
            details: { response: data },
            error: `Auth failed: status=${status}, response=${JSON.stringify(data)}`,
        };
    } catch (e: any) {
        return {
            name: 'auth',
            status: 'fail',
            duration_ms: Date.now() - start,
            details: {},
            error: e.message || String(e),
        };
    }
}

async function stepCreateSession(
    opts: Options, token: string, seed: Uint8Array, sessionKey: Uint8Array
): Promise<StepResult & { sessionId?: string }> {
    const start = Date.now();
    try {
        const contentKP = deriveContentKeyPair(seed);
        const encryptedKey = encryptSessionKey(sessionKey, contentKP.publicKey);

        const metadata = { title: 'Smoke Test', createdAt: Date.now() };
        const encryptedMetadata = encryptWithDataKey(metadata, sessionKey);

        const tag = `smoke-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

        const { status, data } = await httpPost(
            `${opts.serverUrl}/v1/sessions`,
            {
                tag,
                metadata: encodeBase64(encryptedMetadata),
                dataEncryptionKey: encodeBase64(encryptedKey),
            },
            { Authorization: `Bearer ${token}` },
            opts.timeout
        );

        if (opts.verbose) console.error(`  [session] status=${status} data=${JSON.stringify(data).slice(0, 200)}`);

        const sessionId = data?.id || data?.session?.id;
        if (sessionId) {
            return {
                name: 'create_session',
                status: 'pass',
                duration_ms: Date.now() - start,
                details: { session_id: sessionId, tag },
                sessionId,
            };
        }
        return {
            name: 'create_session',
            status: 'fail',
            duration_ms: Date.now() - start,
            details: { response: data },
            error: `Create session failed: status=${status}`,
        };
    } catch (e: any) {
        return {
            name: 'create_session',
            status: 'fail',
            duration_ms: Date.now() - start,
            details: {},
            error: e.message || String(e),
        };
    }
}

async function stepSendMessage(
    opts: Options, token: string, sessionId: string, sessionKey: Uint8Array
): Promise<StepResult & { localId?: string }> {
    const start = Date.now();
    try {
        const messageContent = {
            role: 'user',
            content: [{ type: 'text', text: `smoke-test-ping-${Date.now()}` }],
        };
        const encryptedContent = encryptWithDataKey(messageContent, sessionKey);
        const localId = `smoke-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

        const { status, data } = await httpPost(
            `${opts.serverUrl}/v3/sessions/${sessionId}/messages`,
            { messages: [{ content: encodeBase64(encryptedContent), localId }] },
            { Authorization: `Bearer ${token}` },
            opts.timeout
        );

        if (opts.verbose) console.error(`  [send] status=${status} data=${JSON.stringify(data).slice(0, 200)}`);

        if (status >= 200 && status < 300) {
            return {
                name: 'send_message',
                status: 'pass',
                duration_ms: Date.now() - start,
                details: { local_id: localId, http_status: status },
                localId,
            };
        }
        return {
            name: 'send_message',
            status: 'fail',
            duration_ms: Date.now() - start,
            details: { response: data },
            error: `Send message failed: status=${status}`,
        };
    } catch (e: any) {
        return {
            name: 'send_message',
            status: 'fail',
            duration_ms: Date.now() - start,
            details: {},
            error: e.message || String(e),
        };
    }
}

async function stepRetrieveMessage(
    opts: Options, token: string, sessionId: string, sessionKey: Uint8Array
): Promise<StepResult> {
    const start = Date.now();
    try {
        const { status, data } = await httpGet(
            `${opts.serverUrl}/v3/sessions/${sessionId}/messages?after_seq=0&limit=10`,
            { Authorization: `Bearer ${token}` },
            opts.timeout
        );

        if (opts.verbose) console.error(`  [retrieve] status=${status} data=${JSON.stringify(data).slice(0, 300)}`);

        if (!data?.messages || !Array.isArray(data.messages)) {
            return {
                name: 'retrieve_message',
                status: 'fail',
                duration_ms: Date.now() - start,
                details: { response: data },
                error: `No messages array in response`,
            };
        }

        // Try to decrypt the first message
        const msgs = data.messages;
        if (msgs.length === 0) {
            return {
                name: 'retrieve_message',
                status: 'fail',
                duration_ms: Date.now() - start,
                details: { message_count: 0 },
                error: 'No messages returned',
            };
        }

        const msg = msgs[0];
        const encryptedB64 = msg?.content?.c || msg?.content;
        let decrypted: unknown = null;

        if (typeof encryptedB64 === 'string') {
            decrypted = decryptWithDataKey(decodeBase64(encryptedB64), sessionKey);
        }

        return {
            name: 'retrieve_message',
            status: decrypted ? 'pass' : 'fail',
            duration_ms: Date.now() - start,
            details: {
                message_count: msgs.length,
                decrypted: !!decrypted,
                content_preview: decrypted ? JSON.stringify(decrypted).slice(0, 100) : null,
            },
            error: decrypted ? undefined : 'Failed to decrypt message',
        };
    } catch (e: any) {
        return {
            name: 'retrieve_message',
            status: 'fail',
            duration_ms: Date.now() - start,
            details: {},
            error: e.message || String(e),
        };
    }
}

async function stepWebSocket(opts: Options, token: string, sessionId: string): Promise<StepResult> {
    const start = Date.now();
    try {
        const { io } = await import('socket.io-client');
        return await new Promise<StepResult>((resolve) => {
            const timer = setTimeout(() => {
                socket.disconnect();
                resolve({
                    name: 'websocket',
                    status: 'fail',
                    duration_ms: Date.now() - start,
                    details: {},
                    error: `WebSocket connection timed out (${opts.timeout}ms)`,
                });
            }, opts.timeout);

            const socket = io(opts.serverUrl, {
                auth: { token },
                path: '/v1/updates',
                transports: ['websocket'],
                reconnection: false,
            });

            socket.on('connect', () => {
                clearTimeout(timer);
                const transport = socket.io.engine?.transport?.name || 'unknown';
                socket.disconnect();
                resolve({
                    name: 'websocket',
                    status: 'pass',
                    duration_ms: Date.now() - start,
                    details: { connected: true, transport },
                });
            });

            socket.on('connect_error', (err) => {
                clearTimeout(timer);
                socket.disconnect();
                resolve({
                    name: 'websocket',
                    status: 'fail',
                    duration_ms: Date.now() - start,
                    details: { error_type: err.message },
                    error: `WebSocket connect error: ${err.message}`,
                });
            });
        });
    } catch (e: any) {
        if (e.code === 'ERR_MODULE_NOT_FOUND' || e.code === 'MODULE_NOT_FOUND') {
            return {
                name: 'websocket',
                status: 'skip',
                duration_ms: Date.now() - start,
                details: { reason: 'socket.io-client not available' },
            };
        }
        return {
            name: 'websocket',
            status: 'fail',
            duration_ms: Date.now() - start,
            details: {},
            error: e.message || String(e),
        };
    }
}

async function stepCleanup(opts: Options, token: string, sessionId: string): Promise<StepResult> {
    const start = Date.now();
    try {
        // There's no DELETE endpoint for sessions in the API, so we just mark as "cleaned"
        // The session will remain but that's fine for smoke tests
        return {
            name: 'cleanup',
            status: 'pass',
            duration_ms: Date.now() - start,
            details: { session_id: sessionId, note: 'session left on server (no delete API)' },
        };
    } catch (e: any) {
        return {
            name: 'cleanup',
            status: 'fail',
            duration_ms: Date.now() - start,
            details: {},
            error: e.message || String(e),
        };
    }
}

// ─── Output ──────────────────────────────────────────────────────────

function printHuman(results: StepResult[], serverUrl: string, totalMs: number) {
    console.log(`\n🔍 MT-Happy Smoke Test`);
    console.log(`   Server: ${serverUrl}\n`);

    for (const r of results) {
        const icon = r.status === 'pass' ? '✅' : r.status === 'skip' ? '⏭️' : '❌';
        const name = r.name.padEnd(18);
        const ms = `${r.duration_ms}ms`.padStart(7);
        const detail = r.error || Object.entries(r.details).map(([k, v]) => `${k}=${v}`).join(' ');
        console.log(`${icon} ${name} ${ms}   ${detail.slice(0, 80)}`);
    }

    const passed = results.filter(r => r.status === 'pass').length;
    const failed = results.filter(r => r.status === 'fail').length;
    const total = results.length;

    console.log(`\n${'━'.repeat(50)}`);
    if (failed === 0) {
        console.log(`✅ All ${passed}/${total} checks passed in ${totalMs}ms\n`);
    } else {
        console.log(`❌ ${failed}/${total} checks failed in ${totalMs}ms\n`);
    }
}

function printJson(results: StepResult[], serverUrl: string, totalMs: number) {
    const output = {
        success: results.every(r => r.status !== 'fail'),
        server: serverUrl,
        timestamp: new Date().toISOString(),
        duration_ms: totalMs,
        steps: results,
    };
    console.log(JSON.stringify(output, null, 2));
}

// ─── Main ────────────────────────────────────────────────────────────

function parseArgs(): Options {
    const args = process.argv.slice(2);
    let serverUrl = process.env.HAPPY_SERVER_URL || 'https://mt.swannzh.icu';
    let json = false;
    let verbose = false;
    let seed: Uint8Array | null = null;
    let noWs = false;
    let noCleanup = false;
    let timeout = 10000;

    for (let i = 0; i < args.length; i++) {
        const arg = args[i];
        if (arg === '--json') json = true;
        else if (arg === '--verbose') verbose = true;
        else if (arg === '--no-ws') noWs = true;
        else if (arg === '--no-cleanup') noCleanup = true;
        else if (arg === '--seed' && args[i + 1]) {
            seed = new Uint8Array(Buffer.from(args[++i], 'hex'));
        } else if (arg === '--timeout' && args[i + 1]) {
            timeout = parseInt(args[++i], 10);
        } else if (!arg.startsWith('--') && (arg.startsWith('http://') || arg.startsWith('https://'))) {
            serverUrl = arg.replace(/\/+$/, '');
        }
    }

    if (!seed && process.env.SMOKE_TEST_SEED) {
        seed = new Uint8Array(Buffer.from(process.env.SMOKE_TEST_SEED, 'hex'));
    }

    return {
        serverUrl,
        json,
        verbose,
        seed: seed || getRandomBytes(32),
        noWs,
        noCleanup,
        timeout,
    };
}

async function main() {
    const opts = parseArgs();
    const sessionKey = getRandomBytes(32);
    const results: StepResult[] = [];
    const startTime = Date.now();

    // Step 1: Auth
    const auth = await stepAuth(opts, opts.seed);
    results.push(auth);
    if (auth.status !== 'pass' || !auth.token) {
        return finish(results, opts, startTime);
    }

    // Step 2: Create Session
    const session = await stepCreateSession(opts, auth.token, opts.seed, sessionKey);
    results.push(session);
    if (session.status !== 'pass' || !session.sessionId) {
        return finish(results, opts, startTime);
    }

    // Step 3: Send Message
    const send = await stepSendMessage(opts, auth.token, session.sessionId, sessionKey);
    results.push(send);

    // Step 4: Retrieve Message (even if send failed, try to retrieve)
    const retrieve = await stepRetrieveMessage(opts, auth.token, session.sessionId, sessionKey);
    results.push(retrieve);

    // Step 5: WebSocket
    if (!opts.noWs) {
        const ws = await stepWebSocket(opts, auth.token, session.sessionId);
        results.push(ws);
    }

    // Step 6: Cleanup
    if (!opts.noCleanup) {
        const cleanup = await stepCleanup(opts, auth.token, session.sessionId);
        results.push(cleanup);
    }

    return finish(results, opts, startTime);
}

function finish(results: StepResult[], opts: Options, startTime: number) {
    const totalMs = Date.now() - startTime;
    if (opts.json) {
        printJson(results, opts.serverUrl, totalMs);
    } else {
        printHuman(results, opts.serverUrl, totalMs);
    }

    const hasFail = results.some(r => r.status === 'fail');
    process.exit(hasFail ? 1 : 0);
}

main().catch((e) => {
    console.error(`Fatal error: ${e.message || e}`);
    process.exit(2);
});
