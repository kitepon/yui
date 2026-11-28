import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import type { TuyaLocalDevice } from "@/lib/home/types";

export type SecretFields = {
  natureToken: string;
  switchbotToken: string;
  switchbotSecret: string;
  tuyaAccessId: string;
  tuyaSecret: string;
  tuyaUid: string;
  tuyaRegion: string;
  tuyaLocal: Record<string, TuyaLocalDevice>;
};

const EMPTY: SecretFields = {
  natureToken: "",
  switchbotToken: "",
  switchbotSecret: "",
  tuyaAccessId: "",
  tuyaSecret: "",
  tuyaUid: "",
  tuyaRegion: "",
  tuyaLocal: {},
};

type StringKey = Exclude<keyof SecretFields, "tuyaLocal">;
const KEYS = (Object.keys(EMPTY) as (keyof SecretFields)[]).filter((k): k is StringKey => k !== "tuyaLocal");

// The home key may come from the authentication module (see initHomeSecrets); until then, or without a module, from the environment.
// Kept on globalThis: the build copies this file into more than one server chunk, and every copy must see the unwrapped key.
const HOME_KEY = Symbol.for("yuihome.unwrappedHomeKey");
const holder = globalThis as { [HOME_KEY]?: string };

type Module = {
  unwrap: (sock: string, wrapped: string, aad: string) => Promise<string>;
  wrap: (sock: string, keyText: string, aad: string) => Promise<string>;
};

/**
 * At server start, before the first request and tick:
 * - YUI_AUTH_SOCK absent: the environment key, as before (self-hosted).
 * - the database holds a wrapped key: the module unwraps it; it lives in memory only.
 * - YUI_ROTATE_HOME_KEY=1 (one start, run by hand at the release): a fresh key replaces the old one (HOME_SECRETS_KEY) everywhere, and only the new one is wrapped.
 * If the module cannot answer and HOME_SECRETS_KEY is still in the environment (the transition), that value is used and a warning is logged.
 */
export async function initHomeSecrets(env = process.env, mod?: Module, db?: import("node:sqlite").DatabaseSync) {
  const sock = env.YUI_AUTH_SOCK?.trim();
  if (!sock) return "env";
  try {
    const m = mod ?? (await loadModule());
    const database = db ?? (await import("./sqlite.ts")).getSqlite();
    const { rotateHomeKey, storedHomeKey } = await import("./home-key.ts");
    const stored = storedHomeKey(database);
    if (env.YUI_ROTATE_HOME_KEY === "1" && !stored) {
      const oldKey = secretsKeyFromEnv(env.HOME_SECRETS_KEY);
      const { HOME_KEY_AAD_V2 } = await import("./home-key.ts");
      const res = await rotateHomeKey(database, oldKey, (hex) => m.wrap(sock, hex, HOME_KEY_AAD_V2));
      holder[HOME_KEY] = res.key.toString("hex");
      console.warn(`[yui] home key rotated: ${res.homes} homes, ${res.tokens} tokens re-encrypted`);
      return "rotated";
    }
    if (!stored) throw new Error("no wrapped home key is stored");
    const text = await m.unwrap(sock, stored.wrapped, stored.aad);
    secretsKeyFromEnv(text); // a value that is not a key is refused before it is kept
    holder[HOME_KEY] = text;
    return "module";
  } catch (err) {
    if (!env.HOME_SECRETS_KEY?.trim()) throw err;
    console.warn("[yui] the authentication module could not give the home key; using HOME_SECRETS_KEY from the environment");
    return "env";
  }
}

async function loadModule(): Promise<Module> {
  const m = await import("./auth-module.ts");
  return { unwrap: m.unwrapHomeKey, wrap: m.wrapHomeKey };
}

export function resetHomeSecretsForTests() {
  delete holder[HOME_KEY];
}

export function secretsKeyFromEnv(raw = holder[HOME_KEY] ?? process.env.HOME_SECRETS_KEY): Buffer {
  const value = raw?.trim();
  if (!value) {
    throw new Error("HOME_SECRETS_KEY が無い。32バイトの鍵を hex または base64 で渡す");
  }
  if (/^[0-9a-fA-F]{64}$/.test(value)) return Buffer.from(value, "hex");
  const buf = Buffer.from(value, "base64");
  if (buf.length !== 32) throw new Error("HOME_SECRETS_KEY は 32 バイトである");
  return buf;
}

export function encryptJson(key: Buffer, value: unknown): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const pt = Buffer.from(JSON.stringify(value), "utf8");
  const ct = Buffer.concat([cipher.update(pt), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, ct]).toString("base64");
}

export function decryptJson<T>(key: Buffer, packed: string): T {
  const buf = Buffer.from(packed, "base64");
  if (buf.length < 28) throw new Error("暗号文が短すぎる");
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const ct = buf.subarray(28);
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  const pt = Buffer.concat([decipher.update(ct), decipher.final()]);
  return JSON.parse(pt.toString("utf8")) as T;
}

/** 保存済みの行に無い項目（後から増えた tuyaLocal など）を埋める。 */
export function normalizeCredentials(stored: Partial<SecretFields> | undefined): SecretFields {
  return { ...EMPTY, ...stored, tuyaLocal: stored?.tuyaLocal ?? {} };
}

/**
 * 文字列の項目は空でなければ上書きする。`tuyaLocal` は同期だけが書く server 側の値で、
 * クライアントは常に空を送るので、1 件以上あるときだけ差し替える。
 */
export function mergeIncomingCredentials(stored: SecretFields, incoming: Partial<SecretFields>): SecretFields {
  const next = normalizeCredentials(stored);
  for (const key of KEYS) {
    const value = incoming[key]?.trim() ?? "";
    if (value) next[key] = value;
  }
  if (incoming.tuyaLocal && Object.keys(incoming.tuyaLocal).length > 0) {
    next.tuyaLocal = incoming.tuyaLocal;
  }
  return next;
}

export function credentialFlags(credentials: SecretFields): Record<keyof SecretFields, boolean> {
  const flags = {} as Record<keyof SecretFields, boolean>;
  for (const key of KEYS) {
    flags[key] =
      key === "tuyaRegion"
        ? Boolean(credentials.tuyaAccessId || credentials.tuyaUid)
        : Boolean(credentials[key]);
  }
  flags.tuyaLocal = Object.keys(credentials.tuyaLocal ?? {}).length > 0;
  return flags;
}

export function publicCredentials(): SecretFields {
  return { ...EMPTY };
}
