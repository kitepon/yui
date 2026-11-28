# Yui Android app: function and data-flow diagram (target)

Scope: the Android app of hosted 結 (Yui), package `dev.kitepon.yuihome`, .NET 10 MAUI (Android only), minSdk 26, targetSdk 36. Owner of this file: the Android app role. The overall diagram and the server side are `docs/hosted-login-billing-contract.md` (target); this file is the app's own part and must agree with it.
Status: TARGET. Items marked PENDING wait for the library's Android API (Mint) and are settled in this file before code uses them.
First version (v1): sign-in, home control, vendor credentials, paid date, admit another device, claim, Alexa link code, export, account deletion. Later (v2): scene and automation editors, device groups, room management, analysis. The app points only at `https://yuihome.kitepon.dev` and carries no secret in the build beyond what the library needs.

## 1. Connections

| Connection | Direction | Contract |
|---|---|---|
| Yui hosted API (`https://yuihome.kitepon.dev`) | out | signed requests (device key): `GET/POST /api/home` (ops: control, scene, sync, credentials, automation-toggle), `POST /api/home/paid-until`, `POST /api/claim`, `POST /api/alexa/link-code`, account-data delete and export routes (names per the contract, section 2) |
| Shared login/billing library, Android part | in-process | PENDING: sign-in with Google, `ownPurchases()`, `purchase`, `keys/*` (start, accept, admit, others, leave, me), request signing. The app calls only its public API |
| Google Credential Manager | out | second Google ID token for the claim only: `serverClientId` = yui-hosted Web client, with a nonce; sent to `POST /api/claim` as `{method:"google", idToken}` and nowhere else |
| Google Play Billing | out (device) | product `dev.kitepon.yuihome.hosted`, base plans `monthly`, `annual`; the app reads its own purchases; acknowledgement per the library (PENDING; the app does it if the library does not) |
| Android Keystore | in/out | device key; no backup (`allowBackup=false`) |
| WorkManager | in | daily `reportPaidUntil` |
| Join link / QR | in | `https://login-billing.kitepon.dev/join/dev.kitepon.yuihome#lbw1:...` as an App Link, and a QR scanner for the browser or child device's lbw1 code |
| Alexa | none from the app | the app only shows the 8-character link code the server made |

## 2. Functions

| Function | Job | Input | Output / connection |
|---|---|---|---|
| `SessionStore` | holds signed-in state (entry exists, role, device key present) | library `me` | state for the shell; signed out shows sign-in |
| `SignIn` | Google sign-in through the library | user tap | entry + device key (library); token never reaches Yui |
| `YuiApi` | the only place that sends a request to Yui: builds the URL and body, signs it through the library, maps status codes | op + fields | `HomeSnapshot` or typed error; 401 → signed out, 403/409/404/400 → typed message, never a silent retry |
| `HomeStore` | holds the last `HomeSnapshot`; every op returns a fresh one | `YuiApi` | screens (rooms, devices, scenes, automations list with toggle) |
| `ControlDevice`, `PlayScene`, `SyncBrand`, `ToggleAutomation` | the ops of the iPhone client that v1 has | user tap | `YuiApi` |
| `SaveCredentials` | vendor keys per brand (Remo, SwitchBot, Tuya, Odelic, Daikin) | form | `op: credentials`; keys are never kept on the device after the call |
| `ReportPaidUntil` | states the paid date | `ownPurchases()` lists the product → now + 31 days (the library's `googleDays`); `freeAccounts` exempt → 13 months | `POST /api/home/paid-until`; runs at launch, at foreground, after purchase or restore, and by a daily WorkManager job; never on every request; a failure shows a message and is retried at the next trigger |
| `Subscribe` / `Restore` | purchase and restore | user tap | library `purchase`/`ownPurchases`, then `ReportPaidUntil`; settings has the Play manage-subscription link |
| `AdmitDevice` | parent phone admits a browser, iPad or Mac | scanned lbw1 QR or tapped join link | library `keys/admit` (and `accept` on the joining phone) |
| `ClaimLegacyHome` | move a legacy home to the entry | Google: second ID token; e-mail: address + password | `POST /api/claim`; fails whole: 401 bad proof, 409 already claimed |
| `MakeLinkCode` | Alexa linking code | user tap | `POST /api/alexa/link-code` → 8 characters, valid 10 minutes, shown with its time left; 429 → message |
| `Export` | data export | user tap | export route → JSON saved through the system file picker; no vendor secrets |
| `DeleteAccount` | delete an entry, in this order | user confirm | 1 account-data delete (signed Yui route); 2 library `keys/others`; 3 library `leave`; 4 delete device key and local sign-out. Step 1 fails: stop, the person retries. Later step fails: the data is already gone, retry the rest |
| `LeaveWarning` | says it before the last device leaves or signs out | `keys/me` (key count) | text: the home is deleted at once when the last device leaves; on a new phone: sign in again or be admitted; the old key stays until the 180-day removal |

## 3. Data flows

1. **Sign-in.** User → `SignIn` → library (Google) → entry + device key in Android Keystore. Yui sees only keyholes.
2. **Home control.** Screen → `HomeStore` → `YuiApi` → signed request → Yui → `HomeSnapshot` → screen. Paid gate: a lapsed home returns read-only; the app shows it and keeps showing the data.
3. **Paid date.** Play (device) → `ownPurchases()` → `ReportPaidUntil` → `POST /api/home/paid-until` → `homes.paid_until`. Nothing flows back to Play.
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
