import { test } from "node:test";
import assert from "node:assert/strict";
import { discoverEndpoints } from "./alexa-core.ts";
import { applyOverrides } from "../home/overrides.ts";
import type { Device } from "../home/types.ts";

/**
 * 改名が Alexa の表示まで届くこと。
 *
 * Alexa は endpoint の friendlyName を device.name からそのまま作るので、
 * サーバに保存される devices へ override が当たっていないと、
 * 同期のたびに Alexa の呼び名が各社の元の名前へ戻ってしまう。
 */

function plug(id: string, name: string): Device {
  return {
    id, name, room: "リビング",
    brand: "smartlife", kind: "plug", online: true, source: "live",
    nativeId: id, connector: "smartlife", on: false,
  };
}

test("付けた名前が Alexa の friendlyName になる", () => {
  const devices = applyOverrides([plug("a", "Smart Plug 1")], { a: { name: "テレビ" } });
  const endpoints = discoverEndpoints(devices, []);
  const found = endpoints.find((e) => e.endpointId === "a");
  assert.ok(found, "機器が Alexa へ出ていない");
  assert.equal(found.friendlyName, "テレビ");
});

test("同期で各社の元の名前に差し替わっても、Alexa の呼び名は改名のまま", () => {
  const overrides = { a: { name: "テレビ" } };
  const afterSync = applyOverrides([plug("a", "Smart Plug 1")], overrides);
  const endpoints = discoverEndpoints(afterSync, []);
  assert.equal(endpoints.find((e) => e.endpointId === "a")?.friendlyName, "テレビ");
});

test("場所の変更も Alexa の説明に出る", () => {
  const devices = applyOverrides([plug("a", "Smart Plug 1")], { a: { room: "寝室" } });
  const endpoints = discoverEndpoints(devices, []);
  assert.match(endpoints.find((e) => e.endpointId === "a")!.description, /寝室/);
});
