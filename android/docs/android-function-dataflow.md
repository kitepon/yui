# Yui Android app: function and data-flow diagram (target)

Scope: the Android app of hosted 結 (Yui), package `dev.kitepon.yuihome`, .NET 10 MAUI (Android only), minSdk 26, targetSdk 36. Owner of this file: the Android app role. The overall diagram and the server side are `docs/hosted-login-billing-contract.md` (target); this file is the app's own part and must agree with it.
Status: TARGET. Library: Kitepon.LoginBilling.Android 0.28.0 (private; android/scripts/fetch-library.sh). The library answers (Mint, 0.28.0) are settled below.
First version (v1): sign-in, home control, vendor credentials, paid date, admit another device, claim, Alexa link code, export, account deletion. Later (v2): scene and automation editors, device groups, room management, analysis. The app points only at `https://yuihome.kitepon.dev` and carries no secret in the build beyond what the library needs.

## 1. Connections

| Connection | Direction | Contract |
|---|---|---|
| Yui hosted API (`https://yuihome.kitepon.dev`) | out | signed requests (device key): `GET/POST /api/home` (ops: control, scene, sync, credentials, automation-toggle), `POST /api/home/paid-until`, `POST /api/claim`, `POST /api/alexa/link-code`, account-data delete and export routes (names per the contract, section 2) |
| Shared login/billing library, Android part (0.28.0) | in-process | namespace `Kitepon.LoginBilling`: `LocalForm` (Play = null: this phone checks its own store only; `SignInLocalAsync(activity,"google")`, `KeptSignIn`, `SignOutLocal`, `OwnPurchasesAsync`, `ProductDetailsAsync`, `PurchaseAsync` (acknowledges), `MakeRequestAsync`/`LocalRequest`, `IsLibraryQR`, `AnswerAsync`, `TakeAsync`) and `Keyholes(baseUrl=https://yuihome.kitepon.dev/api/, appId=dev.kitepon.yuihome)` (`StartAsync`, `SendAddAsync`, `SignOutOthersAsync`, `LeaveAsync`, `DeleteKey`, `Header(method,url,body)`, `UseServerTime`). Both use the storage name default so they share one device key. Failures: `LoginBillingException(Code, Status)`. The app has no Play Billing code of its own |
| Google Credential Manager | out | second Google ID token for the claim only: `serverClientId` = yui-hosted Web client, with a nonce; sent to `POST /api/claim` as `{method:"google", idToken}` and nowhere else |
| Google Play Billing | via the library | product `dev.kitepon.yuihome.hosted`, base plans `monthly` (JPY 100), `annual` (JPY 1,000); the library acknowledges; the app never references BillingClient |
| Android Keystore | in/out | device key; no backup (`allowBackup=false`) |
| WorkManager | in | daily `reportPaidUntil` |
| Join link / QR | in | `https://login-billing.kitepon.dev/join/dev.kitepon.yuihome#lbw1:...` (a browser) or `#lbq4:` / `#lbr1:` as an App Link intent filter; a QR scanner of the app (Google Code Scanner, brought by the library package) hands every text to `LocalForm.IsLibraryQR`, then `AnswerAsync`. The confirm screen is the app's |
| Alexa | none from the app | the app only shows the 8-character link code the server made |

## 2. Functions

| Function | Job | Input | Output / connection |
|---|---|---|---|
| `Account.StateAsync` | signed-in state | `KeptSignIn()`, `Keyholes.PublicKey()`, `POST keys/me` (`{}`, signed; 200 `{entry, role}`, 401 = key in no entry) | SignedOut → sign-in; NoEntry → "start here" or join; Ready → tabs. A failed check shows the reason and a retry |
| `SignIn` | first device: Google sign-in, then the person chooses "start here" (`StartAsync`) or joins through another phone | user tap | `SignInLocalAsync` binds the device key to the account; the Google token never reaches Yui and the app never sees it |
| `YuiApi` | the only place that sends a request to Yui: builds the URL and body, adds the `Login-Billing-Key` value from `Keyholes.Header`, maps status codes; on 401 `{"error":"time_off","now":ms}` it calls `UseServerTime(now)` and signs once more, never a second retry | op + fields | `HomeSnapshot` or typed error; 401 → signed out, 403/409/404/400 → typed message |
| `HomeStore` | holds the last `HomeSnapshot`; every op returns a fresh one | `YuiApi` | screens (rooms, devices, scenes, automations list with toggle) |
| `ControlDevice`, `PlayScene`, `SyncBrand`, `ToggleAutomation` | the ops of the iPhone client that v1 has | user tap | `YuiApi` |
| `SaveCredentials` | vendor keys per brand (Remo, SwitchBot, Tuya, Odelic, Daikin) | form | `op: credentials`; keys are never kept on the device after the call |
| `ReportPaidUntil` | states the paid date | `OwnPurchasesAsync()` lists a product → now + 31 days (`googleDays`); a `freeAccounts` match → 13 months ahead | `POST /api/home/paid-until` `{paidUntil: <ms>}`; runs at launch, at foreground, after purchase or restore, and by a daily WorkManager job; never on every request; a failure is shown and retried at the next trigger |
| `Subscribe` / `Restore` | purchase and restore | user tap | library `purchase`/`ownPurchases`, then `ReportPaidUntil`; settings has the Play manage-subscription link |
| `AdmitDevice` | parent phone admits a browser, iPad or Mac, or hands over | scanned QR or tapped join link | `IsLibraryQR` → `AnswerAsync(activity, text, confirm)`; a browser's lbw1 is admitted through `keys/admit` by the same-storage `Keyholes`. A new phone of the same person: `MakeRequestAsync` shows a QR and `AwaitOutcomeAsync` gives the add that `Keyholes.SendAddAsync` sends |
| `ClaimLegacyHome` | move a legacy home to the entry | Google: a second ID token from Credential Manager (`GetGoogleIdOption`, serverClientId = yui-hosted Web client, own nonce); e-mail: address + password | `POST /api/claim` `{method:"google", idToken}` or `{method:"password", email, password}`; fails whole: 401 bad proof, 409 already claimed; 404 after the window |
| `MakeLinkCode` | Alexa linking code | user tap | `POST /api/alexa/link-code` → `{code, expiresInSeconds: 600}`; 429 → message |
| `Export` | data export | user tap | `GET /api/account-data` → JSON saved through the system file picker; no vendor secrets |
| `DeleteAccount` | delete an entry, in this order | user confirm | 1 `DELETE /api/account-data`; 2 `SignOutOthersAsync`; 3 `LeaveAsync`; 4 `DeleteKey` + `SignOutLocal`. Step 1 fails: stop, the person retries. A later step fails: the data is already gone, retry the rest |
| `LeaveWarning` | says it before sign-out and deletion | none: the library has no key count and Yui has no count route (Yui lead, 2026-11-28) | unconditional text: "if this is your only device, the home is deleted at once"; a new phone starts a new entry or joins through the old phone; the old home of a lost only phone is removed by the 180-day purge, and Yui offers no other recovery |

## 3. Data flows

1. **Sign-in.** User → `SignIn` → library (Google) → entry + device key in Android Keystore. Yui sees only keyholes.
2. **Home control.** Screen → `HomeStore` → `YuiApi` → signed request → Yui → `HomeSnapshot` → screen. Paid gate: a lapsed home returns read-only; the app shows it and keeps showing the data.
3. **Paid date.** Play (device) → `OwnPurchasesAsync()` → `ReportPaidUntil` → `POST /api/home/paid-until` → `homes.paid_until`. Nothing flows back to Play.
4. **Claim.** Credential Manager (second ID token) or e-mail form → `ClaimLegacyHome` → `POST /api/claim` → home re-keyed to the entry.
5. **Admit.** QR scan or join link → `AdmitDevice` → library `keys/admit`.
6. **Alexa.** `MakeLinkCode` → code on screen → person types it on the linking page.
7. **Deletion.** `LeaveWarning` → `DeleteAccount` (order above).

## 4. Data ownership on the device

| Data | Where | Notes |
|---|---|---|
| device key | Android Keystore (library) | never exported, no backup |
| `HomeSnapshot` | memory only | no disk copy in v1 |
| vendor credentials | typed into a form, sent, cleared | never stored on the device |
| paid-date job state | WorkManager | no purchase token or store id stored by the app |
| purchase tokens, store accounts | Google Play and the library | never sent to Yui |

## 5. Failure handling

- No network: the screen says so and the action is not performed; no queue in v1.
- 401: signed out, back to sign-in. 403 on a paid date: the key is not in the home's entry, message only.
- Paid date lapsed (more than 7 days): the home is read-only; the app shows the state and the Subscribe button.
- Claim: bad proof or already claimed shows the server's message; retry is allowed.
- Unknown state is never a reason to stop; the app shows what it knows and the error text.
