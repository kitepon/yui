/**
 * Google のトークンを残さない決まりを、本物の Better Auth と作り物の Google で確かめる。
 *
 * - 認証の表は結の移行ファイルで作る。DB はメモリの上。
 * - Google のトークンの口（oauth2.googleapis.com/token）だけを作り物に替える。外へは出ない。
 * - 作り物は、広い権限（gmail.send など）と refresh token まで返す。実物より悪い条件にしてある。
 * - 値は全部ダミー。実在の利用者・トークンは使わない。
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";
import { betterAuth } from "better-auth";
import { bearer } from "better-auth/plugins";
import {
  OAUTH_TOKEN_DISABLED_PATHS,
  oauthTokenPolicy,
  providerOfRequest,
  tokenlessAccountOnCreate,
  tokenlessAccountOnUpdate,
  withoutGrantedScopes,
} from "./oauth-token-policy.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const ORIGIN = "http://localhost:8080";
const WIDE_SCOPE =
  "openid https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/userinfo.profile " +
  "https://www.googleapis.com/auth/gmail.send https://www.googleapis.com/auth/webmasters.readonly";

const b64 = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
/** 署名の無い作り物の ID トークン。認可コードの流れでは Better Auth は中身を読むだけ。 */
function dummyIdToken(sub: string, email: string) {
  return `${b64({ alg: "none", typ: "JWT" })}.${b64({ sub, email, email_verified: true, name: "ダミー" })}.x`;
}

let nextGoogleUser = { sub: "g-1", email: "dummy1@example.com" };
const tokenRequests: string[] = [];
const realFetch = globalThis.fetch;

before(() => {
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input instanceof Request ? input.url : input);
    if (url.startsWith("https://oauth2.googleapis.com/token")) {
      tokenRequests.push(url);
      return Response.json({
        access_token: "ya29.dummy-access",
        refresh_token: "1//dummy-refresh",
        id_token: dummyIdToken(nextGoogleUser.sub, nextGoogleUser.email),
        expires_in: 3599,
        scope: WIDE_SCOPE,
        token_type: "Bearer",
      });
    }
    throw new Error(`試験では外へ出ない: ${url}`);
  }) as typeof fetch;
});
after(() => {
  globalThis.fetch = realFetch;
});

function makeAuth(policy: boolean, accountCookie = false) {
  const db = new DatabaseSync(":memory:");
  db.exec(readFileSync(join(root, "migrations/sqlite/0001_auth.sql"), "utf8"));
  const auth = betterAuth({
    baseURL: ORIGIN,
    secret: "dummy-secret-0123456789abcdef0123456789abcdef",
    // 結の本番は自前の方言で同じ node:sqlite を読む。その方言は試験の実行系で読めないので、Better Auth の物を使う。
    database: db,
    trustedOrigins: [ORIGIN],
    // 結の設定と同じ所：トークンは暗号化して置く。Google と Apple は同じメールへ連携する。
    account: {
      encryptOAuthTokens: true,
      accountLinking: { enabled: true, trustedProviders: ["google", "apple"], requireLocalEmailVerified: false },
      // 結は入れていない設定。検査が効く事を見る時だけ入れる。
      ...(accountCookie ? { storeAccountCookie: true } : {}),
    },
    emailAndPassword: { enabled: true },
    user: { deleteUser: { enabled: true } },
    socialProviders: {
      google: {
        clientId: "dummy-client.apps.googleusercontent.com",
        clientSecret: "dummy-client-secret",
        prompt: "select_account" as const,
      },
      apple: {
        clientId: "dev.example.dummy",
        appBundleIdentifier: "dev.example.dummy",
        // Apple の鍵は取りに行かない。ID トークンの検証は通った事にする。
        verifyIdToken: async () => true,
      },
    },
    ...(policy ? { disabledPaths: OAUTH_TOKEN_DISABLED_PATHS } : {}),
    // 結と同じく、Cookie の代わりに `Authorization: Bearer` でも入れる（iPhone のアプリがこの形）。
    plugins: [...(policy ? [oauthTokenPolicy()] : []), bearer()],
  });
  return { auth, db };
}

type Auth = ReturnType<typeof makeAuth>["auth"];
type Row = Record<string, string | number | null>;

class Jar {
  private cookies = new Map<string, string>();
  absorb(response: Response) {
    for (const line of response.headers.getSetCookie()) {
      const [pair] = line.split(";");
      const at = pair.indexOf("=");
      const name = pair.slice(0, at).trim();
      const value = pair.slice(at + 1);
      if (/max-age=0/i.test(line) || value === "") this.cookies.delete(name);
      else this.cookies.set(name, value);
    }
    return response;
  }
  header() {
    return [...this.cookies].map(([name, value]) => `${name}=${value}`).join("; ");
  }
  names() {
    return [...this.cookies.keys()];
  }
  /** iPhone のアプリが持つ形（署名つきのセッションの印）。 */
  sessionToken() {
    const entry = [...this.cookies].find(([name]) => name.endsWith("session_token"));
    return entry ? decodeURIComponent(entry[1]) : "";
  }
}

async function call(
  auth: Auth,
  jar: Jar,
  path: string,
  body?: unknown,
  method = body === undefined ? "GET" : "POST",
  extra: Record<string, string> = {},
) {
  const headers: Record<string, string> = { origin: ORIGIN, cookie: jar.header(), ...extra };
  if (body !== undefined) headers["content-type"] = "application/json";
  return jar.absorb(
    await auth.handler(
      new Request(`${ORIGIN}/api/auth${path}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
      }),
    ),
  );
}

/** Web のログイン画面と iPhone の中継が呼ぶ形（scope を渡さず、URL を受け取ってから移る）。 */
async function googleSignIn(auth: Auth, jar: Jar, user: { sub: string; email: string }) {
  nextGoogleUser = user;
  const start = await call(auth, jar, "/sign-in/social", {
    provider: "google",
    callbackURL: "/",
    errorCallbackURL: "/login",
    disableRedirect: true,
  });
  assert.equal(start.status, 200);
  const url = new URL(((await start.json()) as { url: string }).url);
  const back = await call(auth, jar, `/callback/google?code=dummy-code&state=${url.searchParams.get("state")}`);
  return { url, back, setCookie: back.headers.getSetCookie() };
}

/** Cookie を持たず、`Authorization: Bearer` だけで呼ぶ。 */
const withBearer = (auth: Auth, token: string, path: string, body?: unknown) =>
  call(auth, new Jar(), path, body, body === undefined ? "GET" : "POST", { authorization: `Bearer ${token}` });

/** ログインの後の Cookie に、account の中身やトークンを持つ物が無い（セッションの印だけが出る）。 */
function assertNoAccountCookie(setCookie: string[]) {
  assert.ok(setCookie.some((line) => /session_token=/.test(line)));
  assert.equal(setCookie.some((line) => /account/i.test(line.split("=")[0])), false);
  assert.equal(setCookie.some((line) => /ya29|dummy-refresh|dummy-access/.test(decodeURIComponent(line))), false);
}

const googleRows = (db: DatabaseSync) =>
  db.prepare(`SELECT * FROM account WHERE providerId = 'google' ORDER BY createdAt`).all() as Row[];
const sessionCount = (db: DatabaseSync) => (db.prepare("SELECT count(*) n FROM session").get() as { n: number }).n;
const TOKEN_COLUMNS = ["accessToken", "refreshToken", "idToken", "accessTokenExpiresAt", "refreshTokenExpiresAt"];
const tokensOf = (row: Row | undefined) => TOKEN_COLUMNS.map((column) => row?.[column] ?? null);

test("決まりが無い時（今の動き）：広い権限のトークンを保存し、本人へ返せる", async () => {
  const { auth, db } = makeAuth(false);
  const jar = new Jar();
  const { url, back } = await googleSignIn(auth, jar, { sub: "g-1", email: "dummy1@example.com" });
  assert.equal(url.searchParams.get("include_granted_scopes"), "true");
  assert.equal(back.status, 302);
  const [row] = googleRows(db);
  assert.ok(row.accessToken && row.refreshToken && row.idToken && row.accessTokenExpiresAt);
  // access・refresh は暗号化、ID トークンはそのままの文字で入る。
  assert.notEqual(row.accessToken, "ya29.dummy-access");
  assert.equal(String(row.idToken).split(".").length, 3);
  assert.match(String(row.scope), /gmail\.send/);
  const token = await call(auth, jar, "/get-access-token", { providerId: "google" });
  assert.equal(token.status, 200);
  assert.equal(((await token.json()) as { accessToken: string }).accessToken, "ya29.dummy-access");
});

test("新しい利用者：前の権限をまとめる指定を付けず、ログインは通り、トークン欄は空で入る", async () => {
  const { auth, db } = makeAuth(true);
  const jar = new Jar();
  const { url, back, setCookie } = await googleSignIn(auth, jar, { sub: "g-1", email: "dummy1@example.com" });
  assert.equal(url.origin + url.pathname, "https://accounts.google.com/o/oauth2/v2/auth");
  assert.equal(url.searchParams.has("include_granted_scopes"), false);
  assert.equal(url.searchParams.get("scope"), "email profile openid");
  assert.equal(url.searchParams.get("access_type"), null);
  assert.equal(url.searchParams.get("prompt"), "select_account");
  assert.equal(url.searchParams.get("redirect_uri"), `${ORIGIN}/api/auth/callback/google`);
  assert.ok(url.searchParams.get("code_challenge"));

  assert.equal(back.status, 302);
  assert.equal(new URL(back.headers.get("location") ?? "", ORIGIN).pathname, "/");
  const session = (await (await call(auth, jar, "/get-session")).json()) as { user?: { email: string } } | null;
  assert.equal(session?.user?.email, "dummy1@example.com");

  const rows = googleRows(db);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].accountId, "g-1");
  assert.deepEqual(tokensOf(rows[0]), [null, null, null, null, null]);
  // 受け取った権限の記録は残す（作り物の Google は広い権限を返している）。
  assert.match(String(rows[0].scope), /gmail\.send/);

  assertNoAccountCookie(setCookie);
  assert.equal(jar.names().some((name) => /account/i.test(name)), false);
});

test("前からの利用者：トークンが残っていた行も、次のログインで空になる", async () => {
  const { auth, db } = makeAuth(true);
  const user = { sub: "g-2", email: "dummy2@example.com" };
  await googleSignIn(auth, new Jar(), user);
  // 決まりを入れる前の行を真似る。
  db.prepare(
    `UPDATE account SET accessToken = 'aabbccdd', refreshToken = 'eeff0011', idToken = 'old.dummy.jwt',
       accessTokenExpiresAt = '2026-10-08T16:25:21.176Z', updatedAt = '2026-10-08T15:25:23.178Z'
     WHERE providerId = 'google'`,
  ).run();
  const before = sessionCount(db);
  const jar = new Jar();
  const { back, setCookie } = await googleSignIn(auth, jar, user);
  assert.equal(back.status, 302);
  assertNoAccountCookie(setCookie);
  assert.equal(sessionCount(db), before + 1);
  const rows = googleRows(db);
  assert.equal(rows.length, 1);
  assert.deepEqual(tokensOf(rows[0]), [null, null, null, null, null]);
  // ログインの度に行は更新される。ログインがあった事は updatedAt で分かるまま。
  assert.notEqual(rows[0].updatedAt, "2026-10-08T15:25:23.178Z");
});

test("メールとパスワードの利用者が同じメールの Google で入る：連携は付き、パスワードはそのまま", async () => {
  const { auth, db } = makeAuth(true);
  const email = "dummy3@example.com";
  const signUp = await call(auth, new Jar(), "/sign-up/email", { email, password: "dummy-password-1", name: "ダミー" });
  assert.equal(signUp.status, 200);
  const { back, setCookie } = await googleSignIn(auth, new Jar(), { sub: "g-3", email });
  assert.equal(back.status, 302);
  assertNoAccountCookie(setCookie);
  assert.equal((db.prepare(`SELECT count(*) n FROM "user"`).get() as { n: number }).n, 1);
  assert.deepEqual(tokensOf(googleRows(db)[0]), [null, null, null, null, null]);
  const credential = db.prepare(`SELECT password FROM account WHERE providerId = 'credential'`).get() as Row;
  assert.ok(credential.password);

  // パスワードの変更は account の行を更新する。トークン欄を持たない更新は触らない。
  const jar = new Jar();
  assert.equal((await call(auth, jar, "/sign-in/email", { email, password: "dummy-password-1" })).status, 200);
  const changed = await call(auth, jar, "/change-password", {
    currentPassword: "dummy-password-1",
    newPassword: "dummy-password-2",
  });
  assert.equal(changed.status, 200);
  const after = db.prepare(`SELECT password FROM account WHERE providerId = 'credential'`).get() as Row;
  assert.ok(after.password);
  assert.notEqual(after.password, credential.password);
  assert.equal((await call(auth, new Jar(), "/sign-in/email", { email, password: "dummy-password-2" })).status, 200);
  assert.equal((await call(auth, new Jar(), "/sign-in/email", { email, password: "dummy-password-1" })).status, 401);
});

test("トークンを取り出す口は 404、scope を足したログインは 400", async () => {
  const { auth } = makeAuth(true);
  const jar = new Jar();
  await googleSignIn(auth, jar, { sub: "g-4", email: "dummy4@example.com" });
  assert.equal((await call(auth, jar, "/get-access-token", { providerId: "google" })).status, 404);
  assert.equal((await call(auth, jar, "/refresh-token", { providerId: "google" })).status, 404);
  assert.equal((await call(auth, jar, "/account-info")).status, 404);
  assert.equal((await call(auth, jar, "/link-social", { provider: "google", callbackURL: "/" })).status, 404);
  // 連携の一覧（トークンは返さない）は今までどおり。
  const list = await call(auth, jar, "/list-accounts");
  assert.equal(list.status, 200);
  assert.equal(JSON.stringify(await list.json()).includes("ya29"), false);

  const before = tokenRequests.length;
  const wide = await call(auth, new Jar(), "/sign-in/social", {
    provider: "google",
    callbackURL: "/",
    disableRedirect: true,
    scopes: ["https://www.googleapis.com/auth/gmail.send"],
  });
  assert.equal(wide.status, 400);
  assert.equal(wide.headers.get("location"), null);
  assert.equal(tokenRequests.length, before);
  // 空の配列は足していないので通す。
  assert.equal(
    (await call(auth, new Jar(), "/sign-in/social", { provider: "google", callbackURL: "/", disableRedirect: true, scopes: [] }))
      .status,
    200,
  );
});

test("Bearer で入っている時（iPhone のアプリの形）も、取り出す口は在らない道と同じ 404", async () => {
  // 決まりが無いと、Bearer でも保存したトークンが本人へ返る。
  const open = makeAuth(false);
  const openJar = new Jar();
  await googleSignIn(open.auth, openJar, { sub: "g-11", email: "dummy11@example.com" });
  const leaked = await withBearer(open.auth, openJar.sessionToken(), "/get-access-token", { providerId: "google" });
  assert.equal(leaked.status, 200);
  assert.equal(((await leaked.json()) as { accessToken: string }).accessToken, "ya29.dummy-access");

  const { auth, db } = makeAuth(true);
  const jar = new Jar();
  await googleSignIn(auth, jar, { sub: "g-11", email: "dummy11@example.com" });
  const raw = (db.prepare("SELECT token FROM session").get() as { token: string }).token;
  // 署名つき（アプリが持つ形）と、素のセッションの印の両方で見る。
  for (const token of [jar.sessionToken(), raw]) {
    assert.ok(token);
    const session = await withBearer(auth, token, "/get-session");
    assert.equal(session.status, 200);
    assert.equal(((await session.json()) as { user?: { email: string } } | null)?.user?.email, "dummy11@example.com");

    const missing = await withBearer(auth, token, "/no-such-path", {});
    assert.equal(missing.status, 404);
    for (const [path, body] of [
      ["/get-access-token", { providerId: "google" }],
      ["/refresh-token", { providerId: "google" }],
      ["/account-info", undefined],
      ["/link-social", { provider: "google", callbackURL: "/" }],
    ] as const) {
      const closed = await withBearer(auth, token, path, body);
      assert.equal(closed.status, 404, path);
      assert.equal((await closed.text()).includes("ya29"), false, path);
    }
  }
  // 未ログインでも同じ 404（ログインの有る無しで答えが変わらない）。
  assert.equal((await call(auth, new Jar(), "/get-access-token", { providerId: "google" })).status, 404);
});

test("Cookie の検査が効く事：account を Cookie へ写す設定だと、検査が落ちる", async () => {
  const { auth } = makeAuth(false, true);
  await googleSignIn(auth, new Jar(), { sub: "g-12", email: "dummy12@example.com" });
  // 2回目（今ある行への再ログイン）で、account の中身が Cookie へ出る。
  const { setCookie } = await googleSignIn(auth, new Jar(), { sub: "g-12", email: "dummy12@example.com" });
  assert.throws(() => assertNoAccountCookie(setCookie));
});

test("iPhone の中継と同じ呼び方（サーバーの中から signInSocial）でも、認可 URL に include_granted_scopes が無い", async () => {
  const { auth } = makeAuth(true);
  // `src/routes/api/ios-auth.ts` の start と同じ引数。
  const result = await auth.api.signInSocial({
    body: {
      provider: "google",
      callbackURL: `${ORIGIN}/api/ios-auth?step=finish&state=dummy`,
      errorCallbackURL: `${ORIGIN}/api/ios-auth?step=finish&state=dummy`,
      disableRedirect: true,
    },
    headers: new Headers(),
    asResponse: true,
  });
  assert.equal(result.ok, true);
  const url = new URL(((await result.json()) as { url: string }).url);
  assert.equal(url.searchParams.has("include_granted_scopes"), false);
  assert.equal(url.searchParams.get("scope"), "email profile openid");
  assert.equal(url.searchParams.get("redirect_uri"), `${ORIGIN}/api/auth/callback/google`);
});

test("結の設定がこの決まりを使っている（外れたら気づく）", () => {
  const source = readFileSync(join(root, "src/lib/auth/server.ts"), "utf8");
  assert.match(source, /disabledPaths: OAUTH_TOKEN_DISABLED_PATHS,/);
  assert.match(source, /^\s+oauthTokenPolicy\(\),$/m);
  // account の中身（トークンを含む）を Cookie へ写す設定は入れない。
  assert.equal(/storeAccountCookie/.test(source), false);
  // ライブラリが今も include_granted_scopes を付けている事。付けなくなったら、包みは要らなくなる。
  const google = readFileSync(join(root, "node_modules/@better-auth/core/dist/social-providers/google.mjs"), "utf8");
  assert.match(google, /include_granted_scopes: "true"/);
});

test("移る先を返す形（disableRedirect 無し）でも、Location から include_granted_scopes が外れる", async () => {
  const { auth } = makeAuth(true);
  const start = await call(auth, new Jar(), "/sign-in/social", { provider: "google", callbackURL: "/" });
  const location = new URL(start.headers.get("location") ?? "");
  assert.equal(location.searchParams.has("include_granted_scopes"), false);
  assert.equal(location.searchParams.get("scope"), "email profile openid");
});

test("Apple のログイン（ID トークン）は今までどおり：行の作り方も更新も変えない", async () => {
  const withPolicy = makeAuth(true);
  const without = makeAuth(false);
  const snapshots: Row[][] = [];
  for (const { auth, db } of [withPolicy, without]) {
    const body = {
      provider: "apple",
      idToken: { token: dummyIdToken("a-1", "dummy5@example.com"), accessToken: "apple-dummy-access" },
    };
    const first = await call(auth, new Jar(), "/sign-in/social", body);
    assert.equal(first.status, 200);
    assert.ok(((await first.json()) as { token?: string }).token);
    const second = await call(auth, new Jar(), "/sign-in/social", body);
    assert.equal(second.status, 200);
    const rows = db
      .prepare(`SELECT accountId, accessToken IS NOT NULL AS hasAccess, refreshToken, idToken, scope FROM account WHERE providerId = 'apple'`)
      .all() as Row[];
    assert.equal(rows.length, 1);
    snapshots.push(rows);
  }
  assert.deepEqual(snapshots[0], snapshots[1]);
  assert.equal(snapshots[0][0].hasAccess, 1);
});

test("アカウントの削除：Google だけの利用者も、トークン無しで消せる", async () => {
  const { auth, db } = makeAuth(true);
  const jar = new Jar();
  await googleSignIn(auth, jar, { sub: "g-6", email: "dummy6@example.com" });
  const removed = await call(auth, jar, "/delete-user", {});
  assert.equal(removed.status, 200);
  assert.equal((db.prepare(`SELECT count(*) n FROM "user"`).get() as { n: number }).n, 0);
  assert.equal((db.prepare("SELECT count(*) n FROM account").get() as { n: number }).n, 0);
});

test("今ある行を空へ戻す移行：Google のトークン欄だけが空になり、ほかは変わらない", async () => {
  const { auth, db } = makeAuth(false);
  // 決まりが無い状態で、Google・Apple・メールとパスワードの行を作る。
  await googleSignIn(auth, new Jar(), { sub: "g-7", email: "dummy7@example.com" });
  await googleSignIn(auth, new Jar(), { sub: "g-8", email: "dummy8@example.com" });
  await call(auth, new Jar(), "/sign-in/social", {
    provider: "apple",
    idToken: { token: dummyIdToken("a-9", "dummy9@example.com"), accessToken: "apple-dummy-access" },
  });
  await call(auth, new Jar(), "/sign-up/email", { email: "dummy10@example.com", password: "dummy-password-1", name: "ダミー" });
  const others = () =>
    db.prepare(`SELECT * FROM account WHERE providerId <> 'google' ORDER BY providerId, accountId`).all() as Row[];
  const kept = (rows: Row[]) =>
    rows.map(({ id, accountId, providerId, userId, scope, createdAt, updatedAt }) => ({
      id, accountId, providerId, userId, scope, createdAt, updatedAt,
    }));
  const googleBefore = googleRows(db);
  const othersBefore = others();
  assert.equal(googleBefore.length, 2);
  assert.ok(googleBefore.every((row) => row.accessToken && row.refreshToken && row.idToken));
  assert.equal(othersBefore.length, 2);

  db.exec(readFileSync(join(root, "migrations/sqlite/0009_google_tokens_blank.sql"), "utf8"));

  const googleAfter = googleRows(db);
  assert.ok(googleAfter.every((row) => tokensOf(row).every((value) => value === null)));
  // 連携そのもの（誰のどの Google か）と、受け取った権限の記録は残る。
  assert.deepEqual(kept(googleAfter), kept(googleBefore));
  assert.deepEqual(others(), othersBefore);
  assert.equal((db.prepare("SELECT count(*) n FROM account").get() as { n: number }).n, 4);
  // 2回流しても同じ。
  db.exec(readFileSync(join(root, "migrations/sqlite/0009_google_tokens_blank.sql"), "utf8"));
  assert.deepEqual(kept(googleRows(db)), kept(googleBefore));

  // 空へ戻した後も、同じ Google の利用者は同じ行へ入れる。
  const users = (db.prepare(`SELECT count(*) n FROM "user"`).get() as { n: number }).n;
  const { back } = await googleSignIn(auth, new Jar(), { sub: "g-7", email: "dummy7@example.com" });
  assert.equal(back.status, 302);
  assert.equal((db.prepare(`SELECT count(*) n FROM "user"`).get() as { n: number }).n, users);
  assert.equal(googleRows(db).length, 2);
});

test("決まりの判断：provider の読み方と、触らない更新", () => {
  assert.equal(providerOfRequest({ params: { id: "google" } }), "google");
  assert.equal(providerOfRequest({ params: {}, body: { provider: "apple" } }), "apple");
  assert.equal(providerOfRequest({ body: { providerId: "google" } }), "google");
  assert.equal(providerOfRequest(null), undefined);
  assert.equal(providerOfRequest({ params: { id: 1 }, body: {} }), undefined);

  assert.equal(tokenlessAccountOnCreate({ providerId: "apple", accessToken: "x" }), undefined);
  assert.equal(tokenlessAccountOnCreate({ providerId: "credential", password: "x" }), undefined);
  const blank = { accessToken: null, refreshToken: null, idToken: null, accessTokenExpiresAt: null, refreshTokenExpiresAt: null };
  assert.deepEqual(tokenlessAccountOnCreate({ providerId: "google", accessToken: "x", scope: "openid" }), { data: blank });

  // パスワードの変更など、トークン欄の無い更新は触らない。
  assert.equal(tokenlessAccountOnUpdate({ password: "x" }, { params: { id: "google" } }), undefined);
  // Apple と分かる更新は触らない。
  assert.equal(tokenlessAccountOnUpdate({ accessToken: "x" }, { body: { provider: "apple" } }), undefined);
  // Google と分かる更新、どこからか分からない更新は、空で書く。
  assert.deepEqual(tokenlessAccountOnUpdate({ accessToken: "x", scope: "openid" }, { params: { id: "google" } }), { data: blank });
  assert.deepEqual(tokenlessAccountOnUpdate({ idToken: "x" }, null), { data: blank });

  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth?scope=email&include_granted_scopes=true&state=s");
  assert.equal(withoutGrantedScopes(url).toString(), "https://accounts.google.com/o/oauth2/v2/auth?scope=email&state=s");
});
