# Billing function and data-flow contract

Scope: Stripe Web billing of 結 and its merge with Apple entitlement. Apple purchase/notification handling is out of scope (one row below).
Status: **baseline = current behavior** (code at de5f4ad). Target changes are marked "TARGET" and are added in the same diff as the code.
Source of truth for structure; the code follows it (see `docs/00_direction.md`).

## 1. Overall (billing as one box)

| Connection | Direction | Contract |
|---|---|---|
| Browser / iOS app | in | `POST/DELETE /api/stripe/checkout`, `POST /api/stripe/portal`, `GET /api/stripe/status` (session cookie → `requireUser`); every write API reads entitlement through `loadEntitlement` and answers 402 via `paywall` |
| Stripe API (account A = `acct_1U4wh…`, today) | out | one secret key `STRIPE_SECRET_KEY` (one account at a time); customers, checkout sessions, subscriptions, billing portal sessions |
| Stripe webhook | in | `POST /api/stripe/webhook`, one secret `STRIPE_WEBHOOK_SECRET`; only clears the cache |
| Apple billing | in/out | `appleEntitlement`, `appleSubscriptionRows`, `refreshAppleSubscription`: entitlement merge only; `/api/apple/purchase` also calls Stripe (see rows) |
| SQLite | in/out | `billing_customers`, `billing_purchase_attempts`, `stripe_webhook_events` |
| 1Password / env | in | `deploy/op.env` → container env at `up.sh`; names in section 4 |
| hosted-metrics reader | out | `scripts/hosted-metrics.mjs`, raw HTTP GET `/v1/subscriptions`, aggregate JSON only |
| Account deletion | in | `prepareAccountDeletion` called from `auth/server.ts` before the user row is deleted |

## 2. Functions (own layer)

`billing.ts` mixes six jobs (Stripe client, session auth, customer rows, entitlement cache, checkout/portal, webhook record + paywall). Not split now; **future split point**.

| Function (file) | Job | Input / owner | Output / connection |
|---|---|---|---|
| `getStripe` (billing.ts) | Stripe client | env `STRIPE_SECRET_KEY`, read once per process | memoized `Stripe`; key change needs a container restart |
| `requireUser` (billing.ts) | session auth | request headers → better-auth | user or null |
| `loadCustomerId` / `userIdForCustomerId` / `saveCustomerId` (billing.ts) | customer row | SQLite `billing_customers` | `cus_` id (belongs to the account of the key in use when it was created) |
| `getOrCreateCustomer` (billing.ts) | **only creator of Stripe customers** | userId, email, name | existing id, or `customers.create` with metadata `{userId, service:"yuihome"}`, idempotency `yuihome-customer-<userId>`, then `saveCustomerId` |
| `loadEntitlement` (billing.ts) | merge | Apple rows first (`appleEntitlement`); if not writable, Stripe | `Entitlement` |
| `loadStripeEntitlement` + cache (billing.ts) | cache 10 min per process, per user | `fetchEntitlement` | `Entitlement` |
| `fetchEntitlement` (billing.ts) | decide | exempt emails (`YUI_BILLING_EXEMPT`) → writable; `billingConfigured` false → read-only; no customer row → read-only (price copy); else `stripeSubscriptions` and first `trialing`/`active` | `entitlementFromSubscription` (billing-core.ts); price id not equal to env monthly/annual → plan null → **read-only even if active** |
| `forgetEntitlement` (billing.ts) | cache clear | userId | called by webhook, `startCheckout`, `cancelStripeCheckout`, status `?refresh=1`, `/api/apple/purchase`, and `saveTransaction` (apple-billing.ts:146, the Apple transaction accept/notification path) |
| `stripeSubscriptions` (billing.ts) | list all pages | customer id | subscriptions; throws if a page has no cursor |
| `assertNoStripeContract` (billing.ts) | guard | customer id (if any) | throws if any subscription is not canceled/incomplete_expired; also called by `/api/apple/purchase` |
| `trialEligible` (billing.ts) | trial rule | customer id | true when the customer has **no subscription ever in the account of the key** |
| `startCheckout` (billing.ts) | checkout | see failure table | session URL |
| `cancelStripeCheckout` (billing.ts) | cancel | pending attempt | expire session, release attempt, clear cache |
| `startPortal` (billing.ts) | portal | customer row | `billingPortal.sessions.create({customer, return_url})`, **no configuration id** (account default portal) |
| `recordWebhookEvent` + webhook route | idempotency + cache | raw body, `stripe-signature`, `STRIPE_WEBHOOK_SECRET` | 200 `{received:true}`; clears cache only if the event's customer is in `billing_customers` and the event id is new |
| `reserve/attach/releasePurchaseAttempt`, `activePurchaseAttempt` (billing-purchase.ts) | one purchase at a time per user | SQLite `billing_purchase_attempts` | attempt id, or null while another attempt is unexpired |
| `prepareAccountDeletion` (account-deletion.ts) | end contracts before deletion | customer row | expire open yuihome sessions, cancel non-final subscriptions, `customers.del`; any Stripe failure aborts the deletion |
| Apple merge (apple-billing*.ts) | entitlement merge only | Apple rows | `appleEntitlement`, `appleSubscriptionRows`, `refreshAppleSubscription` |
| `POST /api/apple/purchase` (routes/api/apple) | Apple purchase gate | customer row | calls `assertNoStripeContract` and `checkout.sessions.list` with the stored customer id, so it depends on the same account binding |
| hosted-metrics (scripts/hosted-metrics.mjs) | separate reader | env `STRIPE_SECRET_KEY`, monthly/annual price ids, SQLite opened without the readOnly flag but with `PRAGMA query_only = ON`; every statement is a `SELECT` | `fetchAllSubscriptions` lists **all** subscriptions of the account (raw HTTP); `aggregateSubscriptions` computes five counters: `total_records`, `live`, `by_status`, `live_cancel_at_period_end` (all four count **every** subscription of the account) and `live_by_plan` with three buckets `monthly` / `annual` / `unknown` (the only counter that compares price ids; **this comparison is the line to change**); prints aggregates only, never ids, emails or user ids |

## 2b. In-process consumers of `loadEntitlement` and what each does when it throws

`loadEntitlement` asks Apple first; a user whose Apple entitlement is writable never reaches Stripe and is unaffected by fact (a). Only a user without a writable Apple entitlement and with a Stripe customer row can throw.

| Consumer | When it calls | If `loadEntitlement` throws (read from the code) |
|---|---|---|
| `routes/api/home.ts` GET | home page data, when billing is configured | not caught: **500 for the whole home read** of that user |
| `routes/api/home.ts` POST | every write op | not caught: 500, writes fail |
| `routes/api/stripe/status.ts` | settings screen | not caught: 500 (also from `loadStripeEntitlement`) |
| `runner.ts:390` automation tick | every tick, per home | caught by the per-home `try/catch`: error logged ("tick home failed"), that home's automation is **skipped on every tick** until it works again; other homes continue |
| `alexa.ts`, `alexa-custom.ts` | every Alexa directive/intent | not caught in the function nor in `routes/api/alexa/$.ts`: the request fails (HTTP error) |
| `routes/api/apple/transaction.ts` | after a verified Apple transaction | inside `try`: answered as a 400/503 "could not verify the Apple transaction" although the transaction was saved |
| `routes/api/apple/refresh.ts` | Apple refresh | inside `try`: 502 "could not refresh" |
| `routes/api/apple/purchase.ts` | start of an Apple purchase | inside `try`: attempt released, 409 with the error text |

## 3. Data flow

Browser → `requireUser` → `startCheckout` → `reservePurchaseAttempt` (SQLite) → Apple refresh if rows exist → `loadEntitlement` / `assertNoStripeContract` / `getOrCreateCustomer` (Stripe customers, SQLite) → open-session check → `trialEligible` → `checkout.sessions.create` → `attachStripeSession` → URL to browser. Stripe → webhook route → signature check → `recordWebhookEvent` → `userIdForCustomerId` → `forgetEntitlement`. Next request → `loadEntitlement` → `fetchEntitlement` → `subscriptions.list(customer)` → `entitlementFromSubscription` → cache.
Portal: browser → `requireUser` → `startPortal` → `loadCustomerId` → `billingPortal.sessions.create` (account default portal) → URL.
Apple purchase gate: browser/iOS → `requireUser` → `reservePurchaseAttempt(apple)` → Apple refresh → `loadEntitlement` → `assertNoStripeContract` → `loadCustomerId` → `checkout.sessions.list` → attempt id and account token, or `releasePurchaseAttempt` and 409.
Account deletion: `auth/server.ts:243` → `prepareAccountDeletion` → Apple login revoke → `loadCustomerId` → expire open yuihome sessions → cancel non-final subscriptions → `customers.del` → Apple deleted-transaction marks → user row deletion.
hosted-metrics: env (`STRIPE_SECRET_KEY`, price ids) → raw HTTP GET `/v1/subscriptions` for ALL subscriptions of the account → `aggregateSubscriptions` → aggregate JSON on stdout (+ SQLite SELECT counts).

## 4. Stores and configuration

| Store | Owner | Content | Notes |
|---|---|---|---|
| `billing_customers` | billing.ts | user_id → `stripe_customer_id` (unique) | **ids belong to the account whose key created them (today account A)**; no account marker stored |
| `billing_purchase_attempts` | billing-purchase.ts | one row per user; stripe: 2-minute reservation, then session expiry (31 min); apple: no expiry | provider `stripe` or `apple` |
| `stripe_webhook_events` | billing.ts | event id, type, time | idempotency only; nobody reads it otherwise |
| entitlement cache | billing.ts | 10 min, in-process | cleared by `forgetEntitlement`; lost on restart |
| env (names only) | deploy/op.env → container | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_MONTHLY_PRICE_ID`, `STRIPE_ANNUAL_PRICE_ID`, `YUI_BILLING_EXEMPT` | all read at use, but `getStripe` memoizes the client |
| Stripe objects | Stripe | customer (metadata userId/service), checkout session (metadata userId/plan/service), subscription (same metadata), portal session | session expires 31 min after creation |

## 5. Failure and unknown-result table

| Operation | Failure / unknown | What remains |
|---|---|---|
| `startCheckout` before session creation | any error (Apple refresh, already subscribed, open session, Stripe error) | attempt released; nothing in Stripe except maybe a customer |
| `startCheckout` after `sessions.create` | missing url or `attachStripeSession` false | session expired and attempt released; if expire also fails: error logged, attempt stays until its (2-minute) reservation expiry although the session lives up to 31 min (known gap) |
| `cancelStripeCheckout` | session already completed | 409, attempt kept, cache not cleared |
| webhook | bad signature or body | 400, nothing recorded, Stripe retries |
| webhook | `STRIPE_WEBHOOK_SECRET` missing | 503 |
| webhook | duplicate event id | 200, cache not cleared again |
| webhook | customer not in `billing_customers` | 200, event id recorded, no cache clear |
| `fetchEntitlement` | Stripe error (network, missing customer) | **throws to the caller**: `loadEntitlement` rejects, so write APIs, status and Alexa for that user fail; nothing cached |
| `prepareAccountDeletion` | any Stripe call fails | deletion aborted, user stays |
| `startPortal` | no row / Stripe error | 400 with message |
| hosted-metrics | Stripe HTTP error | exits with error, no partial output |

## 6. Account binding facts for the consolidation (current code, read not run)

a. `billing_customers` holds ids of account A; the code uses whichever `STRIPE_SECRET_KEY` is set. After the key switch, `loadCustomerId` returns an id the new account does not know: `fetchEntitlement`, `startPortal`, `trialEligible`, `assertNoStripeContract`, `/api/apple/purchase` and `prepareAccountDeletion` fail with a missing-customer error for that user. The failure table says `fetchEntitlement` throws and deletion aborts. Only users with a row are affected: 1 row in `billing_customers` and 1 customer in the Stripe account, measured 2026-11-19 22:13 JST by a read-only `SELECT count(*)` in the prod container and a GET customer list; it can change before the window, so recount before it. `getOrCreateCustomer` is not reached because it returns the stored id first.
b. Customers are created only in `getOrCreateCustomer`; `checkout.sessions.create` in `startCheckout` is the only place Checkout sessions are created. TARGET: one change there (`automatic_tax`, `customer_update[address]=auto`) reaches new and existing customers.
c. The webhook accepts one secret. Events of account A reach the endpoint with account A's secret; events of account B reach the endpoint created in account B with its own secret. After the switch the container holds only B's secret, so account A's endpoint (if still enabled) delivers events that fail signature (400). Events of other products in B, if the endpoint is subscribed to them, are recorded and ignored (customer not in `billing_customers`).
d. A price id not equal to env monthly/annual is read-only (see `fetchEntitlement`); the swap must change prices and key together.
e. `trialEligible` looks at the account of the key: a new customer in B is eligible for a second free trial.
f. `billing_purchase_attempts` rows with a `stripe_session_id` of account A that are unexpired at the key switch (up to 31 minutes after creation): `cancelStripeCheckout` calls `sessions.retrieve` with that id on account B and fails, and `startCheckout` answers "Web purchase in progress" until the row expires. It heals itself at expiry. Measured 2026-11-19 22:13 JST: 0 Stripe rows. Plan: switch when the count is 0 (checked at the window), otherwise wait or accept at most 31 minutes for those users.

## 7. TARGET (changes made together with the code; not in effect yet)

| Item | Target |
|---|---|
| `startCheckout` params | add `automatic_tax: {enabled: true}` and `customer_update: {address: "auto"}` to `checkout.sessions.create`; no other call creates Checkout sessions, and `getOrCreateCustomer` stays the only customer creator |
| Failure row | **Unconfirmed, expected from Stripe's behavior, not from a run:** if Stripe Tax is not enabled on account B (no head office address) or a price has no `tax_behavior`, `sessions.create` is expected to fail for every user; `startCheckout` then releases the attempt and the route returns the Stripe error text. The Stripe docs I could read describe `automatic_tax[enabled]=true` and a default-tax variant that silently disables tax; they do not state the explicit-parameter failure. Arcana confirms with one Checkout session creation on account B once Tax is active (task t3a). Until then the switch must not start |
| hosted-metrics | filter fetched subscriptions to those whose first item price is the monthly or annual id before `aggregateSubscriptions`, so all five counters describe 結 only. An unknown price is reported as a count `excluded_other_price` (a number only, no ids) so a 結 subscription with a wrong price stays visible; `live_by_plan.unknown` is then always 0 and is removed |

## 8. Open questions (Owner / Arcana / Poli)

1. D3, the one live subscriber (card migration or re-subscribe) and the remap of that row (Arcana's plan, `yui/stripe-consolidation-20261119`).
2. Fact e (second free trial for a re-subscribing person): Owner decides whether that person gets a second 30-day trial or no trial (option B needs a per-user "trial used" flag).
3. hosted-metrics: the counters' TARGET above is a spec choice (excluded-count line); Owner decides, my recommendation is the excluded count.
4. `HOSTED_PRICE_COPY` and `BILLING` (billing-plan.ts) are the price text users see. The Owner ruled tax-inclusive prices with the amounts unchanged, so the charged amount stays 100 JPY/month and 1,000 JPY/year including tax; if the target prices are created exclusive, the charged amount would differ from the text. Prices are Arcana's, the wording and the 税込 statement are Poli's (s02b-legal).

