/**
 * Feature detection for the WebAuthn Signal API.
 *
 * Support at time of writing:
 *   - Chromium 132+ (Chrome, Edge) — on by default since Jan 2025.
 *   - Safari 26+ / iOS 26+ — supported but the two credential-removing
 *     methods have a known bug that can delete passkeys of unrelated
 *     accounts stored as combined password+passkey entries in the
 *     Apple Passwords app. See README > "iOS 26 caveat".
 *   - Firefox — not supported at time of writing.
 *
 * These methods are individually feature-detected because Safari
 * historically ships them one at a time.
 */

type SignalCapablePKC = typeof PublicKeyCredential & {
  signalUnknownCredential?: (opts: {
    rpId: string;
    credentialId: string;
  }) => Promise<void>;
  signalAllAcceptedCredentials?: (opts: {
    rpId: string;
    userId: string;
    allAcceptedCredentialIds: string[];
  }) => Promise<void>;
  signalCurrentUserDetails?: (opts: {
    rpId: string;
    userId: string;
    name: string;
    displayName: string;
  }) => Promise<void>;
};

/** Whether the runtime exposes `PublicKeyCredential` at all. */
export const hasWebAuthn = (): boolean =>
  typeof globalThis !== 'undefined' &&
  typeof (globalThis as { PublicKeyCredential?: unknown }).PublicKeyCredential !==
    'undefined';

/** `PublicKeyCredential` typed with optional Signal API members. */
export const getPKC = (): SignalCapablePKC | null =>
  hasWebAuthn() ? (PublicKeyCredential as SignalCapablePKC) : null;

export const supportsSignalUnknownCredential = (): boolean =>
  typeof getPKC()?.signalUnknownCredential === 'function';

export const supportsSignalAllAcceptedCredentials = (): boolean =>
  typeof getPKC()?.signalAllAcceptedCredentials === 'function';

export const supportsSignalCurrentUserDetails = (): boolean =>
  typeof getPKC()?.signalCurrentUserDetails === 'function';
