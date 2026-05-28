import { encodeBase64 } from './encryption';
import { configuration } from '@/configuration';

/**
 * Generate a URL for web authentication
 * @param publicKey - The ephemeral public key to include in the URL
 * @returns The web authentication URL (uses serverUrl for self-hosted, webappUrl as fallback)
 */
export function generateWebAuthUrl(publicKey: Uint8Array): string {
    const publicKeyBase64 = encodeBase64(publicKey, 'base64url');
    // For self-hosted: webapp is served from the same URL as the server
    const baseUrl = configuration.serverUrl !== 'https://api.cluster-fluster.com'
        ? configuration.serverUrl
        : configuration.webappUrl;
    return `${baseUrl}/terminal/connect#key=${publicKeyBase64}`;
}