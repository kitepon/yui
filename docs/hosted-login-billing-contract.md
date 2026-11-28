# Hosted login and billing: function and data-flow contract (target)

Scope: hosted 結 (Yui) on the shared login/billing library (0.26.0, contract 1.63), option B (Owner 2026-11-28). Self-hosted is unchanged and library-free.
Status: TARGET. Not built. `docs/billing-function-dataflow.md` describes the Stripe code that this replaces; it is retired in the change that removes that code. Plan and reasons: the adoption plan in the Yui lead's docs (docs/yui-login-billing-adoption-plan-20261128.md, "plan" below). Reviewed by Mint (login/billing part).
Source of truth for structure; the code follows it.

## 1. Overall

| Connection | Direction | Contract |
|---|---|---|
| iPhone / iPad / Mac app, Android app | in | signed requests (device key) to the hosted API; paid date `POST /api/home/paid-until`; claim `POST /api/claim`; link code `POST /api/alexa/link-code`; entry deletion by the library calls |
| Browser (hosted Web) | in | browser child: signed requests with a browser-held key; no purchase; no paid-date request |
| Library server part (`YUI_HOSTED=1` only) | in-process | `verify(request)` → { entry, key, role }; keyholes in Yui's own SQLite through a Yui-written `KeyholeStore`; `onEvent` for merges |
| Apple / Google | none from the server | the server never calls a store and keeps no account, transaction, receipt or contract id. Apps read their own store on the device |
| Alexa cloud | in | OAuth access tokens (hash → entry id); reads the home's paid date |
| 60-second runner | in-process | reads the home's paid date |
| Legacy login (Better Auth) | in, hosted only for the claim window | proofs used by `POST /api/claim` only |
| SQLite | in/out | see section 4 |
| Self-hosted build | n/a | `YUI_HOSTED` off: Better Auth cookie/bearer, e-mail + password, no billing check (`billingConfigured()` false), no library loaded |

## 2. Functions

| Function | Job | Input / owner | Output / connection |
|---|---|---|---|
| `resolveOwner(request)` | the only place that turns a request into an owner key | hosted: `verify(request)`; self-hosted: Better Auth session | owner key (entry id / user id) or null → 401. Replaces `requireUser` at every route |
| `SqliteKeyholeStore` | the library's storage interface in Yui's SQLite | library calls | `keyholes_*` tables; one transaction per call; safe for concurrent requests |
| `onKeyholeEvent` | entry merge / emptied | `{type:"joined", from, into}`; "entry emptied" (one event with no reason, whatever emptied it) | in one transaction re-keys `homes.owner_user_id`, `alexa_tokens.user_id`, `link_codes.entry_id` from `from` to `into`; if `into` already has a home the home of `from` becomes unclaimed (`homes.orphaned_at` = now); an emptied entry always means `orphaned_at` = now, never an immediate delete |
| `statePaidUntil` (route) | the only writer of the date | owner key from `resolveOwner` (any key of the entry), date | `homes.paid_until = max(stored, stated)`; rejects a date more than 13 months ahead or not a number: 400; no home: 404 |
| `homePaid(home, now)` | the only reader of the date | home row | paid iff `paid_until + 7 days > now`. Used by the home routes (write gate), Alexa Smart Home and custom, the runner. Self-hosted: not called |
| `claimLegacyHome` (route) | move one legacy home | request signed with the new key; body proof: Apple identity token, Google ID token, or e-mail + password; the entry id | verifies the proof against the legacy `account`; in one transaction sets `homes.owner_user_id` and `alexa_tokens.user_id` to the entry id, deletes the legacy `user`, `account`, `session`, `apple_login_tokens` rows, adds the legacy id to `deleted_users`; revokes the Apple refresh token at Apple as account deletion does today. Fails whole: 401 bad proof, 409 already claimed or entry already has a home |
| `endClaimWindow` (script, run by me) | window end | date | deletes every unclaimed legacy `user`/`account`/`session`/`apple_login_tokens` row; legacy ids to `deleted_users`; homes stay as unclaimed |
| `purgeOrphans` (runner step) | second period | `homes.orphaned_at + 30 days <= now` | deletes the home, its Alexa rows, history and link codes |
| `makeLinkCode` (route) | Alexa linking code | owner key | 8-character one-use code, stored hashed with entry id and expiry (10 minutes); rate-limited per entry (5 per hour) and globally |
| `consumeLinkCode` (linking page) | finish OAuth | code, OAuth params | on success writes the Alexa token row under the entry id and redirects to Alexa; wrong, expired or used code: 400, no detail; global rate limit |
| `deleteAccountData` (route) | delete the data of an entry at once | signed request, owner key from `resolveOwner` (the entry) | deletes the home, vendor keys, Alexa rows, link codes and history of that entry in one transaction; 404 if none. Called first by account deletion |
| Account deletion (app, in order) | delete an entry | the app on the deleting phone | 1. `deleteAccountData` (signed Yui route); 2. `keys/others` (library, removes every other key); 3. `leave` (own key); 4. delete the device key and `signOutLocal`. The entry then empties; `onKeyholeEvent` finds no home and does nothing. If step 1 fails the order stops and the person can retry; if a later step fails, the data is already gone and the entry is an empty shell the person may retry |
| Export (route) | data export | owner key | home JSON without vendor secrets |
| App: `reportPaidUntil` | state the date | app reads its own store (StoreKit / Play Billing) or `freeAccounts` | signed request to `statePaidUntil`; exempt: 13 months ahead; at launch, at foreground, after purchase or restore, and background refresh |

Removed with this change: Stripe (checkout, portal, webhook, customers, attempts, trial rule, 12条の6 panel), `loadEntitlement`, `YUI_BILLING_EXEMPT`, Apple server notifications and `apple_*` rows, `hosted-metrics` Stripe reader. Kept for self-hosted: Better Auth, e-mail + password, `billingConfigured()` seam (false).

## 3. Data flows

1. **Sign-in and admission.** Device signs in with Apple (Google on Android) itself; the token never reaches Yui. The library makes the entry and the device key. A child (iPad, Mac, browser) is admitted by the parent phone through a QR or a tappable join link; the parent sends the admission. Yui learns only keyholes.
2. **Paid date.** App → store (device) → signed request → `statePaidUntil` → `homes.paid_until`. Alexa and the runner read it through `homePaid`. Nothing flows back to a store.
3. **Claim.** App (new key) + legacy proof → `claimLegacyHome` → legacy rows deleted, home re-keyed.
4. **Alexa link.** App `makeLinkCode` → person types it on the linking page → `consumeLinkCode` → Alexa token row under the entry id.
5. **Merge / empty / delete.** library event → `onKeyholeEvent` → re-key or `orphaned_at`. Account deletion: app → `deleteAccountData` (data gone at once) → library `keys/others` → `leave` → device key deleted. An emptied entry by any other cause (last device left or signed out) → `orphaned_at`, purged after 30 days by `purgeOrphans`.
6. **Self-hosted.** Request → Better Auth → `resolveOwner` → home routes; no `homePaid` call.

## 4. Data ownership

| Data | Owner | Notes |
|---|---|---|
| keyholes (entry id, public key and role per key) | library, stored by `SqliteKeyholeStore` | no account, e-mail or store id |
| `homes` (+ `paid_until`, `orphaned_at`), `alexa_tokens`, `link_codes`, history | Yui | keyed by owner key (entry id on hosted, user id on self-hosted) |
| legacy Better Auth rows | Yui, hosted only until the window ends plus the claim | none remains after the window (Mint: no legacy subject, e-mail or token) |
| store accounts, transactions, contracts | the stores and the device | never on the server |
| `freeAccounts` hashes | the apps | the server cannot see them |

## 5. Failure handling

- Bad signature or unknown key: 401. A date from a key not in the home's entry: 403.
- A stale phone: its date lapses; after 7 days the home is read-only (Alexa answers subscription required; the runner skips). Reading and data are never removed by this.
- A refund or cancellation is seen only when the date runs out (stated limit; the server cannot see a store).
- Claim fails whole and can be retried. A second claim of the same legacy user: 409 (already deleted).
- Self-hosted: no step above applies; the library is not loaded.
