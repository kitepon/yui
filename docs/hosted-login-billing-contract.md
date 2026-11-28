# Hosted login and billing: function and data-flow contract (target)

Scope: hosted 結 (Yui) on the shared login/billing library (0.26.0, contract 1.63), option B (Owner 2026-11-28). Self-hosted is unchanged and library-free.
Status: TARGET. Not built. `docs/billing-function-dataflow.md` describes the Stripe code that this replaces; it is retired in the change that removes that code. Plan and reasons: the adoption plan in the Yui lead's docs (docs/yui-login-billing-adoption-plan-20261128.md, "plan" below). Reviewed by Mint (login/billing part).
Source of truth for structure; the code follows it.

## 1. Overall

| Connection | Direction | Contract |
|---|---|---|
| iPhone / iPad / Mac app, Android app | in | signed requests (device key) to the hosted API; paid date `POST /api/home/paid-until`; claim `POST /api/claim`; link code `POST /api/alexa/link-code`; entry deletion by the library calls |
| Browser (hosted Web) | in | browser child: the page signs in itself (Google popup / Sign in with Apple JS popup; Google Web client with JS origin and redirect https://yuihome.kitepon.dev/login, Apple Services ID `dev.kitepon.yuihome.web`), makes the lbw1 QR, and sends signed requests with a browser-held key; no purchase; no paid-date request. The server mounts `keys/*` (start, accept, admit, others, leave, me) and allows the `Login-Billing-Key` header in CORS for that origin only |
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
| `onKeyholeEvent` | entry merge / emptied | `{type:"joined", from, into}`; "entry emptied" (one event with no reason, whatever emptied it) | in one transaction: `joined` re-keys `homes.owner_user_id`, `alexa_tokens.user_id`, `link_codes.entry_id` from `from` to `into`; if `into` already has a home, the home of `from` is deleted. `emptied` deletes the home of that entry. Deleting = home (history cascades), Alexa tokens and codes, link codes, and a tombstone row (random id + date) in `deleted_users`. No waiting period (Miranda 2026-11-28): nobody can reach such a home, so holding it would be holding it just in case. The app says so before the last device leaves |
| `statePaidUntil` (route) | the only writer of the date | owner key from `resolveOwner` (any key of the entry), date | `homes.paid_until = max(stored, stated)`; rejects a date more than 13 months ahead or not a number: 400; no home: 404 |
| `homePaid(home, now)` | the only reader of the date | home row | paid iff `paid_until + 7 days > now`. Used by the home routes (write gate), Alexa Smart Home and custom, the runner. Self-hosted: not called |
| `claimLegacyHome` (route) | move one legacy home | request signed with the new key; body proof: Apple identity token, Google ID token, or e-mail + password; the entry id. The Google ID token is one the app requests for the hosted Web client of project yui-hosted (its id is the app's serverClientId); the legacy sign-in client cannot issue tokens to the apps, because the apps' package and certificate pairs live only in yui-hosted | verifies the proof against the legacy `account`: Apple by Apple's keys with the bundle id as audience; Google by Google's keys with the yui-hosted Web client as audience, then the legacy `account` row of provider google whose account id equals the token's `sub` (Google's account id, the same in every project); in one transaction sets `homes.owner_user_id` and `alexa_tokens.user_id` to the entry id, deletes the legacy `user`, `account`, `session`, `apple_login_tokens` rows, adds the legacy id to `deleted_users`; revokes the Apple refresh token at Apple as account deletion does today. Fails whole: 401 bad proof, 409 already claimed or entry already has a home |
| `endClaimWindow` (code, runs on the fixed end date) | window end | date | deletes every legacy `user` with its home and Alexa rows (tombstones as above); empties `billing_customers`, `billing_purchase_attempts`, `apple_subscriptions`, `apple_billing_accounts`, `apple_deleted_transactions`, `apple_notification_events`, `stripe_webhook_events`, `verification`; then `wal_checkpoint(TRUNCATE)` and `VACUUM` so no freed page keeps the bytes. No unclaimed home survives it |
| `purgeUnusedHomes` + `purgeTombstones` (runner step) | the home nobody reaches (a lost only-phone leaves a key, so the entry never empties) | `homes.last_used_at` (a date only, set by any signed request to the home, at most once a day; `statePaidUntil` sets it too), `homes.paid_until` | deletes a home with `last_used_at` (or creation) older than 180 days and no paid date ahead (a date still ahead, grace included, counts as in use). Tombstones older than 2 days are deleted (a restore of a backup written before a deletion must not bring the home back; the backup is rewritten hourly). The person loses the home content (names, rooms, scenes, automations, device vendor keys) |
| `makeLinkCode` (route) | Alexa linking code | owner key | 8-character one-use code, stored hashed with entry id and expiry (10 minutes); rate-limited per entry (5 per hour) and globally |
| `consumeLinkCode` (linking page) | finish OAuth | code, OAuth params | on success writes the Alexa token row under the entry id and redirects to Alexa; wrong, expired or used code: 400, no detail; global rate limit |
| `deleteAccountData` (route) | delete the data of an entry at once | signed request, owner key from `resolveOwner` (the entry) | deletes the home, vendor keys, Alexa rows, link codes and history of that entry in one transaction; 404 if none. Called first by account deletion |
| Deletion help page (Web, public, no login) | the deletion URL Google Play asks for | none | `/delete-account` states how to delete the account from the app, what is deleted at once, and that a home nobody reaches is deleted after 180 days. It never redirects to the login page; Cielo gives the URL to Play |
| Account deletion (app, in order) | delete an entry | the app on the deleting phone | 1. `deleteAccountData` (signed Yui route); 2. `keys/others` (library, removes every other key); 3. `leave` (own key); 4. delete the device key and `signOutLocal`. The entry then empties; `onKeyholeEvent` finds no home and does nothing. If step 1 fails the order stops and the person can retry; if a later step fails, the data is already gone and the entry is an empty shell the person may retry |
| Export (route) | data export | owner key | home JSON without vendor secrets |
| App: `reportPaidUntil` | state the date | iPhone/iPad/Mac: the real expiry of its own StoreKit transaction; Android: `ownPurchases()` lists `dev.kitepon.yuihome.hosted` (one product, two base plans) but gives no end, so the app states now + 31 days (the library's `googleDays`) and restates it at each run; exempt (`freeAccounts`): 13 months ahead | signed request to `statePaidUntil`; at launch, at foreground, after purchase or restore, and background refresh (iOS background task, Android daily WorkManager). A cancelled Android subscription therefore lapses within about 31 days plus the 7 days of grace. Accepted limit (Yui coordinator, 2026-11-28): the device cannot see the base plan (Mint, v0.26.0), so an annual payer whose daily refresh never runs (the app force-stopped) and who does not open the app for 38 days drops to read-only until the next run restates the date |

Removed with this change: Stripe (checkout, portal, webhook, customers, attempts, trial rule, 12条の6 panel), `loadEntitlement`, `YUI_BILLING_EXEMPT`, Apple server notifications and `apple_*` rows, `hosted-metrics` Stripe reader. Kept for self-hosted: Better Auth, e-mail + password, `billingConfigured()` seam (false).

## 3. Data flows

1. **Sign-in and admission.** Device signs in with Apple (Google on Android) itself; the token never reaches Yui. The library makes the entry and the device key. A child (iPad, Mac, browser) is admitted by the parent phone through a QR or a tappable join link; the parent sends the admission. Yui learns only keyholes.
2. **Paid date.** App → store (device) → signed request → `statePaidUntil` → `homes.paid_until`. Alexa and the runner read it through `homePaid`. Nothing flows back to a store.
3. **Claim.** App (new key) + legacy proof → `claimLegacyHome` → legacy rows deleted, home re-keyed.
4. **Alexa link.** App `makeLinkCode` → person types it on the linking page → `consumeLinkCode` → Alexa token row under the entry id.
5. **Merge / empty / delete.** library event → `onKeyholeEvent` → re-key, or delete. Account deletion: app → `deleteAccountData` (data gone at once) → library `keys/others` → `leave` → device key deleted. An emptied entry by any other cause (last device left) deletes the home at once, after the app has said so. A home nobody reaches: `purgeUnusedHomes` after 180 days.
6. **Self-hosted.** Request → Better Auth → `resolveOwner` → home routes; no `homePaid` call.

## 4. Data ownership

| Data | Owner | Notes |
|---|---|---|
| keyholes (entry id, public key and role per key) | library, stored by `SqliteKeyholeStore` | no account, e-mail or store id |
| `homes` (+ `paid_until`, `last_used_at`), `alexa_tokens`, `link_codes`, history | Yui | keyed by owner key (entry id on hosted, user id on self-hosted) |
| legacy Better Auth rows and the emptied billing tables | Yui, hosted only until the window ends plus the claim | none remains after the window (Mint: no legacy subject, e-mail or token); the freed pages are overwritten by `VACUUM`, and `secure_delete` is on for every connection |
| tombstone (`deleted_users`: random id + date) | Yui | kept 2 days only, for a backup restore |
| backup object (R2) | Yui | `home-backup.ts` stops dumping the emptied tables; the first object written after the window end is the evidence |
| store accounts, transactions, contracts | the stores and the device | never on the server |
| `freeAccounts` hashes | the apps | the server cannot see them |

## 5. Failure handling

- Bad signature or unknown key: 401. A date from a key not in the home's entry: 403.
- A stale phone: its date lapses; after 7 days the home is read-only (Alexa answers subscription required; the runner skips). Reading and data are never removed by this.
- A refund or cancellation is seen only when the date runs out (stated limit; the server cannot see a store).
- Claim fails whole and can be retried. A second claim of the same legacy user: 409 (already deleted).
- Self-hosted: no step above applies; the library is not loaded.
