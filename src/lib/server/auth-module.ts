import { connect } from "node:net";

/** One JSON line each way over the caller socket of the authentication module (docs: keyuse-wrap-unwrap-design). */
function ask(sock: string, request: Record<string, unknown>, timeoutMs = 20000): Promise<{ outcome: string; data?: string; error?: string }> {
  return new Promise((resolve, reject) => {
    const s = connect(sock);
    let buf = "";
    s.setTimeout(timeoutMs, () => {
      s.destroy();
      reject(new Error("the authentication module did not answer"));
    });
    s.on("data", (d) => {
      buf += d;
      const i = buf.indexOf("\n");
      if (i < 0) return;
      s.end();
      try {
        resolve(JSON.parse(buf.slice(0, i)));
      } catch (err) {
        reject(err);
      }
    });
    s.on("error", reject);
    s.write(JSON.stringify(request) + "\n");
  });
}

export const HOME_KEY_NAME = "yui-home";

/** The home key, unwrapped by the module. The module's master key never comes here; only the home key does, in memory. */
export async function unwrapHomeKey(sock: string, wrapped: string, aad: string) {
  const res = await ask(sock, { op: "unwrap", name: HOME_KEY_NAME, data: wrapped.trim(), aad });
  if (res.outcome !== "granted" || !res.data) throw new Error(`the authentication module refused the home key: ${res.outcome}`);
  return Buffer.from(res.data, "base64").toString("utf8");
}

export async function wrapHomeKey(sock: string, keyText: string, aad: string) {
  const res = await ask(sock, { op: "wrap", name: HOME_KEY_NAME, data: Buffer.from(keyText, "utf8").toString("base64"), aad });
  if (res.outcome !== "granted" || !res.data) throw new Error(`the authentication module refused to wrap the home key: ${res.outcome}`);
  return res.data;
}
