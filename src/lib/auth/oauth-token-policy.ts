/**
 * 本人確認にだけ使う provider（Google）の OAuth トークンを、結に残さないための決まり。
 *
 * 結は Google を「誰か」を確かめるためにだけ使い、Google の API は呼ばない。
 * けれど Better Auth は、ログインの度に受け取ったトークンを account 表へ書く。
 * Google の認可は `include_granted_scopes=true` で求めるので、同じ利用者が同じ
 * Google プロジェクトのほかの client へ与えた権限まで、受け取るトークンに入る。
 *
 * ここで決める事：
 * 1. 求めた scope だけを受け取る（認可 URL から `include_granted_scopes` を外す）。
 * 2. 受け取ったトークンを保存しない（account 表のトークン欄を空で書く）。
 * 3. 呼ぶ側が scope を足せないようにする（`/sign-in/social` の `scopes` を断る）。
 * 4. トークンを取り出す口を閉じる（`OAUTH_TOKEN_DISABLED_PATHS`。`server.ts` で渡す）。
 *
 * Apple は対象にしない。Apple の取り消し用トークンは `apple_login_tokens` に別に持つ。
 */
import type { BetterAuthPlugin } from "better-auth";
import { APIError, createAuthMiddleware } from "better-auth/api";

/** トークンを残さない provider。 */
export const TOKENLESS_PROVIDERS: readonly string[] = ["google"];

/** account 表のトークン欄。`scope` は受け取った権限の記録として残す。 */
export const OAUTH_TOKEN_FIELDS = [
  "accessToken",
  "refreshToken",
  "idToken",
  "accessTokenExpiresAt",
  "refreshTokenExpiresAt",
] as const;

/**
 * 止める標準の口。どれも結の画面とアプリは呼ばない。
 * - `/get-access-token`・`/refresh-token`：保存したトークンを本人へ返す・更新する。
 * - `/account-info`：保存したトークンで provider の利用者情報を読む。
 * - `/link-social`：ログイン済みの利用者が、scope を足して連携を足せる。
 */
export const OAUTH_TOKEN_DISABLED_PATHS = [
  "/get-access-token",
  "/refresh-token",
  "/account-info",
  "/link-social",
];

const BLANK_TOKENS = Object.fromEntries(OAUTH_TOKEN_FIELDS.map((field) => [field, null])) as Record<
  (typeof OAUTH_TOKEN_FIELDS)[number],
  null
>;

function hasTokenField(data: Record<string, unknown>) {
  return OAUTH_TOKEN_FIELDS.some((field) => field in data);
}

/** 書き込みを起こした要求から provider を読む。OAuth の戻りは経路、ID トークンのログインは本文に入る。 */
export function providerOfRequest(
  ctx: { params?: Record<string, unknown>; body?: Record<string, unknown> } | null | undefined,
): string | undefined {
  const value = ctx?.params?.id ?? ctx?.params?.providerId ?? ctx?.body?.provider ?? ctx?.body?.providerId;
  return typeof value === "string" && value ? value : undefined;
}

/** 新しい account の行。provider が行に入っているので、それで決める。 */
export function tokenlessAccountOnCreate(account: Record<string, unknown>) {
  if (!TOKENLESS_PROVIDERS.includes(String(account.providerId ?? ""))) return undefined;
  return { data: { ...BLANK_TOKENS } };
}

/**
 * 今ある account の行の更新。更新の中身に provider は入らないので、要求から読む。
 * トークン欄を持たない更新（パスワードの変更など）は触らない。
 * provider が読めない更新は、空で書く側へ倒す（結はどの provider のトークンも読まない）。
 */
export function tokenlessAccountOnUpdate(
  data: Record<string, unknown>,
  ctx: Parameters<typeof providerOfRequest>[0],
) {
  if (!hasTokenField(data)) return undefined;
  const provider = providerOfRequest(ctx);
  if (provider !== undefined && !TOKENLESS_PROVIDERS.includes(provider)) return undefined;
  return { data: { ...BLANK_TOKENS } };
}

/** 求めた scope だけの認可にする。前に与えた権限を、今回のトークンへ足させない。 */
export function withoutGrantedScopes(url: URL): URL {
  url.searchParams.delete("include_granted_scopes");
  return url;
}

type SocialProvider = {
  id: string;
  createAuthorizationURL: (...args: never[]) => Promise<URL> | URL;
};

export function oauthTokenPolicy(): BetterAuthPlugin {
  return {
    id: "yui-oauth-token-policy",
    init(ctx) {
      const socialProviders = (ctx.socialProviders as unknown as SocialProvider[]).map((provider) => {
        if (!provider || typeof provider !== "object" || !TOKENLESS_PROVIDERS.includes(provider.id)) return provider;
        const createAuthorizationURL = provider.createAuthorizationURL.bind(provider);
        return {
          ...provider,
          createAuthorizationURL: async (...args: never[]) => withoutGrantedScopes(await createAuthorizationURL(...args)),
        };
      });
      return {
        context: { socialProviders: socialProviders as unknown as typeof ctx.socialProviders },
        options: {
          databaseHooks: {
            account: {
              create: { before: async (account) => tokenlessAccountOnCreate(account) },
              update: { before: async (data, hookCtx) => tokenlessAccountOnUpdate(data, hookCtx) },
            },
          },
        },
      };
    },
    hooks: {
      before: [
        {
          matcher: (ctx) => ctx.path === "/sign-in/social",
          handler: createAuthMiddleware(async (ctx) => {
            const scopes = (ctx.body as { scopes?: unknown } | undefined)?.scopes;
            if (Array.isArray(scopes) && scopes.length > 0) {
              throw new APIError("BAD_REQUEST", { message: "scope は指定できません" });
            }
          }),
        },
      ],
    },
  };
}
