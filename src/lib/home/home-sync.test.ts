import assert from "node:assert/strict";
import { mock, test } from "node:test";
import { startHomeSync } from "./home-sync.ts";
import type { HomeSnapshot } from "./snapshot.ts";

const REFRESH_MS = 500;

function home(name: string): HomeSnapshot {
  return {
    credentials: {},
    devices: [],
    automations: [],
    scenes: [{ id: "scene", name, hint: "", steps: [] }],
    savedAt: "2026-10-06T00:00:00.000Z",
    pairPin: "",
  } as unknown as HomeSnapshot;
}

const nameOf = (snap: HomeSnapshot) => snap.scenes[0].name;

/** 待っている約束と、解決後の続きを流す。 */
async function settle() {
  for (let i = 0; i < 5; i += 1) await new Promise((resolve) => setImmediate(resolve));
}

function setup() {
  mock.timers.enable({ apis: ["setTimeout", "setInterval"] });
  const listeners = new Set<() => void>();
  let server = home("元の名前");
  let local = home("起動前");
  const pulls: Array<{ resolve: (snap: HomeSnapshot) => void }> = [];
  const pushes: Array<{ state: HomeSnapshot; resolve: () => void; reject: () => void }> = [];
  const applied: string[] = [];
  const setLocal = (next: HomeSnapshot) => {
    local = next;
    for (const listener of listeners) listener();
  };
  const stop = startHomeSync({
    pull: () => new Promise((resolve) => pulls.push({ resolve })),
    push: (state) =>
      new Promise((resolve, reject) =>
        pushes.push({
          state,
          resolve: () => {
            server = state;
            resolve(state);
          },
          reject: () => reject(new Error("届かない")),
        }),
      ),
    local: () => local,
    apply: (snap) => {
      applied.push(nameOf(snap));
      setLocal(snap);
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    setPin: () => {},
    host: () => "yui.test",
    refreshMs: REFRESH_MS,
  });
  return {
    pulls,
    pushes,
    applied,
    edit: (name: string) => setLocal(home(name)),
    localName: () => nameOf(local),
    /** 読取を1件、その時点のサーバーの家で返す。 */
    async answerPull(snap = server) {
      pulls.shift()?.resolve(snap);
      await settle();
    },
    async tick(ms: number) {
      mock.timers.tick(ms);
      await settle();
    },
    stop() {
      stop();
      mock.timers.reset();
    },
  };
}

test("保存した変更は、送る前に来た読取の周期で巻き戻らない", async () => {
  const sync = setup();
  try {
    await sync.answerPull();
    assert.equal(sync.localName(), "元の名前");

    sync.edit("新しい名前");
    await sync.tick(REFRESH_MS);
    assert.equal(sync.pulls.length, 0, "送る前は読まない");
    assert.equal(sync.pushes.length, 0);

    await sync.tick(300);
    assert.equal(sync.pushes.length, 1);
    assert.equal(nameOf(sync.pushes[0].state), "新しい名前");
    await sync.tick(REFRESH_MS);
    assert.equal(sync.pulls.length, 0, "送っている間も読まない");

    sync.pushes.shift()?.resolve();
    await settle();
    await sync.tick(REFRESH_MS);
    await sync.answerPull();
    assert.equal(sync.localName(), "新しい名前");
    assert.deepEqual(sync.applied, ["元の名前", "新しい名前"]);
  } finally {
    sync.stop();
  }
});

test("読んでいる途中の変更を、読取の古い結果で上書きしない", async () => {
  const sync = setup();
  try {
    await sync.answerPull();
    await sync.tick(REFRESH_MS);
    assert.equal(sync.pulls.length, 1);
    sync.edit("読取中の変更");
    await sync.answerPull();
    assert.equal(sync.localName(), "読取中の変更");
    assert.deepEqual(sync.applied, ["元の名前"]);
  } finally {
    sync.stop();
  }
});

test("送っている間の変更も、続けて送ってから読み直す", async () => {
  const sync = setup();
  try {
    await sync.answerPull();
    sync.edit("一つ目");
    await sync.tick(800);
    sync.edit("二つ目");
    sync.pushes.shift()?.resolve();
    await settle();
    await sync.tick(REFRESH_MS);
    assert.equal(sync.pulls.length, 0, "二つ目を送るまで読まない");
    await sync.tick(300);
    assert.equal(nameOf(sync.pushes[0].state), "二つ目");
    sync.pushes.shift()?.resolve();
    await settle();
    await sync.tick(REFRESH_MS);
    await sync.answerPull();
    assert.equal(sync.localName(), "二つ目");
  } finally {
    sync.stop();
  }
});

test("送信に失敗したら、次の読取でサーバーの家へ戻す", async () => {
  const sync = setup();
  try {
    await sync.answerPull();
    sync.edit("届かない変更");
    await sync.tick(800);
    sync.pushes.shift()?.reject();
    await settle();
    await sync.tick(REFRESH_MS);
    await sync.answerPull();
    assert.equal(sync.localName(), "元の名前");
  } finally {
    sync.stop();
  }
});

test("止めたあとは送らず、読まない", async () => {
  const sync = setup();
  await sync.answerPull();
  sync.edit("止める直前");
  sync.stop();
  mock.timers.enable({ apis: ["setTimeout", "setInterval"] });
  try {
    mock.timers.tick(5000);
    await settle();
    assert.equal(sync.pushes.length, 0);
    assert.equal(sync.pulls.length, 0);
  } finally {
    mock.timers.reset();
  }
});
