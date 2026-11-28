import assert from "node:assert/strict";
import { createHash, webcrypto } from "node:crypto";
import { test } from "node:test";
import { handleEntryEvent } from "./entry-events.ts";
import { SqliteKeyholeStore } from "./keyhole-store.ts";
import { addHome, testDb } from "./test-db.ts";

// Runs only with the private library at hand: YUI_LOGIN_BILLING_MODULE=/path/to/login-billing/js/dist/server/index.js
const modulePath = process.env.YUI_LOGIN_BILLING_MODULE;
const APP = "dev.kitepon.yuihome";
const ORIGIN = "https://yuihome.example";
const b64u = (b: Uint8Array) => Buffer.from(b).toString("base64url");

async function device() {
  const kp = await webcrypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign"]);
  const pub = b64u(new Uint8Array(await webcrypto.subtle.exportKey("raw", kp.publicKey)));
  const sign = async (text: string) => {
    for (;;) {
      const sig = new Uint8Array(await webcrypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, kp.privateKey, new TextEncoder().encode(text)));
      let s = 0n;
      for (const x of sig.subarray(32)) s = (s << 8n) | BigInt(x);
      if (s <= BigInt("0x7FFFFFFF800000007FFFFFFFFFFFFFFFDE737D56D38BCF4279DCE5617E3192A8")) return b64u(sig);
    }
  };
  const request = async (method: string, path: string, body: object = {}) => {
    const bytes = new TextEncoder().encode(JSON.stringify(body));
    const t = String(Date.now());
    const n = b64u(webcrypto.getRandomValues(new Uint8Array(16))).slice(0, 22);
    const text = ["lbk1", "req", APP, pub, method, path, b64u(createHash("sha256").update(bytes).digest()), ORIGIN, t, n].join("\n");
    const s = await sign(text);
    return { method, path, headers: new Headers({ "login-billing-key": `v1 k=${pub} t=${t} n=${n} s=${s}` }), body: bytes };
  };
  const add = async (key: string, role: "parent" | "child") => {
    const issued = Date.now();
    return { key, role, issued, signer: pub, s: await sign(["lbk1", "add", APP, key, role, String(issued), pub].join("\n")) };
  };
  return { pub, request, add };
}

test("the real library with Yui's store: start, join, and the home of the joined entry", { skip: !modulePath }, async () => {
  const lib = (await import(modulePath!)) as { createKeyholes(c: Record<string, unknown>): { verify(r: unknown): Promise<{ entry: string }>; handle(r: unknown): Promise<Response> } };
  const db = testDb();
  const kh = lib.createKeyholes({ appId: APP, origin: ORIGIN, store: new SqliteKeyholeStore(db), onEvent: (e: never) => handleEntryEvent(db, e) });
  const a = await device();
  const b = await device();
  const ra = await (await kh.handle(await a.request("POST", "/api/keys/start", { role: "parent" }))).json() as { entry: string };
  const rb = await (await kh.handle(await b.request("POST", "/api/keys/start", { role: "parent" }))).json() as { entry: string };
  assert.notEqual(ra.entry, rb.entry);
  assert.equal((await kh.verify(await a.request("GET", "/api/home"))).entry, ra.entry);
  addHome(db, ra.entry);
  addHome(db, rb.entry);
  // B (a parent of its own entry) joins A as a child: A signs the add. B's home is deleted because A already has one.
  const res = await kh.handle(await b.request("POST", "/api/keys/accept", { add: await a.add(b.pub, "child") }));
  assert.equal(res.status, 200);
  assert.equal((await kh.verify(await b.request("GET", "/api/home"))).entry, ra.entry);
  const left = db.prepare("SELECT owner_user_id o FROM homes").all() as { o: string }[];
  assert.deepEqual(left.map((r) => r.o), [ra.entry]);
});
