/**
 * CLI entry point for end-to-end authentication testing
 * 
 * Usage:
 *   ts-node test-auth-cli.ts [--server <url>] [--secret <base64>]
 * 
 * Environment variables:
 *   HAPPY_SERVER_URL - Server URL (default: https://mt.swannzh.icu)
 *   HAPPY_HOME_DIR - Home directory for credentials
 */

import { testAuthEndToEnd } from "./test-auth-e2e";
import { loadConfig } from "./config";
import { getRandomBytes, encodeBase64, decodeBase64 } from "./encryption";

async function main() {
    const config = loadConfig();
    console.log("🔧 MT-Happy E2E Auth Test");
    console.log(`📍 Server: ${config.serverUrl}`);
    console.log();

    // Parse command line arguments
    let customSecret: Uint8Array | undefined;
    const args = process.argv.slice(2);

    for (let i = 0; i < args.length; i++) {
        if (args[i] === "--secret" && args[i + 1]) {
            try {
                customSecret = decodeBase64(args[i + 1]);
                if (customSecret.length !== 32) {
                    console.error("❌ Secret must be 32 bytes (base64 encoded)");
                    process.exit(1);
                }
            } catch (e) {
                console.error("❌ Failed to decode secret:", e instanceof Error ? e.message : String(e));
                process.exit(1);
            }
            i++;
        } else if (args[i] === "--server" && args[i + 1]) {
            config.serverUrl = args[i + 1];
            i++;
        }
    }

    console.log("⏱️  Running E2E test...");
    console.log();

    const result = await testAuthEndToEnd(config, customSecret);

    // Print results
    for (const step of result.steps) {
        const icon = step.success ? "✅" : "❌";
        const duration = step.duration.toString().padStart(4, " ");
        console.log(`${icon} ${step.step.padEnd(8)} ${duration}ms`, step.error ? `- ${step.error}` : "");
        if (step.details && step.success) {
            console.log(`   ${JSON.stringify(step.details)}`);
        }
    }

    console.log();
    console.log("📊 Timing Summary:");
    console.log(`   Auth:     ${result.timing.authMs}ms`);
    console.log(`   Session:  ${result.timing.sessionMs}ms`);
    console.log(`   Message:  ${result.timing.messageMs}ms`);
    console.log(`   Retrieve: ${result.timing.retrieveMs}ms`);
    console.log(`   Total:    ${result.timing.totalMs}ms`);

    if (result.success) {
        console.log();
        console.log("✅ All tests passed!");
        process.exit(0);
    } else {
        console.log();
        console.log(`❌ Test failed: ${result.error}`);
        process.exit(1);
    }
}

main().catch(err => {
    console.error("❌ Fatal error:", err instanceof Error ? err.message : String(err));
    process.exit(1);
});

