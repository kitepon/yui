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

export function secretsKeyFromEnv(raw = process.env.HOME_SECRETS_KEY): Buffer {
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
