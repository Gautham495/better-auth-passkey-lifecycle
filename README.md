<a href="https://gauthamvijay.com">
  <picture>
    <img alt="better-auth-passkey-lifecycle-banner" src="./docs/img/banner.png" />
  </picture>
</a>

# better-auth-passkey-lifecycle

Three thin helpers that call the [**WebAuthn Signal API**](https://developer.chrome.com/docs/identity/webauthn-signal-api) so passkeys `@better-auth/passkey` deletes server-side actually disappear from **iCloud Keychain / Google Password Manager / device credential stores** on the user's device.

Better-auth deletes the row. The device never hears about it. Users tap the passkey, get a cryptic "credential not found" error, and give up. This library fixes that on web.

- 🧹 **Ghost credential fix** — Server-side deletions actually reach the device credential store.
- 🎯 **Better-auth first** — Wraps `authClient.passkey.listUserPasskeys()` so `syncAcceptedCredentials` is a one-liner.
- 🪶 **~1 KB gzipped** — Three functions, one convenience helper, no runtime dependencies.
- 🌐 **Progressive** — Feature-detects per method; silent no-op on browsers without Signal API support.
- 🛡️ **iOS 26 bug guard** — Refuses empty accepted-lists by default to avoid the [Apple Passwords cross-account deletion bug](https://www.corbado.com/blog/signal-api-ios-passkey-deletion-bug).

---

> [!IMPORTANT]
>
> - Requires **`better-auth` 1.6.26+** with the `@better-auth/passkey` server plugin — same as the RN companion library.
> - Requires a browser with WebAuthn Signal API support: **Chromium 132+** (Chrome, Edge, Arc, Brave) or **Safari 26+**. Firefox is not supported at time of writing; this library silently no-ops there.
> - For React Native, use [`react-native-nitro-better-auth-passkey`](https://github.com/Gautham495/react-native-nitro-better-auth-passkey) — same API surface, native `ASAuthorizationPlatformPublicKeyCredentialProvider` on iOS and `CredentialManager.signalCredentialState` on Android.

---

## 📦 Installation

```bash
npm install better-auth-passkey-lifecycle
```

No native install steps. Pure JS, works with any bundler.

---

## 🧠 Overview

| Feature                          | Description                                                                                                                                                                                                                             |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Three lifecycle helpers**      | `signalUnknownCredential`, `signalAllAcceptedCredentials`, `signalCurrentUserDetails` — thin wrappers over `PublicKeyCredential.signal*` with base64url normalization built in.                                                         |
| **`syncAcceptedCredentials`**    | Convenience: fetches the authoritative accepted set via `authClient.passkey.listUserPasskeys()` and signals it in one call. The recommended entry point for post-login / add / delete flows.                                            |
| **No plugin wrapping**           | Doesn't touch `passkeyClient()`. You call these at your app's lifecycle join points — if better-auth ever ships this natively, your imports keep working and you delete the calls.                                                      |
| **Per-method feature detection** | Safari has historically shipped these methods one at a time; each helper feature-detects independently and returns `{ signaled: false, reason: 'unsupported' }` when the browser lacks it.                                              |
| **iOS 26 bug guard**             | `signalAllAcceptedCredentials` refuses empty lists by default. Empty = "delete every passkey for this user" on the device, which triggers the Apple Passwords cross-account deletion bug. Opt in with `allowEmpty: true` when intended. |
| **Base64url normalization**      | Server user ids (cuid, ulid, uuid) get UTF-8 → base64url automatically; already-base64url values pass through untouched.                                                                                                                |
| **Cross-platform API parity**    | Identical function signatures to the [React Native companion](https://github.com/Gautham495/react-native-nitro-better-auth-passkey), so cross-platform apps share lifecycle code verbatim.                                              |

---

## ⚙️ Usage

This package doesn't wrap `passkeyClient()`. You call three functions at the right moments in your app.

### After the server rejects a passkey at sign-in

```ts
import { signalUnknownCredential } from "better-auth-passkey-lifecycle";

const { data, error } = await authClient.signIn.passkey();
if (error && (error.status === 404 || error.code === "CREDENTIAL_NOT_FOUND")) {
  // The passkey the user just picked no longer exists server-side.
  // Tell the browser so it stops offering it.
  await signalUnknownCredential({
    rpId: "auth.example.com",
    credentialId, // the id from the failed assertion
  });
}
```

Safe to call when the user is not authenticated — it names exactly one credential id and reveals nothing else.

### After a successful login / add / delete

```ts
import { syncAcceptedCredentials } from "better-auth-passkey-lifecycle";

// After login:
const { data } = await authClient.signIn.passkey();
if (data?.user) {
  await syncAcceptedCredentials(authClient, {
    rpId: "auth.example.com",
    userId: data.user.id,
  });
}

// After the user deletes a passkey:
await authClient.passkey.deletePasskey({ id });
await syncAcceptedCredentials(authClient, { rpId, userId });

// After the user adds a passkey:
await authClient.passkey.addPasskey({ name });
await syncAcceptedCredentials(authClient, { rpId, userId });
```

`syncAcceptedCredentials` calls `authClient.passkey.listUserPasskeys()`, then hands the resulting id list to `PublicKeyCredential.signalAllAcceptedCredentials`. Anything on the device outside that list gets hidden (Chrome / GPM) or deleted (iOS Passwords app).

### After renaming a passkey

```ts
import { signalCurrentUserDetails } from "better-auth-passkey-lifecycle";

await authClient.passkey.updatePasskey({ id, name: "MacBook Pro" });
await signalCurrentUserDetails({
  rpId: "auth.example.com",
  userId: session.user.id,
  name: session.user.email,
  displayName: session.user.name,
});
```

---

## 🧩 API Reference

```ts
signalUnknownCredential(input: {
  rpId: string
  credentialId: string                 // base64url
}): Promise<SignalResult>

signalAllAcceptedCredentials(input: {
  rpId: string
  userId: string                       // server user id — auto-normalized to base64url
  allAcceptedCredentialIds: string[]   // base64url
  allowEmpty?: boolean                 // default false — refuses empty lists as a safety guard
}): Promise<SignalResult>

signalCurrentUserDetails(input: {
  rpId: string
  userId: string                       // server user id — auto-normalized to base64url
  name: string
  displayName: string
}): Promise<SignalResult>

syncAcceptedCredentials(
  authClient: AuthClientWithPasskey,
  options: {
    rpId: string
    userId: string
    allowEmpty?: boolean
  }
): Promise<SignalResult>

type SignalResult =
  | { signaled: true }
  | { signaled: false; reason: 'unsupported' }
```

`syncAcceptedCredentials` is the recommended entry point for post-login / add / delete. Best-effort: returns `{ signaled: false }` on browser unsupport, on empty lists (unless `allowEmpty: true`), or when the `listUserPasskeys` request itself fails. Never throws for those reasons.

### What each function does

| Function                       | Scoped by                | Auth required | Effect                                    |
| ------------------------------ | ------------------------ | ------------- | ----------------------------------------- |
| `signalUnknownCredential`      | rpId + one credential id | no            | Hides / removes that one credential       |
| `signalAllAcceptedCredentials` | rpId + user handle       | yes           | Prunes anything outside the accepted list |
| `signalCurrentUserDetails`     | rpId + user handle       | yes           | Updates the username / display label      |

All three are best-effort. The browser API returns nothing about what the authenticator did — that's a spec decision, not a bug. On browsers without Signal API support, every function is a silent no-op that returns `{ signaled: false, reason: 'unsupported' }`.

### Utility exports

```ts
isBase64Url(s: string): boolean
b64urlEncodeUtf8(input: string): string
normalizeUserHandle(raw: string): string

hasWebAuthn(): boolean
supportsSignalUnknownCredential(): boolean
supportsSignalAllAcceptedCredentials(): boolean
supportsSignalCurrentUserDetails(): boolean
```

Use the `supports*` helpers if you want to conditionally render UI (e.g. show a "your device will remember this deletion" hint only when supported).

---

## 🍎 iOS 26 caveat — read this

Between iOS/macOS 26.0.1 and at least 26.6.1, the two **credential-removing** signal methods (`signalUnknownCredential` and `signalAllAcceptedCredentials`) have a bug: calling them for one account can also delete the passkey of an **unrelated account on the same RP ID**, when that other account is stored as a combined password + passkey entry in the Apple Passwords app (a state that only arises when the password was saved via the iOS system save prompt).

Full writeup by Corbado: <https://www.corbado.com/blog/signal-api-ios-passkey-deletion-bug>

Practical implications:

- **The bug is triggered by deletions, not by calls.** If the id list you send matches what the device holds, nothing is removed and no other account is touched. Calling `syncAcceptedCredentials` after every login is safe as long as the list is correct.
- **An empty accepted list is a deletion** and unsafe. `syncAcceptedCredentials` refuses to send an empty list by default; pass `{ allowEmpty: true }` only when the user genuinely has zero passkeys left.
- **`signalCurrentUserDetails` is not affected.** Use it freely.
- **Not doing the sync is worse than doing it.** Stale passkeys that fail at login hurt more users, far more often, than the cross-account bug does.

---

## 🚦 Browser support

| Browser            | Support                                                                                                                      |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------- |
| **Chromium 132+**  | ✅ Full support — Chrome, Edge, Arc, Brave. On by default since Jan 2025.                                                    |
| **Safari 26+**     | ⚠️ Supported but subject to the iOS/macOS 26 removal bug above. `signalCurrentUserDetails` is safe.                          |
| **Firefox**        | ❌ Not supported at time of writing. All helpers no-op silently.                                                             |
| **Older browsers** | ❌ Silent no-op. Feature detection is per-method — if Safari ships one method but not another, we handle each independently. |

---

## 🛠️ RP ID gotchas

- Must **exactly match** your better-auth server's `rpID` config.
- No scheme, no port, no trailing slash. Just `example.com`.
- `localhost` works in dev, but the OS credential managers largely ignore signals there — test with a real domain.

---

## 🔤 Base64URL

- `credentialID` from `listUserPasskeys()` is **already base64url** — pass it through.
- `userId` is your server's opaque user id — this library base64url-encodes UTF-8 automatically. If your `user.id` is already base64url (or a hex string), pass it as-is; the encoding is idempotent.
- If your server puts something weird in `user.id` (a JSON blob, a signed token), that's what gets encoded and signaled. Match your server's WebAuthn user handle exactly.

---

## 🏗️ Design

- **No plugin wrapping.** Three imperative helpers you call at lifecycle join points. Keeps the surface small and lets you skip the signal on flows where it isn't wanted (e.g. an admin-side delete of another user's passkey).
- **`SignalResult` return type** so callers can distinguish "browser didn't support it" from a thrown error. Errors from the underlying API (invalid base64url, security errors) still throw — those are real and shouldn't be swallowed.
- **Structural `AuthClientWithPasskey` type** — no hard import of `@better-auth/passkey`, so consumers on older versions or custom clients still work.
- **Zero runtime dependencies.**

---

## 🤝 Contributing

PRs welcome — especially browser compatibility fixes and better error-shape detection for server-side "credential not found" responses.

- [Sending a PR](CONTRIBUTING.md)
- [Code of Conduct](CODE_OF_CONDUCT.md)

---

## 🪪 License

MIT © [**Gautham Vijayan**](https://gauthamvijay.com)

---

Made with ❤️ + [**WebAuthn Signal API**](https://developer.chrome.com/docs/identity/webauthn-signal-api) + [**better-auth**](https://better-auth.com)
