import { test } from "node:test";
import assert from "node:assert/strict";
import { applyOverrides } from "./overrides.ts";
import type { Device } from "./types.ts";

function device(id: string, name: string, room = "リビング"): Device {
  return {
    id, name, room,
    brand: "smartlife", kind: "plug", online: true, source: "live",
    nativeId: id, connector: "smartlife",
  };
}

test("付けた名前が機器へ当たる", () => {
  const [d] = applyOverrides([device("a", "Smart Plug 1")], { a: { name: "テレビ" } });
  assert.equal(d.name, "テレビ");
});

test("同期が元の名前で差し替えても、当て直せば改名は残る", () => {
  const overrides = { a: { name: "テレビ" } };
  // 各社の同期は毎回それぞれの元の名前を返してくる
  const fromVendor = [device("a", "Smart Plug 1")];
  const [d] = applyOverrides(fromVendor, overrides);
  assert.equal(d.name, "テレビ", "同期のたびに改名が消えてはいけない");
});

test("空白だけの名前は採らず、元の名前を残す", () => {
  const [d] = applyOverrides([device("a", "Smart Plug 1")], { a: { name: "   " } });
  assert.equal(d.name, "Smart Plug 1");
});

test("場所だけの override は名前を触らない", () => {
  const [d] = applyOverrides([device("a", "Smart Plug 1")], { a: { room: "寝室" } });
  assert.equal(d.name, "Smart Plug 1");
  assert.equal(d.room, "寝室");
});

test("override の無い機器はそのまま", () => {
  const src = device("b", "そのまま");
  const [d] = applyOverrides([src], { a: { name: "テレビ" } });
  assert.deepEqual(d, src);
});

test("元の配列を書き換えない", () => {
  const src = [device("a", "Smart Plug 1")];
  applyOverrides(src, { a: { name: "テレビ" } });
  assert.equal(src[0].name, "Smart Plug 1");
});
