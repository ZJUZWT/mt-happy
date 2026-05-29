import { encodeBase64 } from './encryption';
import { configuration } from '@/configuration';

/**
 * Generate a URL for web authentication
 * @param publicKey - The ephemeral public key to include in the URL
 * @returns The web authentication URL (opens in browser for user to approve)
 */
export function generateWebAuthUrl(publicKey: Uint8Array): string {
    const publicKeyBase64 = encodeBase64(publicKey, 'base64url');
    // Auth page lives on the webapp domain, not the API server
    const baseUrl = configuration.webappUrl;
    return `${baseUrl}/terminal/connect#key=${publicKeyBase64}`;
}