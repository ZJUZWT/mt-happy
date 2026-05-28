import { encodeBase64 } from './encryption';
import { configuration } from '@/configuration';

/**
 * Generate a URL for web authentication
 * @param publicKey - The ephemeral public key to include in the URL
 * @returns The web authentication URL (self-hosted: serverUrl == webappUrl, same domain)
 */
export function generateWebAuthUrl(publicKey: Uint8Array): string {
    const publicKeyBase64 = encodeBase64(publicKey, 'base64url');
    // In our self-hosted setup, webapp is always served from the same URL as the server
    const baseUrl = configuration.serverUrl;
    return `${baseUrl}/terminal/connect#key=${publicKeyBase64}`;
}