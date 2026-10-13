import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import test from "node:test";

const UP = new URL("../deploy/up.sh", import.meta.url).pathname;

// 試験用の op。`op://保管庫/項目/欄` を `resolved-項目` に読み替えて子を起こす。
const FAKE_OP = `#!/bin/sh
[ "$1" = run ] || exit 9
shift
file=\${1#--env-file=}; shift
[ "$1" = -- ] && shift
if [ -n "\${FAKE_OP_FAIL:-}" ]; then echo "[ERROR] could not read secret" >&2; exit 1; fi
while IFS= read -r line; do
  case "$line" in ''|'#'*) continue ;; esac
  name=\${line%%=*}; value=\${line#*=}
  case "$value" in op://*) item=\${value#op://*/}; value="resolved-\${item%%/*}" ;; esac
  export "$name=$value"
done <"$file"
exec "$@"
`;

// 試験用の docker。inspect は用意した環境を返し、compose は引数と環境を書き残す。
const FAKE_DOCKER = `#!/bin/sh
if [ "$1" = inspect ]; then
  [ -f "$FAKE_DIR/container.env" ] || exit 1
  cat "$FAKE_DIR/container.env"
  exit 0
fi
printf '%s\\n' "$@" >"$FAKE_DIR/docker-argv"
env >"$FAKE_DIR/docker-env"
`;

const OP_ENV = `# 秘密は参照、ほかは値のまま
BETTER_AUTH_SECRET=op://vault1/item1/credential
HOME_SECRETS_KEY=op://vault1/item2/credential

YUI_BIND=127.0.0.9
COMPOSE_PROFILES=ble
`;

function workspace({ opEnv = OP_ENV, container } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "yui-up-"));
  mkdirSync(join(dir, "bin"));
  copyFileSync(UP, join(dir, "up.sh"));
  for (const [name, body] of [["op", FAKE_OP], ["docker", FAKE_DOCKER]]) {
    writeFileSync(join(dir, "bin", name), body);
    chmodSync(join(dir, "bin", name), 0o755);
  }
  if (opEnv !== null) writeFileSync(join(dir, "op.env"), opEnv);
  if (container) writeFileSync(join(dir, "container.env"), container);
  return dir;
}

function up(dir, args = [], env = {}) {
  const result = spawnSync("sh", [join(dir, "up.sh"), ...args], {
    encoding: "utf8",
    env: {
      PATH: `${join(dir, "bin")}${delimiter}${process.env.PATH}`,
      FAKE_DIR: dir,
      OP_SERVICE_ACCOUNT_TOKEN: "token-for-op-only",
      ...env,
    },
  });
  const read = (name) => (existsSync(join(dir, name)) ? readFileSync(join(dir, name), "utf8") : null);
  return { ...result, argv: read("docker-argv"), dockerEnv: read("docker-env"), override: read("compose.op.yaml") };
}

test("op.env の名前をすべて app へ渡し、値はファイルへ書かず docker の環境にだけ置く", () => {
  const dir = workspace();
  const run = up(dir, ["--force-recreate"]);

  assert.equal(run.status, 0, run.stderr);
  assert.deepEqual(run.argv.trim().split("\n"), [
    "compose", "--env-file", "/dev/null", "-f", "compose.yaml", "-f", "compose.op.yaml", "up", "-d", "--force-recreate",
  ]);
  assert.match(run.dockerEnv, /^BETTER_AUTH_SECRET=resolved-item1$/m);
  assert.match(run.dockerEnv, /^HOME_SECRETS_KEY=resolved-item2$/m);
  assert.match(run.dockerEnv, /^YUI_BIND=127\.0\.0\.9$/m);
  assert.match(run.dockerEnv, /^COMPOSE_PROFILES=ble$/m);
  assert.doesNotMatch(run.dockerEnv, /OP_SERVICE_ACCOUNT_TOKEN|YUI_UP_STAGE/);

  assert.match(run.override, /^ {4}env_file: !reset \[\]$/m);
  for (const name of ["BETTER_AUTH_SECRET", "HOME_SECRETS_KEY", "YUI_BIND", "COMPOSE_PROFILES"]) {
    assert.ok(run.override.includes(`      ${name}: \${${name}:?`), name);
  }
  assert.doesNotMatch(run.override, /resolved-|op:\/\//);
  assert.equal(statSync(join(dir, "compose.op.yaml")).mode & 0o077, 0);
});

test("op が読めない時は docker まで進まない", () => {
  const run = up(workspace(), [], { FAKE_OP_FAIL: "1" });

  assert.notEqual(run.status, 0);
  assert.equal(run.argv, null);
});

test("op.env が無い置き場では起こさない", () => {
  const run = up(workspace({ opEnv: null }));

  assert.equal(run.status, 1);
  assert.match(run.stderr, /op\.env が無い/);
  assert.equal(run.argv, null);
});

test("動いている結と同じ値なら起こす", () => {
  const container = "PATH=/usr/bin\nBETTER_AUTH_SECRET=resolved-item1\nHOME_SECRETS_KEY=resolved-item2\nYUI_BIND=127.0.0.9\n";
  const run = up(workspace({ container }));

  assert.equal(run.status, 0, run.stderr);
  assert.ok(run.argv);
});

test("1Password の値が動いている結と違う時は、変数名だけを知らせて起こさない", () => {
  const container = "BETTER_AUTH_SECRET=resolved-item1\nHOME_SECRETS_KEY=the-key-in-use\n";
  const run = up(workspace({ container }));

  assert.equal(run.status, 1);
  assert.match(run.stderr, /違う: HOME_SECRETS_KEY$/m);
  assert.doesNotMatch(run.stderr, /BETTER_AUTH_SECRET/);
  assert.doesNotMatch(run.stdout + run.stderr, /the-key-in-use|resolved-item2/);
  assert.equal(run.argv, null);
});

test("入れ替えた鍵は YUI_ACCEPT_CHANGED に名前を書いた分だけ通す", () => {
  const container = "BETTER_AUTH_SECRET=old-auth\nHOME_SECRETS_KEY=the-key-in-use\n";

  const partial = up(workspace({ container }), [], { YUI_ACCEPT_CHANGED: "BETTER_AUTH_SECRET" });
  assert.equal(partial.status, 1);
  assert.match(partial.stderr, /違う: HOME_SECRETS_KEY$/m);
  assert.equal(partial.argv, null);

  const both = up(workspace({ container }), [], { YUI_ACCEPT_CHANGED: "BETTER_AUTH_SECRET,HOME_SECRETS_KEY" });
  assert.equal(both.status, 0, both.stderr);
  assert.match(both.dockerEnv, /^HOME_SECRETS_KEY=resolved-item2$/m);
  assert.doesNotMatch(both.dockerEnv, /YUI_ACCEPT_CHANGED/);
});

test("値のまま書いた設定の変更と、新しく足した参照は止めない", () => {
  const container = "BETTER_AUTH_SECRET=resolved-item1\nYUI_BIND=192.168.0.2\n";
  const run = up(workspace({ container }));

  assert.equal(run.status, 0, run.stderr);
  assert.match(run.dockerEnv, /^YUI_BIND=127\.0\.0\.9$/m);
  assert.match(run.dockerEnv, /^HOME_SECRETS_KEY=resolved-item2$/m);
});

test("op を通さずに2段目へ入っても、動いている値と違うので起こさない", () => {
  const container = "BETTER_AUTH_SECRET=resolved-item1\nHOME_SECRETS_KEY=the-key-in-use\n";
  const run = up(workspace({ container }), [], { YUI_UP_STAGE: "resolved" });

  assert.equal(run.status, 1);
  assert.equal(run.argv, null);
});
