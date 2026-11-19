# Server-stored sign-in and Alexa data: function and data-flow contract

Scope: the three rows of user data that privacy task f07 (Miranda's q07 survey) changes: Better Auth `session` network fields, `alexa_tokens` / `alexa_auth_codes`, `billing_purchase_attempts` ended rows. Billing detail stays in `billing-function-dataflow.md`. Source of truth for structure; the code follows it.

## 1. Overall

| Connection | Direction | Contract |
|---|---|---|
| Browser / iOS app | in | Better Auth `/api/auth/*` creates a `session` row at sign-in; the cookie carries the session token |
| Alexa cloud | in | `/api/alexa/*` OAuth: authorization code, then access and refresh token, then API calls with the access token |
| SQLite | in/out | `session`, `alexa_auth_codes`, `alexa_tokens`, `billing_purchase_attempts` |
| Stripe webhook | in | own-customer events only; `checkout.session.completed` deletes the row of that session |

## 2. Functions

| Function (file) | Job | Input / owner | Output / connection |
|---|---|---|---|
| `betterAuth` config (auth/server.ts) | sign-in session creation | `databaseHooks.session.create.before` sets `ipAddress` and `userAgent` to null (Better Auth's `disableIpTracking` is not used: it also switches off the IP-based rate limit) | `session` rows hold token, user, times only; `ipAddress` and `userAgent` stay NULL |
| `alexaTokenHash` (alexa-token-hash.ts) | one-way form of a token | token string | `sha256:<hex>`; tokens are 256-bit random, so the hash cannot be reversed |
| `issueAlexaCode` / `consumeAlexaCode` (alexa-oauth.ts) | auth code lifecycle | code (given to Alexa once) | row stores the hash; lookup by hash |
| `issueAlexaTokens` / `userIdForAlexaAccess` / `refreshAlexaTokens` (alexa-oauth.ts) | token lifecycle | access / refresh token | rows store hashes; the plain tokens exist only in the HTTP response to Alexa and in Alexa's own store |
| `hashLegacyAlexaRows` (alexa-token-hash.ts, called by sqlite.ts after migrations) | one-time conversion | rows whose value does not start with `sha256:` | rewrites them to hashes, so existing Alexa links keep working; idempotent |
| `purgeEndedPurchaseAttempts` (billing-purchase.ts) | delete ended rows | rows with `expires_at_ms <= now` | called by `reservePurchaseAttempt`, by `tickAllHomes` (every tick) and by the webhook on `checkout.session.completed` of an own customer |
| `completePurchaseAttempt` (billing-purchase.ts) | delete a completed row | Stripe session id | called by the webhook on `checkout.session.completed` of an own customer (also on a Stripe retry) |

## 3. Data flow

- Sign-in: browser → Better Auth → `session` insert (no IP, no user agent) → cookie.
- Alexa link: browser consent → `issueAlexaCode` (hash stored, plain code in the redirect) → Alexa `/token` → `consumeAlexaCode` (hash lookup, row deleted) → `issueAlexaTokens` (hashes stored, plain tokens in the response) → each Alexa call → `userIdForAlexaAccess` (hash lookup).
- Purchase attempt: `reservePurchaseAttempt` (purges ended rows first) → `attachStripeSession` → completion by webhook (`completePurchaseAttempt`), release by the app, or expiry (purged on the next tick).

## 4. Stores

| Store | Owner | Content | Change |
|---|---|---|---|
| `session` | Better Auth | id, token, user, times; `ipAddress`, `userAgent` | the two columns stay but are never written; migration 0010 clears existing values; no app code or screen reads them (grep of `src`) |
| `alexa_auth_codes` | alexa-oauth.ts | hashed code, user, redirect, expiry | code stored as hash |
| `alexa_tokens` | alexa-oauth.ts | hashed access and refresh token, user, expiry | tokens stored as hashes |
| `billing_purchase_attempts` | billing-purchase.ts | one row per user while a purchase is in progress | ended rows are deleted (migration 0010 deletes the ones already ended) |

## 5. Failure and unknown-result table

| Operation | Failure / unknown | What remains |
|---|---|---|
| legacy conversion | crash mid-way | one transaction; rolled back, old plain rows keep working and the next start retries |
| Alexa lookup of a token stored before this change | not yet converted | never happens: conversion runs in `getSqlite` before any query |
| purge | SQLite error | tick logs and continues; ended rows stay until the next tick |
| webhook delete | SQLite error | the webhook answers 400 and Stripe retries; the row expires and the tick purges it anyway |

## 6. Why a hash and not reversible encryption

Alexa tokens are looked up by value. Encryption with a random IV (the `homes.credentials_enc` mechanism) cannot be searched; the server never needs the plain token again, so a one-way SHA-256 is stronger than encryption and has no key to rotate or lose.