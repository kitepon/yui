# Home key: function and data-flow contract

Scope: the key that encrypts the device credentials of every home (`homes.credentials_enc`) and the stored Apple login refresh tokens (`apple_login_tokens.refresh_token_enc`). Owner rule 2026-11-28: no key leaves the BellTeam authentication module; the module uses keys itself. Self-hosted Yui is unchanged: with `YUI_AUTH_SOCK` unset the key is `HOME_SECRETS_KEY` from the environment.

## Connections
| Connection | Direction | Contract |
|---|---|---|
| Authentication module, caller socket `callers/yuihome` (mounted read-only at `/auth`) | out | one JSON line each way: `wrap` / `unwrap` of item `wrapkey yui-home`, `aad` text. The module's master key never leaves it |
| SQLite `home_key` (one row) | in/out | `wrapped` blob, `aad`, `rotated_at`. Written only with the re-encryption it belongs to |
| Environment | in | `YUI_AUTH_SOCK` (socket path), `YUI_ROTATE_HOME_KEY=1` (one start, by hand, at the release), `HOME_SECRETS_KEY` (the old key: used only to rotate, and as the fallback until it is removed) |

## Functions
| Function | Job | Input | Output |
|---|---|---|---|
| `initHomeSecrets` (home-secrets.ts) | decide the key at server start, before the first request and the first tick (Nitro plugin awaits it) | environment, `home_key` row | `"env"` (no socket, or the module failed and `HOME_SECRETS_KEY` is present: warning logged), `"module"` (key unwrapped into memory), `"rotated"` |
| `unwrapHomeKey` / `wrapHomeKey` (auth-module.ts) | the two socket calls | socket, blob or key text, aad | key text / blob |
| `rotateHomeKey` (home-key.ts) | replace the key | old key, a `wrap` function | new random 32-byte key in memory; wraps the new key first (failure changes nothing); then one transaction re-encrypts every home and Apple token and stores the new blob; any failure rolls back whole |
| `secretsKeyFromEnv` | the one reader of the key for every encrypt/decrypt | in-memory key, else `HOME_SECRETS_KEY` | 32-byte Buffer |

## Data flow
1. Start: `home_key` row → module `unwrap` → key in process memory only. No row and no rotation flag: the environment key (transition), or the start fails if there is none.
2. Rotation (once, at the release): old key from `HOME_SECRETS_KEY` → new random key → module `wrap` (aad `yuihome:home-secrets-v2`) → one transaction: re-encrypt, store blob → new key in memory → the backup object is pushed at once (it is encrypted under the home key). Only the new key is ever wrapped. The old value, which was printed once into a session log, is worthless afterwards.
3. After the rotation the flag is ignored (a row exists), and `HOME_SECRETS_KEY` is removed from the environment.

## Failure handling
- Module unreachable or refusing: the old key keeps working while `HOME_SECRETS_KEY` is present (warning in the log); with none, the start fails (nothing could be decrypted anyway).
- A value from the module that is not a 32-byte key is refused before it is kept.
- Running servers hold the key in memory: rotation is done only inside a start, before requests, so no process encrypts with the old key afterwards.
