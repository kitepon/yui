import { test } from "node:test";
import assert from "node:assert/strict";
import { dropRoomFromOrder, renameOrderKey } from "./order.ts";

test("部屋の名前を変えても並び順が付いてくる", () => {
  const order = { リビング: ["a", "b"], 寝室: ["c"] };
  const next = renameOrderKey(order, "リビング", "居間");
  assert.deepEqual(next, { 居間: ["a", "b"], 寝室: ["c"] });
});

test("並び順が無い部屋の改名では何も起きない", () => {
  const order = { 寝室: ["c"] };
  assert.equal(renameOrderKey(order, "リビング", "居間"), order);
});

test("部屋を消すと、その並び順は捨て、機器は移動先の末尾に積む", () => {
  const order = { リビング: ["a", "b"], 寝室: ["c"] };
  const next = dropRoomFromOrder(order, "リビング", "寝室", ["a", "b"]);
  assert.deepEqual(next, { 寝室: ["c", "a", "b"] });
});

test("移動先に既にいる機器を二重に積まない", () => {
  const order = { リビング: ["a"], 寝室: ["a", "c"] };
  const next = dropRoomFromOrder(order, "リビング", "寝室", ["a"]);
  assert.deepEqual(next, { 寝室: ["a", "c"] });
});
