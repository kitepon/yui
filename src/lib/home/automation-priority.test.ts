import assert from "node:assert/strict";
import { test } from "node:test";
import { prioritizeAutomationActions } from "./automation-priority.ts";
import type { AutoAction, Automation } from "./types.ts";

function auto(id: string, deviceIds: string[]): Automation {
  const actions: AutoAction[] = deviceIds.map((deviceId, i) => ({ id: `${id}-${i}`, deviceId, on: true }));
  return {
    id,
    name: id,
    enabled: true,
    trigger: { type: "sensor" },
    actions,
  };
}

test("上のオートメーションが取った機器は、下が送らない", () => {
  const a = auto("1", ["A", "B"]);
  const b = auto("2", ["B", "C"]);
  const planned = prioritizeAutomationActions([a, b]);
  assert.deepEqual(
    planned.get("1")?.map((x) => x.deviceId),
    ["A", "B"],
  );
  assert.deepEqual(
    planned.get("2")?.map((x) => x.deviceId),
    ["C"],
  );
});

test("欄の並びが優先で、下に書いただけでは上を奪えない", () => {
  const a = auto("1", ["A", "B"]);
  const b = auto("2", ["B", "C"]);
  const planned = prioritizeAutomationActions([b, a]);
  assert.deepEqual(
    planned.get("2")?.map((x) => x.deviceId),
    ["B", "C"],
  );
  assert.deepEqual(
    planned.get("1")?.map((x) => x.deviceId),
    ["A"],
  );
});

test("機器 id の無いアクションは対象にしない", () => {
  const a: Automation = {
    id: "1",
    name: "1",
    enabled: true,
    trigger: { type: "time" },
    actions: [
      { id: "x", on: true },
      { id: "y", deviceId: "A", on: true },
    ],
  };
  const planned = prioritizeAutomationActions([a]);
  assert.deepEqual(
    planned.get("1")?.map((x) => x.deviceId),
    ["A"],
  );
});
