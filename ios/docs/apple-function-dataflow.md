# Yui Apple app (ios/): function and data-flow diagram (target)

Module: `docs/architecture/modules/apple-app/module.json`. Overall contract: `docs/hosted-login-billing-contract.md` (section numbers below are its). Library: login-billing Swift part, tag v0.28.0 exact (SwiftPM, product `LoginBilling`).
Status: TARGET. The code at main (Better Auth bearer token, server billing, `ApplePurchaseRecovery`) is replaced by this; this file is the source of truth for the change and is updated before the code.
Scope: one app (iPhone, iPad, Mac Catalyst), hosted origin `https://yuihome.kitepon.dev` only. Self-hosters use the Web UI. No secret in the build beyond what the library needs (Services ID, bundle id, Google iOS client id are public identifiers).

## 1. Connections

| Connection | Direction | Contract |
|---|---|---|
| Hosted API (home, devices, rooms, scenes, automations) | out | every call carries `Login-Billing-Key` (library `KeyholeClient.header`); 401 `time_off`: `useServerTime(now)`, sign again once; other 401: the device is signed out of this entry |
| `keys/*` (start, accept, admit, others, leave) | out | only through `KeyholeClient` (library) |
| `POST /api/home/paid-until` | out | `{"paidUntil": ms}` → 200 `{"paidUntil": ms or null}`; 400 bad date / too far; 404 no home |
| `POST /api/claim` | out | `{"method":"apple"\|"google","idToken","nonce"}` or `{"method":"password","email","password"}`; 200 ok; 401 proof; 404 closed or no legacy home; 409 |
| `POST /api/alexa/link-code` | out | → `{"code","expiresInSeconds":600}`; 429 |
| `DELETE /api/account-data` | out | 200 deleted; 404 no home (continue) |
| `GET /api/account-data` | out | home JSON (shape of `GET /api/home`, no vendor secrets) → shared as a file |
| Apple (ASAuthorization, StoreKit, App Store) | on device | sign-in token never leaves the library; store data is read on the device only |
| Google (ID token for the claim only) | on device | `TeamProof.google(clientId: yui-hosted iOS client, anchor:)`; the token goes to `/api/claim` and nowhere else |
| Another device on the same network | peer | the library's local form (lbq4/lbw1/lbr1), Network.framework; Mac only shows a QR (no camera, never answers) |
| Join link | in | `applinks:login-billing.kitepon.dev` → `onOpenURL` → library `isLibraryQR` / `answer` / `take` |

## 2. Functions (new or changed)

| Function | Job | Input / owner | Output / connection |
|---|---|---|---|
| `Hosted` (new) and `SessionStore.phase` | `Hosted` is the only holder of `DeviceKeys`, `KeyholeClient`, `LocalForm`; `phase` is signedOut, choosing (signed in, the server knows no key of this device: start or join), claiming (just started: the legacy claim is offered before the first home is made), ready | library | `signInWithApple()`, `startHere()` (keys/start), `joined(add)`, `signOut()`; a 401 from any home call returns to `choosing` |
| Join, wanting device | iPad/Mac/second device joins an entry | `makeRequest(provider:"apple")` → show `qr` and `code`; `awaitOutcome()`; `sendAdd` | joined or refused outcome shown in words (`LocalWords.ja`) |
| Join, answering device | iPhone/iPad admits a child | `QRScannerView` (iOS/iPadOS), pasted or opened text → `isLibraryQR` → `answer(qr:confirm:)`; `lbr1` → `take` | `.sent / .noPurchase / .declined / .returnLink`; the confirm screen names the role |
| `YuiClient.send` (changed) | the only place a request is signed | `KeyholeClient.header(method:url:body:)` | replaces the Bearer token; retry once on `time_off` |
| `SessionStore.reportPaidUntil` + `PaidUntil.ownEnd` (new) | the only writer of the date from this device | the latest `expirationDate` of StoreKit's verified, unrevoked current entitlements of the two product ids (StoreKit's own verification; the library's `verifyAppleTransaction` is not used because it refuses a local or Xcode-signed transaction and needs Apple's root); a renewal is finished here, a purchase by `purchaseLocal`; exempt (`freeAccounts` of the form, `form.paidUntil().store == "free"`): now + 390 days; no entitlement: nothing is sent, only the check time is kept | `POST /api/home/paid-until`. Runs at launch, foreground, after purchase or restore, and on `Transaction.updates`. Mac: launch and foreground only (7 days of grace cover it). iPhone/iPad background refresh (`BGAppRefreshTask`): not built yet |
| `Subscribe` (changed) | buy the plan | `purchaseLocal(productId)` (library finishes the transaction; the app never finishes) with the two existing product ids `dev.kitepon.yuihome.subscription.monthly` and `.annual` | then `PaidUntilReporter`; `Product.products(for:)` is read for price and intro-offer text only |
| Restore | restore purchases | `AppStore.sync()` then `ownPurchases()` | `PaidUntilReporter` |
| Claim screen (new), shown once in `claiming` | move a legacy home | a proof from the person: Apple (`TeamProof.apple`), Google (`TeamProof.google` with the yui-hosted iOS client), or e-mail + password; the provider token carries a nonce the app made | `POST /api/claim`; 401 / 404 / 409 each shown as its own sentence; failure is whole and can be retried; "start new" goes on without a claim |
| Alexa link code screen (new) | show the 8-character code | `POST /api/alexa/link-code` | code + 10-minute expiry + 429 sentence |
| Delete account (new) | contract section 2 order | 1 `DELETE /api/account-data` (stop on failure, retry allowed; 404 continues); 2 `signOutOthers()`; 3 `leave()`; 4 library deletes the key, `signOutLocal()` | the screen says, before the last device leaves, that the home is deleted at once |
| Export (new) | data export | `GET /api/account-data` | share sheet with the JSON file |
| Plan line (new) | "plan last checked" | the stored date's source: the last `PaidUntilReporter` result (date and when) | one line in Settings: paid until, last checked, 7-day grace |

Removed with this change: `GoogleSignIn.swift` and `AppleSignIn.swift` (server-mediated), e-mail/password sign-in and sign-up screens, `Keychain` bearer token, `ApplePurchaseRecovery`, server-made purchase attempts, `appAccountToken` flow, `billingStatus`, `AppleBillingAccount`, `registerAppleTransaction`. `Yui.storekit` and the billing tests are rewritten for `purchaseLocal`.

## 3. Data flows

1. **Start / sign in.** Apple sheet → library → entry id + device key (Keychain, this device only) → `keys/start`. Yui learns only the keyhole.
2. **Join.** Child shows QR/code → parent answers over the local network → `sendAdd` → `keys/accept`. A browser child's lbw1 is answered by the iPhone/iPad (`admit`).
3. **Home calls.** Every call signed with `Login-Billing-Key`; the owner key is resolved on the server.
4. **Paid date.** Device StoreKit → library proof check → max date → `/api/home/paid-until`. Nothing flows back to a store.
5. **Claim.** New entry first (flow 1), then the legacy proof → `/api/claim`.
6. **Delete.** `account-data` delete → `keys/others` → `keys/leave` → key deleted.

## 4. Data ownership on the device

| Data | Owner | Notes |
|---|---|---|
| device key, local record | library (`DeviceKeys`, `KeychainPassStore`) | Keychain, this device only, not synchronizable |
| paid date and the time it was checked | `PaidUntilReporter` (UserDefaults, a date only) | for the plan line only; the server's date decides |
| home snapshot | `HomeStore` (the rest of `SessionStore`) | memory only |
| Google ID token, Apple identity token | the claim screen | lives for one call; never stored or logged |
| e-mail + password for the claim | the claim screen | lives for one call |

## 5. Failure handling

- Bad or unknown key (401): the app shows signed-out and offers start or join; it deletes nothing.
- `time_off`: one re-sign; a second failure is shown as a clock error.
- Date from a stale phone lapses; after 7 days the home is read-only on the server (the app shows the plan line and a subscribe button; reading is never blocked by the app).
- A refund or cancel is seen only when the date runs out (the stated limit of the contract).
- The local network is denied: `local_network_denied` is shown with `LocalWords.ja` and a Settings button.
- A library `LoginBillingError` is shown by its code; no token, subject, e-mail or name is logged.
