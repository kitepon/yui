import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { registerHooks } from "node:module";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";

const root = new URL("../src/", import.meta.url);
const hooks = registerHooks({
  resolve(specifier, context, next) {
    const base = specifier.startsWith("@/") ? new URL(specifier.slice(2), root)
      : specifier.startsWith(".") && context.parentURL?.startsWith(root.href) ? new URL(specifier, context.parentURL) : null;
    if (base) {
      for (const suffix of ["", ".tsx", ".ts"]) {
        const url = new URL(base.href + suffix);
        if (existsSync(fileURLToPath(url))) return { url: url.href, shortCircuit: true };
      }
    }
    return next(specifier, context);
  },
  load(url, context, next) {
    if (url.startsWith(root.href) && /\.tsx?$/.test(url)) {
      return { format: "module", source: ts.transpileModule(readFileSync(fileURLToPath(url), "utf8"), {
        compilerOptions: { target: ts.ScriptTarget.ESNext, module: ts.ModuleKind.ESNext, jsx: ts.JsxEmit.ReactJSX },
      }).outputText, shortCircuit: true };
    }
    return next(url, context);
  },
});
const { ConnectorCard } = await import("../src/components/connector-card.tsx");
hooks.deregister();

const props = { title: "接続", badge: "接続", desc: "機器", connected: true, deviceCount: 3, onSync() {} };

test("すべての同期カードが処理中表示と回転アイコンを出し、連打を止める", () => {
  for (const title of ["Nature Remo", "SwitchBot", "Smart Life", "ダイキン", "オーデリック"]) {
    const html = renderToStaticMarkup(createElement(ConnectorCard, { ...props, title, phase: { type: "syncing" } }));
    assert.match(html, /aria-busy="true"/);
    assert.match(html, /animate-spin/);
    assert.match(html, /同期中/);
    assert.match(html, /disabled/);
  }
});

test("完了と失敗を同期ボタンの近くに残し、古いエラーを処理中には出さない", () => {
  const completed = renderToStaticMarkup(createElement(ConnectorCard, { ...props, phase: { type: "completed" } }));
  assert.match(completed, /role="status"/);
  assert.match(completed, /同期が完了しました/);
  assert.doesNotMatch(completed, /animate-spin/);
  const failed = renderToStaticMarkup(createElement(ConnectorCard, { ...props, phase: { type: "failed", message: "接続を確認してください" } }));
  assert.match(failed, /role="alert"/);
  assert.match(failed, /接続を確認してください/);
  assert.doesNotMatch(failed, /同期が完了しました/);
  const busy = renderToStaticMarkup(createElement(ConnectorCard, { ...props, error: "前回のエラー", phase: { type: "syncing" }, busyLabel: "照明を探索中…" }));
  assert.match(busy, /照明を探索中/);
  assert.doesNotMatch(busy, /前回のエラー/);
});
