/**
 * Payload handling for Edge Function responses.
 *
 * The Edge Function now returns plain JSON over TLS, protected by:
 * - TLS encryption in transit
 * - JWT authentication (only authenticated users can call)
 * - RLS policies (database-level access control)
 *
 * This module provides a thin wrapper to parse the response consistently.
 */

interface EdgeFunctionResponse<T> {
  data: T;
  count?: number;
}

/**
 * Parses a JSON response from the Edge Function.
 * Previously this decrypted AES-encrypted payloads, but encryption based on
 * a build-time shared secret (EXPO_PUBLIC_SECRET_PAYLOAD_KEY) was removed
 * because:
 * 1. Public build-time secrets are extractable from the app bundle
 * 2. TLS already protects data in transit
 * 3. JWT auth already controls who can call the Edge Function
 *
 * @deprecated The `encryptedResponse` parameter name is kept for backward
 * compatibility. The function now expects plain JSON.
 */
export function decryptSecurePayload<T>(
  response: { cipherText?: string; data?: T; count?: number } | EdgeFunctionResponse<T>
): T {
  try {
    // If the response already has a `data` field, it's the new plain JSON format
    if (response && 'data' in response && response.data !== undefined) {
      return response.data as T;
    }

    // Legacy: if cipherText is present, the Edge Function is still encrypting.
    // This should not happen after the migration. Throw a clear error.
    if (response && 'cipherText' in response && response.cipherText) {
      throw new Error(
        'Received encrypted response. The Edge Function should return plain JSON. ' +
        'Ensure SECRET_PAYLOAD_KEY encryption has been removed from the Edge Function.'
      );
    }

    throw new Error('Invalid response format from Edge Function');
  } catch (error) {
    console.error('[Payload Error]:', error);
    // Rethrow explicit format errors so callers can distinguish them
    if (error instanceof Error && (
      error.message.includes('Received encrypted response') ||
      error.message.includes('Invalid response format')
    )) {
      throw error;
    }
    throw new Error('Failed to process secure content.');
  }
}
