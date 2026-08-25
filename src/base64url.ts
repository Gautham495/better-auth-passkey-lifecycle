/**
 * Base64URL codec — WebAuthn everywhere uses base64url without padding.
 *
 * The Signal API rejects any id or user handle that isn't valid base64url,
 * so we normalize inputs before calling: server user handles are typically
 * opaque UTF-8 strings (e.g. cuid, ulid), not base64url. Credential ids
 * coming back from better-auth's `listUserPasskeys` are already base64url
 * (that's how they were stored at registration time).
 */

const B64URL_RE = /^[A-Za-z0-9\-_]*={0,2}$/;

/** True if `s` is already a valid base64url string (padding optional). */
export const isBase64Url = (s: string): boolean =>
  s.length > 0 && B64URL_RE.test(s);

/** Encode a UTF-8 string as unpadded base64url. */
export const b64urlEncodeUtf8 = (input: string): string => {
  const bytes = new TextEncoder().encode(input);
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]!);
  const b64 =
    typeof btoa === "function"
      ? btoa(bin)
      : // Node fallback (SSR).
        (
          globalThis as {
            Buffer?: {
              from(s: string, e: string): { toString(e: string): string };
            };
          }
        )
          .Buffer!.from(bin, "binary")
          .toString("base64");
  return b64.replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
};

/**
 * Normalize a user handle for the Signal API. If it's already base64url
 * (padded or not), pass it through; otherwise encode as UTF-8.
 *
 * better-auth stores the user id as an opaque string on the `user` table
 * and passes it verbatim as the WebAuthn user handle at registration time,
 * so the two must be normalized the same way when signaling.
 */
export const normalizeUserHandle = (raw: string): string =>
  isBase64Url(raw) ? raw : b64urlEncodeUtf8(raw);
