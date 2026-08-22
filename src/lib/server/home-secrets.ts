import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

export type SecretFields = {
  natureToken: string;
  switchbotToken: string;
  switchbotSecret: string;
  tuyaAccessId: string;
  tuyaSecret: string;
  tuyaUid: string;
  tuyaRegion: string;
};

const EMPTY: SecretFields = {
  natureToken: "",
  switchbotToken: "",
  switchbotSecret: "",
  tuyaAccessId: "",
  tuyaSecret: "",
  tuyaUid: "",
  tuyaRegion: "",
};

const KEYS = Object.keys(EMPTY) as (keyof SecretFields)[];

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

export function mergeIncomingCredentials(stored: SecretFields, incoming: Partial<SecretFields>): SecretFields {
  const next = { ...stored };
  for (const key of KEYS) {
    const value = incoming[key]?.trim() ?? "";
    if (value) next[key] = value;
  }
  return next;
}

export function credentialFlags(credentials: SecretFields): Record<keyof SecretFields, boolean> {
  const flags = { ...EMPTY } as unknown as Record<keyof SecretFields, boolean>;
  for (const key of KEYS) {
    flags[key] =
      key === "tuyaRegion"
        ? Boolean(credentials.tuyaAccessId || credentials.tuyaUid)
        : Boolean(credentials[key]);
  }
  return flags;
}

export function publicCredentials(): SecretFields {
  return { ...EMPTY };
}
