# Hosted Yui apps: seats, scope, done and release (current state)

Owner of this file: the Yui coordinator (Little Mermaid, bot-f39f4ec8). The function and data-flow contract is [hosted-login-billing-contract.md](hosted-login-billing-contract.md); this file says who builds what against it, what "done" means for each app, and how one release goes out. Module owners: `docs/architecture/modules/*/module.json` (main).

## Seats

| Seat | Module / scope | How the others reach it |
|---|---|---|
| Little Mermaid (bot-f39f4ec8), Yui coordinator | server-web: server, Web, deploy, contract, acceptance, main integration | direct message |
| E.H. (bot-8b40a260), Apple app | apple-app: `ios/` (iPhone, iPad, Mac Catalyst), builds on the Mac | call bridge or message |
| Crow (bot-6f2e478f), Android app | android-app: `android/` (.NET 10, MAUI, Android only) | message |

Outside Yui, always through the coordinator unless noted:

| Seat | What Yui asks of it |
|---|---|
| Mint (bot-137fd092) | login-billing library: API, version, rulings that an integration matches the library contract. Members' library questions go to the coordinator, who forwards them |
| Sakura (bot-a5022c62) | signing keys (Android upload key), read-only credential for the private library repo in CI; members may ask Sakura directly |
| Sky (bot-b4eca144) | App Store Connect: App ID capabilities, profiles, review submission on the coordinator's instruction |
| Cielo (bot-f6778e72) | Play Console: listing, products, tracks, testers, release on the coordinator's instruction |
| Pinocchio (bot-5412a772) | Google Cloud project yui-hosted: OAuth clients |

Acceptance: the coordinator accepts that an app does what Yui needs against the contract and this file. Mint rules separately that the library integration matches the library contract. Both are needed before a release.

## Common to both apps

- Origin is fixed: `https://yuihome.kitepon.dev` (hosted only; self-hosters use the Web UI). Keyholes base URL `https://yuihome.kitepon.dev/api/`.
- One login-billing version for both apps and the server in a release. Now: **v0.28.0** (Swift: SwiftPM tag v0.28.0; .NET: Kitepon.LoginBilling.Android 0.28.0, sha256 5d2734010401861d9c0e64231fc677fc0da91f65d0d8fd524d85d86819aa593c). A version change is the coordinator's ruling, for all three at once.
- Ids: bundle / package `dev.kitepon.yuihome`, Team TPWX489GV4, Services ID `dev.kitepon.yuihome.web`, Play product `dev.kitepon.yuihome.hosted` (base plans monthly P1M JPY 100, annual P1Y JPY 1,000, 7-day grace). Google (project yui-hosted): Web `916284233737-d1526ubmm33ba181rsk68vk91jk3248c.apps.googleusercontent.com`, iOS `916284233737-09v748ukr3f48v56fgfqj8et7kgqt15d.apps.googleusercontent.com`.
- Join link: `https://login-billing.kitepon.dev/join/dev.kitepon.yuihome` (AASA and assetlinks are Mint's site).
- Server calls carry the library's Login-Billing-Key header. 401 `{"error":"unauthorized"}` no or bad key (time_off is retried by the library); 404 hosted switch off.
  - `POST /api/home/paid-until` `{"paidUntil": <epoch ms>}` → 200 `{"paidUntil": <stored ms or null>}`; 400 `bad date` / `date too far ahead` (beyond now + 396 days). Paid while stored + 7 days > now.
  - `POST /api/claim` `{"method":"apple"|"google","idToken","nonce"}` or `{"method":"password","email","password"}` → 200 `{"ok":true}`; 401 proof failed; 404 window closed or no legacy home; 409 entry already has a home. Google tokens are for a yui-hosted client (Android: the Web client as serverClientId; Apple: the iOS client).
  - `POST /api/alexa/link-code` → 200 `{"code","expiresInSeconds":600}`; 429 too many.
  - `DELETE /api/account-data` → 200 `{"deleted":true}`; 404 `{"deleted":false}` no home (continue the deletion order).
  - `GET /api/account-data` → the home JSON as `GET /api/home`, without vendor secrets.
- Accepted limits: Android states now + 31 days each run because the device cannot see the base plan; a Mac restates only at launch and foreground. An app kept closed past its date plus 7 days drops to read-only until it runs again.
- Last device leaving deletes the home at once: the apps warn unconditionally ("if this is your only device…"). A lost only phone cannot get its home back; the home is deleted by the 180-day purge.

## Apple app (E.H.)

Scope: the library's Swift part (Sign in with Apple, device key, start, QR as parent and child, awaitOutcome, signed requests), StoreKit read and the paid-date request (expirationDate of Transaction.currentEntitlements or StoreProof.until; no grace added), freeAccounts, the claim screens (TeamProof.apple / TeamProof.google with the iOS client), the Alexa link-code screen, the "plan last checked" line, background refresh on iOS (launch and foreground only on Mac), account deletion and export, Associated Domains `applinks:login-billing.kitepon.dev`. An iPad or Mac starts its own entry; a Mac joins others only by showing a QR. The server-made purchase attempt and appAccountToken are removed.

Done (what t32 proves without store signing): a PR from the ios branch into `hosted-library-adoption` that builds Release for iPhone and Mac Catalyst against login-billing v0.28.0, passes the app's unit tests, and runs on the simulator against the coordinator's staging server (t37): sign in with Apple, start, state the paid date, link code, export, the deletion order. Outside t32: a real device, a Sandbox purchase, TestFlight upload (release steps below).

## Android app (Crow)

Scope v1: Google sign-in through the library, device key and signed requests, Play purchase and restore with reportPaidUntil (launch, foreground, after purchase, daily WorkManager), home control (rooms, devices, control, scene play, sync, automation on/off), vendor credential entry, admitting another device (QR scan and join link), claim of a legacy home (Google ID token from Credential Manager for the Web client, or e-mail + password), Alexa link code, export, account deletion, sign out, manage-subscription link. Later: scene and automation editors, groups, room management, analysis. Play = null in LocalConfig (no licence key). No own BillingClient; the library acknowledges purchases. Device key not backed up (allowBackup=false); the app says a new phone needs sign-in again or admission.

Done (what t33 proves without store signing): a PR from `android-app` into `hosted-library-adoption` that builds a debug and an unsigned release AAB against Kitepon.LoginBilling.Android 0.28.0, passes the app's tests, and runs on an emulator with Play services against the staging server (t37): Google sign-in, start, home control, state the paid date, link code, export, the deletion order. Outside t33: a real device, a test purchase with a licence tester, signing and the Play upload (release steps below).

## One release

Server, Apple app and Android app ship together on one login-billing version (and with the Stripe removal). Steps and their seats:

1. Server: the coordinator deploys with the Owner's approval of the window.
2. Apple: E.H. archives and signs with the manual "Yui App Store" profile and uploads to App Store Connect (TestFlight). Sky submits for review on the coordinator's instruction.
3. Android: Crow builds the unsigned release AAB. Sakura signs it with the upload key. Cielo uploads it to the internal track, and to production on the coordinator's instruction.
4. Owner: approves the release (Approval Box) after the coordinator's acceptance and Mint's ruling.
