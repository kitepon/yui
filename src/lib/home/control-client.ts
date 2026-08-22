import type { HomeSnapshot } from "./snapshot";
import type { Brand, Credentials, Device } from "./types";

const KEY_URL = "yui-control-url";
const KEY_PIN = "yui-control-pin";

export function getControlUrl() {
  if (typeof window === "undefined") return "";
  return (localStorage.getItem(KEY_URL) ?? "").replace(/\/$/, "");
}

export function getControlPin() {
  if (typeof window === "undefined") return "";
  return localStorage.getItem(KEY_PIN) ?? "";
}

export function setControlUrl(url: string) {
  localStorage.setItem(KEY_URL, url.trim().replace(/\/$/, ""));
}

export function setControlPin(pin: string) {
  localStorage.setItem(KEY_PIN, pin.trim());
}

function endpoint() {
  const base = getControlUrl();
  return `${base}/api/home`;
}

async function call(op: string, extra?: Record<string, unknown>) {
  const res = await fetch(endpoint(), {
    method: "POST",
    credentials: "include",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({ op, ...extra }),
  });
  const json = (await res.json()) as HomeSnapshot & { error?: string; runner?: boolean; host?: string };
  if (res.status === 401) throw new Error("ログインが必要です");
  if (res.status === 402) throw new Error(json.error || "契約が必要です");
  if (!res.ok) throw new Error(json.error || `サーバーエラー ${res.status}`);
  return json;
}

export async function pullHome() {
  const res = await fetch(endpoint(), {
    credentials: "include",
  });
  const json = (await res.json()) as HomeSnapshot & { error?: string; runner?: boolean; host?: string };
  if (res.status === 401) throw new Error("ログインが必要です");
  if (res.status === 402) throw new Error(json.error || "契約が必要です");
  if (!res.ok) throw new Error(json.error || `サーバーエラー ${res.status}`);
  return json;
}

export async function pushHome(state: HomeSnapshot) {
  return call("push", { state });
}

export async function serverSync(brand: Brand) {
  return call("sync", { brand });
}

export async function serverControl(deviceId: string, patch: Partial<Device>) {
  return call("control", { deviceId, patch });
}

export async function serverScene(sceneId: string) {
  return call("scene", { sceneId });
}

export async function saveCredentials(fields: Partial<Credentials>) {
  return call("credentials", { credentials: fields });
}
