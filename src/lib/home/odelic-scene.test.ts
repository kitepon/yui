import { test } from "node:test";
import assert from "node:assert/strict";
import { SCENES, matchesStep } from "./demo.ts";
import type { Device } from "./types.ts";

/**
 * 受入条件の本丸「場面『おやすみ』で家中の照明と一緒に落ちる」を、
 * 場面の照合という純粋な部分で固める。実物が落ちることは別に実機で確かめる。
 */

function odelicLight(nativeId: string): Device {
  return {
    id: `odelec:${nativeId}`,
    name: `オーデリック照明 ${parseInt(nativeId.slice(0, 2), 16)}`,
    room: "リビング",
    brand: "odelec",
    kind: "light",
    online: true,
    source: "live",
    nativeId,
    connector: "odelec",
    on: true,
  };
}

const night = SCENES.find((s) => s.id === "night");

test("場面「おやすみ」が存在する", () => {
  assert.ok(night, "おやすみが見つからない");
});

test("おやすみはオーデリックの照明を消す対象に含む", () => {
  const lights = ["01000000", "05000000", "09000000"].map(odelicLight);
  for (const light of lights) {
    const hits = night!.steps.filter((step) => matchesStep(light, step));
    assert.ok(hits.length > 0, `${light.name} が場面に拾われない`);
    const patch = hits.reduce((acc, s) => ({ ...acc, ...s.patch }), {});
    assert.equal(
      (patch as { on?: boolean }).on,
      false,
      `${light.name} が消える指示になっていない`,
    );
  }
});

test("他社の照明と同じ扱いで一緒に落ちる", () => {
  const odelic = odelicLight("05000000");
  const other: Device = { ...odelic, id: "x", brand: "nature", connector: "nature", nativeId: "x" };
  const pick = (d: Device) =>
    night!.steps.filter((s) => matchesStep(d, s)).reduce((a, s) => ({ ...a, ...s.patch }), {});
  assert.deepEqual(pick(odelic), pick(other));
});

test("寝室のオーデリック照明なら残す側の指示になる", () => {
  const bedroom = { ...odelicLight("09000000"), room: "寝室" };
  const patch = night!.steps
    .filter((s) => matchesStep(bedroom, s))
    .reduce((a, s) => ({ ...a, ...s.patch }), {}) as { on?: boolean };
  assert.equal(patch.on, true);
});
