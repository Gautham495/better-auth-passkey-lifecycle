/**
 * better-auth-passkey-lifecycle
 *
 * Three imperative helpers that call the WebAuthn Signal API from your
 * app at the right moments in the better-auth passkey lifecycle:
 *
 *   - `signalUnknownCredential`      — call after the server rejects an assertion
 *   - `signalAllAcceptedCredentials` — call after add / delete / login (see caveat)
 *   - `signalCurrentUserDetails`     — call after the user renames a passkey
 *
 * Plus one convenience:
 *
 *   - `syncAcceptedCredentials(authClient, { rpId, userId })` — fetches the
 *     current accepted set from `authClient.passkey.listUserPasskeys()`
 *     and signals it. Refuses to signal an empty list unless you opt in.
 *
 * This package does NOT wrap `passkeyClient()`. Call these helpers yourself
 * at the points that make sense for your app — that keeps the surface small,
 * the coupling loose, and lets you skip the signal on flows where it isn't
 * wanted (e.g. an admin-side delete of another user's passkey).
 *
 * @see https://developer.chrome.com/docs/identity/webauthn-signal-api
 * @see https://developer.android.com/identity/credential-manager/signal-api-rp
 * @see https://www.corbado.com/blog/webauthn-signal-api
 */

import { normalizeUserHandle } from "./base64url";
import {
  getPKC,
  supportsSignalAllAcceptedCredentials,
  supportsSignalCurrentUserDetails,
  supportsSignalUnknownCredential,
} from "./support";

export {
  normalizeUserHandle,
  isBase64Url,
  b64urlEncodeUtf8,
} from "./base64url";
export {
  hasWebAuthn,
  supportsSignalUnknownCredential,
  supportsSignalAllAcceptedCredentials,
  supportsSignalCurrentUserDetails,
} from "./support";

/**
 * Result of any signal call. `signaled: false` means the browser did not
 * support the specific Signal API method and the call was a silent no-op.
 * `signaled: true` means the browser accepted the request — it does NOT
 * guarantee the credential manager acted on it, since the Signal API
 * intentionally returns no information about what the authenticator did.
 */
export type SignalResult =
  | { signaled: true }
  | { signaled: false; reason: "unsupported" };

const UNSUPPORTED: SignalResult = { signaled: false, reason: "unsupported" };
const OK: SignalResult = { signaled: true };

/* -------------------------------------------------------------------------- */
/*  1. signalUnknownCredential                                                */
/* -------------------------------------------------------------------------- */

export interface SignalUnknownCredentialInput {
  /** RP ID as configured on your better-auth server (e.g. `example.com`). */
  rpId: string;
  /**
   * Base64URL-encoded credential id — the same value the server rejected.
   * This is the `id` field on the assertion response, or the `credentialID`
   * column on the `passkey` table.
   */
  credentialId: string;
}

/**
 * Tell the credential manager that a credential id no longer exists on
 * the server. Safe to call when the user is NOT authenticated — it only
 * names one credential id and reveals nothing about the account.
 *
 * When to call:
 *   - After `authClient.signIn.passkey()` returns an error whose status
 *     suggests the passkey is gone from the server (typically 404 or a
 *     "credential not found" error), pass the id the user just tried to
 *     use. Chrome / Google Password Manager will hide it; iOS 26+
 *     Passwords app will delete it (subject to the caveat in the README).
 *
 * No-op on browsers without Signal API support.
 */
export const signalUnknownCredential = async (
  input: SignalUnknownCredentialInput,
): Promise<SignalResult> => {
  if (!supportsSignalUnknownCredential()) return UNSUPPORTED;
  await getPKC()!.signalUnknownCredential!({
    rpId: input.rpId,
    credentialId: input.credentialId,
  });
  return OK;
};

/* -------------------------------------------------------------------------- */
/*  2. signalAllAcceptedCredentials                                           */
/* -------------------------------------------------------------------------- */

export interface SignalAllAcceptedCredentialsInput {
  rpId: string;
  /**
   * WebAuthn user handle. If your server's user id is an opaque UTF-8
   * string (cuid, ulid, uuid), it's already the raw user handle better-auth
   * used at registration — this function will base64url-encode it for you.
   * If you have a value that's already base64url, it's passed through.
   */
  userId: string;
  /**
   * Base64URL-encoded credential ids the server still accepts for this
   * user. As returned by `authClient.passkey.listUserPasskeys()`
   * (the `credentialID` field on each row).
   */
  allAcceptedCredentialIds: string[];
  /**
   * Guard against sending an empty list. An empty list means "delete
   * every passkey for this user" on the device — sometimes what you
   * want (user removed their last passkey), but usually a bug in the
   * caller (list-passkeys returned nothing due to an auth error, etc).
   *
   * Default `false`: empty lists are refused (returns `unsupported`).
   * Set `true` only when you're sure the user genuinely has no
   * passkeys left server-side.
   *
   * On iOS 26+ this matters extra: an empty list is a deletion, and
   * deletions can trigger the cross-account passkey deletion bug.
   */
  allowEmpty?: boolean;
}

/**
 * Tell the credential manager the complete set of credential ids the
 * server still accepts for a user. Anything outside this list gets
 * hidden (Chrome / GPM) or deleted (iOS Passwords app).
 *
 * Call ONLY when the user is authenticated — the full accepted set
 * exposes account structure.
 *
 * When to call:
 *   - Right after a successful passkey add or delete, with the fresh
 *     list from `listUserPasskeys()`.
 *   - Right after a successful passkey login, so any device-local
 *     entries that the user removed on another device get pruned.
 *
 * ## iOS 26 caveat
 *
 * On iOS / macOS 26.0.1 through at least 26.6.1, this method can
 * delete passkeys of an unrelated account on the same RP ID when
 * that other account is stored as a combined password+passkey entry
 * in the Apple Passwords app. The bug is triggered by deletions
 * (i.e. the credential id sent is missing from the list), not by
 * calls per se — so calling with a complete, correct list is safe.
 * Calling with an empty list is a deletion and unsafe.
 * See https://www.corbado.com/blog/signal-api-ios-passkey-deletion-bug
 *
 * No-op on browsers without Signal API support.
 */
export const signalAllAcceptedCredentials = async (
  input: SignalAllAcceptedCredentialsInput,
): Promise<SignalResult> => {
  if (!supportsSignalAllAcceptedCredentials()) return UNSUPPORTED;
  if (input.allAcceptedCredentialIds.length === 0 && !input.allowEmpty) {
    // Refuse silently. Callers that genuinely mean "remove everything"
    // must opt in via allowEmpty: true.
    return UNSUPPORTED;
  }
  await getPKC()!.signalAllAcceptedCredentials!({
    rpId: input.rpId,
    userId: normalizeUserHandle(input.userId),
    allAcceptedCredentialIds: input.allAcceptedCredentialIds,
  });
  return OK;
};

/* -------------------------------------------------------------------------- */
/*  3. signalCurrentUserDetails                                               */
/* -------------------------------------------------------------------------- */

export interface SignalCurrentUserDetailsInput {
  rpId: string;
  userId: string;
  /** WebAuthn `user.name` — the login-facing username. */
  name: string;
  /** WebAuthn `user.displayName` — the human-facing label. */
  displayName: string;
}

/**
 * Update the username / display name shown for the user's stored
 * passkeys. Authenticated only.
 *
 * When to call:
 *   - After the user renames a passkey (`updatePasskey`).
 *   - After the user changes their account email / display name and
 *     you want the credential manager UI to reflect it.
 *
 * This method is correctly scoped on every platform we know of — it
 * does not have the iOS 26 cross-account bug that affects the two
 * removal methods.
 *
 * No-op on browsers without Signal API support.
 */
export const signalCurrentUserDetails = async (
  input: SignalCurrentUserDetailsInput,
): Promise<SignalResult> => {
  if (!supportsSignalCurrentUserDetails()) return UNSUPPORTED;
  await getPKC()!.signalCurrentUserDetails!({
    rpId: input.rpId,
    userId: normalizeUserHandle(input.userId),
    name: input.name,
    displayName: input.displayName,
  });
  return OK;
};

/* -------------------------------------------------------------------------- */
/*  Convenience: syncAcceptedCredentials(authClient, ...)                     */
/* -------------------------------------------------------------------------- */

/**
 * Structural type for a better-auth client with the passkey plugin
 * attached. Only the one method we call is required — we don't want
 * to hard-import `@better-auth/passkey` and force it into consumers'
 * bundles.
 */
export interface AuthClientWithPasskey {
  passkey: {
    listUserPasskeys: () => Promise<{
      data?: Array<{
        credentialID?: string;
        credentialId?: string;
        id?: string;
      }> | null;
      error?: unknown;
    }>;
  };
}

export interface SyncAcceptedCredentialsOptions {
  rpId: string;
  /** WebAuthn user handle — see SignalAllAcceptedCredentialsInput.userId. */
  userId: string;
  /**
   * Forwarded to `signalAllAcceptedCredentials` — set true only if you
   * genuinely mean "the user has no passkeys anymore, delete them all
   * from the device".
   */
  allowEmpty?: boolean;
}

/**
 * Fetch the authoritative accepted-credential set from better-auth and
 * push it to the OS credential manager in one call.
 *
 * ```ts
 * import { syncAcceptedCredentials } from 'better-auth-passkey-lifecycle';
 *
 * // After a successful login:
 * await syncAcceptedCredentials(authClient, {
 *   rpId: 'example.com',
 *   userId: session.user.id,
 * });
 *
 * // After the user deletes a passkey:
 * await authClient.passkey.deletePasskey({ id });
 * await syncAcceptedCredentials(authClient, { rpId, userId });
 * ```
 *
 * Returns `signaled: false` when the browser doesn't support the API,
 * when the list is empty and `allowEmpty` isn't set, or when the
 * list-passkeys request itself failed. Never throws for network or
 * unsupported-browser reasons — signaling is best-effort by design.
 */
export const syncAcceptedCredentials = async (
  authClient: AuthClientWithPasskey,
  options: SyncAcceptedCredentialsOptions,
): Promise<SignalResult> => {
  if (!supportsSignalAllAcceptedCredentials()) return UNSUPPORTED;

  let ids: string[];
  try {
    const res = await authClient.passkey.listUserPasskeys();
    if (!res.data) return UNSUPPORTED;
    ids = res.data
      .map((row) => row.credentialID ?? row.credentialId ?? row.id)
      .filter((x): x is string => typeof x === "string" && x.length > 0);
  } catch {
    // list-passkeys itself failed (network, auth, etc). Best-effort —
    // don't signal anything, because we don't have an authoritative list.
    return UNSUPPORTED;
  }

  return signalAllAcceptedCredentials({
    rpId: options.rpId,
    userId: options.userId,
    allAcceptedCredentialIds: ids,
    allowEmpty: options.allowEmpty,
  });
};
