# MT-Happy E2E Deployment Testing

## Overview

This document describes how to use the E2E authentication testing tools to validate MT-Happy deployments.

The testing suite provides a command-line tool that exercises the complete authentication and session flow without requiring a browser or mobile app, making it perfect for automated deployment validation.

## What Gets Tested

1. **Authentication** - Challenge-response auth flow to get JWT token
2. **Session Creation** - Creating encrypted sessions with AES-256-GCM
3. **Message Sending** - Sending encrypted messages to sessions
4. **Message Retrieval** - Fetching and decrypting messages from sessions

## Quick Start

### Prerequisites

- Node.js 18+
- npx or pnpm installed
- Access to running MT-Happy server

### Running the Test

```bash
# Clone/update repository
git clone https://github.com/slopus/happy.git
cd happy

# Run E2E test against production
npx tsx packages/happy-agent/src/test-auth-cli.ts

# Run E2E test against local server
HAPPY_SERVER_URL=http://localhost:3005 npx tsx packages/happy-agent/src/test-auth-cli.ts

# Run with custom secret
npx tsx packages/happy-agent/src/test-auth-cli.ts --secret $(node -e "console.log(require('crypto').randomBytes(32).toString('base64'))")
```

### Expected Output

Success case:
```
🔧 MT-Happy E2E Auth Test
📍 Server: https://mt.hk.swannzh.icu

⏱️  Running E2E test...

✅ auth        123ms {"tokenLength": 256}
✅ session      45ms {"sessionId": "sess-abc123..."}
✅ message      67ms {"messageCount": 1, "firstMessage": {...}}
✅ retrieve     32ms {"totalMessages": 1, "decryptedMessages": 1, "hasMore": false}

📊 Timing Summary:
   Auth:     123ms
   Session:  45ms
   Message:  67ms
   Retrieve: 32ms
   Total:    267ms

✅ All tests passed!
```

Failure case:
```
🔧 MT-Happy E2E Auth Test
📍 Server: http://localhost:3005

⏱️  Running E2E test...

❌ auth        123ms - ECONNREFUSED: Connection refused
❌ session        0ms
❌ message        0ms
❌ retrieve       0ms

❌ Test failed: ECONNREFUSED: Connection refused
```

## Programmatic Usage

```typescript
import { testAuthEndToEnd } from '@/test-auth-e2e';
import { loadConfig } from '@/config';

const config = loadConfig();
const result = await testAuthEndToEnd(config);

if (result.success) {
  console.log(`Deployment validated in ${result.timing.totalMs}ms`);
} else {
  console.error(`Deployment validation failed: ${result.error}`);
  process.exit(1);
}
```

## CI/CD Integration

### GitHub Actions Example

```yaml
name: Validate Deployment

on:
  deployment_status:

jobs:
  e2e-test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      - run: npm install
      - run: npx tsx packages/happy-agent/src/test-auth-cli.ts
        env:
          HAPPY_SERVER_URL: ${{ deployment.environment_url }}
```

### GitLab CI Example

```yaml
e2e-test:
  image: node:18
  script:
    - npm install
    - npx tsx packages/happy-agent/src/test-auth-cli.ts
  environment:
    name: production
    url: https://mt.hk.swannzh.icu
  when: manual
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `HAPPY_SERVER_URL` | `https://mt.hk.swannzh.icu` | Server URL to test against |
| `HAPPY_HOME_DIR` | `~/.happy` | Home directory for credentials |

## CLI Options

| Option | Description | Example |
|--------|-------------|---------|
| `--server <url>` | Override server URL | `--server http://localhost:3005` |
| `--secret <base64>` | Use specific secret (base64) | `--secret SGVsbG8gV29ybGQh...` |

## How It Works

### 1. Authentication Phase

- Generates a random 32-byte account secret
- Creates a signing keypair from the secret
- Generates a random 32-byte challenge
- Signs the challenge with `tweetnacl.sign.detached`
- Sends to `POST /v1/auth`: `{ challenge, publicKey, signature }` (all base64)
- Receives and validates token

**Time: ~100-200ms**

### 2. Session Creation Phase

- Generates a random 32-byte session key
- Encrypts metadata using AES-256-GCM: `{ tag, path, summary }`
- Derives content keypair from session key using HMAC-SHA512
- Encrypts session key using NaCl box with content public key
- Sends to `POST /v1/sessions`: `{ tag, metadata, dataEncryptionKey }`
- Receives session ID

**Time: ~30-50ms**

### 3. Message Sending Phase

- Encrypts message content using AES-256-GCM with session key
- Sends to `POST /v3/sessions/{id}/messages`: `{ messages: [{content, localId}] }`
- Receives message confirmation with seq number

**Time: ~50-100ms**

### 4. Message Retrieval Phase

- Polls `GET /v3/sessions/{id}/messages?after_seq=0`
- Receives encrypted messages
- Decrypts each message using session key
- Verifies decryption succeeded

**Time: ~20-40ms**

**Total: ~200-400ms** (depends on network latency)

## Troubleshooting

### "Connection refused"
- Check server is running
- Verify `HAPPY_SERVER_URL` is correct
- Check firewall/network access

### "No token in response"
- Check server logs for auth errors
- Verify `HANDY_MASTER_SECRET` is set on server
- Check challenge/signature signing

### "No session ID in response"
- Verify authentication token is valid
- Check if user account was created properly
- Verify encryption format matches server expectations

### "Failed to decrypt session key"
- Check if content keypair derivation matches server
- Verify base64 encoding/decoding
- Ensure NaCl box format is correct

## Performance Expectations

| Component | Min | Typical | Max |
|-----------|-----|---------|-----|
| Auth | 50ms | 120ms | 300ms |
| Session | 20ms | 40ms | 150ms |
| Message | 30ms | 60ms | 200ms |
| Retrieve | 15ms | 30ms | 100ms |
| **Total** | **115ms** | **250ms** | **750ms** |

Timing depends on:
- Network latency
- Server load
- Cryptographic operations
- Database query performance

## Files

- `packages/happy-agent/src/test-auth-e2e.ts` - Core testing module (274 lines)
- `packages/happy-agent/src/test-auth-cli.ts` - CLI entry point (83 lines)
- `packages/happy-agent/src/test-auth-e2e.test.ts` - Unit tests (63 lines)

## Extending the Tests

To add custom validation:

```typescript
import { testAuthEndToEnd } from '@/test-auth-e2e';

const result = await testAuthEndToEnd(config);

// Custom assertions
if (result.timing.totalMs > 500) {
  console.warn('Performance degradation detected');
}

if (result.steps.some(s => !s.success)) {
  console.error('One or more steps failed');
  process.exit(1);
}
```

## API Documentation

See `packages/happy-agent/src/test-auth-e2e.ts` for the TypeScript API reference.

Main export: `testAuthEndToEnd(config: Config, secret?: Uint8Array): Promise<TestResult>`

## Security Notes

- Each test run generates a new ephemeral account secret
- No credentials are stored or logged
- All traffic is encrypted with the server's TLS certificate
- Suitable for regular deployment validation
- Safe to run in CI/CD pipelines

## Support

For issues or questions:
1. Check the error message and troubleshooting guide
2. Review server logs at `~/.happy-dev/logs/`
3. Run with verbose output: `DEBUG=* npx tsx test-auth-cli.ts`
