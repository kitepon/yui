import { test } from "node:test";
import assert from "node:assert/strict";
import { isLanOwner, lanOwnerConfigured } from "./lan-owner.ts";

/**
 * 実際に踏んだ事故の再発防止:
 * 誰でも登録できる公開サーバーで、LAN 直結（ダイキン・オーデリック）が
 * 全ユーザーへ開いており、新規登録した他人が家主のエアコンを操作できた。
 */

function withOwner<T>(value: string | undefined, fn: () => T): T {
  const before = process.env.YUI_LAN_OWNER;
  if (value === undefined) delete process.env.YUI_LAN_OWNER;
  else process.env.YUI_LAN_OWNER = value;
  try {
    return fn();
  } finally {
    if (before === undefined) delete process.env.YUI_LAN_OWNER;
    else process.env.YUI_LAN_OWNER = before;
  }
}

test("持ち主が未設定なら、LAN 直結は誰にも開かない", () => {
  withOwner(undefined, () => {
    assert.equal(lanOwnerConfigured(), false);
    assert.equal(isLanOwner("someone@example.com"), false);
    assert.equal(isLanOwner(null), false);
  });
  withOwner("   ", () => {
    assert.equal(lanOwnerConfigured(), false);
    assert.equal(isLanOwner("someone@example.com"), false);
  });
});

test("持ち主だけが LAN 直結を使える", () => {
  withOwner("owner@example.com", () => {
    assert.equal(lanOwnerConfigured(), true);
    assert.equal(isLanOwner("owner@example.com"), true);
    // 大文字小文字と前後の空白は同じ人として扱う
    assert.equal(isLanOwner(" Owner@Example.com "), true);
    // それ以外は全員だめ
    assert.equal(isLanOwner("stranger@example.com"), false);
    assert.equal(isLanOwner(""), false);
    assert.equal(isLanOwner(null), false);
    assert.equal(isLanOwner(undefined), false);
  });
});
