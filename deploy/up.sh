#!/bin/sh
# 秘密を 1Password から読んで結を起こす（任意。使い方は deploy/README.md）。
#
# 同じ場所の `op.env` に、秘密は `op://` の参照で、ほかの設定は値のまま書く。
# 値は `op run` がこのプロセスの環境変数として渡すだけで、ファイルには書かない。
# `op` が読めなければ、Docker まで進まずに終わる。
#
# 使い方:
#   ./up.sh                    # docker compose up -d
#   ./up.sh --force-recreate   # 引数はそのまま up へ渡す
#
# 1Password から読んだ値が、動いている結の値と違う時は起こさない（鍵を誤って捨てないため）。
# 鍵を入れ替えた時は、その変数名を YUI_ACCEPT_CHANGED に書いて起こす。
#   YUI_ACCEPT_CHANGED="STRIPE_SECRET_KEY STRIPE_WEBHOOK_SECRET" ./up.sh --force-recreate
set -eu

cd -- "$(dirname -- "$0")"
self=./$(basename -- "$0")
app=yuihome

if [ ! -f op.env ]; then
  echo "[up] op.env が無い。.env で動かす置き場では docker compose up -d を使う" >&2
  exit 1
fi

names=$(sed -n 's/^\([A-Za-z_][A-Za-z0-9_]*\)=.*/\1/p' op.env)
if [ -z "$names" ]; then
  echo "[up] op.env に変数が無い" >&2
  exit 1
fi

if [ "${YUI_UP_STAGE:-}" != resolved ]; then
  # op.env に書いた名前を、すべて app へ渡す（.env を env_file で渡していたのと同じ範囲）。
  # 空や未設定の名前が一つでもあれば、compose が起こす前に止める。
  umask 077
  tmp=$(mktemp compose.op.yaml.XXXXXX)
  trap 'rm -f "$tmp"' EXIT
  {
    echo "# deploy/up.sh が op.env の名前から作る。手で直さない。値は入らない。"
    echo "services:"
    echo "  app:"
    echo "    env_file: !reset []"
    echo "    environment:"
    for name in $names; do
      printf '      %s: ${%s:?op.env の %s が空。deploy/up.sh から起こす}\n' "$name" "$name" "$name"
    done
  } >"$tmp"
  mv "$tmp" compose.op.yaml
  trap - EXIT

  # ここから先は op run の子として、値を環境に持った状態でもう一度この手順を通る。
  YUI_UP_STAGE=resolved exec op run --env-file=op.env -- "$self" "$@"
fi

# 参照で読んだ値を、動いている app の値と比べる。値は表示しない。
refs=$(sed -n 's/^\([A-Za-z_][A-Za-z0-9_]*\)=op:\/\/.*/\1/p' op.env)
if current=$(docker inspect "$app" --format '{{range .Config.Env}}{{println .}}{{end}}' 2>/dev/null); then
  changed=""
  for name in $refs; do
    printf '%s\n' "$current" | grep -q "^$name=" || continue
    have=$(printf '%s\n' "$current" | sed -n "s/^$name=//p")
    eval "want=\${$name-}"
    [ "$want" = "$have" ] && continue
    case " $(printf '%s' "${YUI_ACCEPT_CHANGED:-}" | tr ',' ' ') " in
      *" $name "*) echo "[up] $name は動いている値と違う。YUI_ACCEPT_CHANGED の指定どおり入れ替える" >&2 ;;
      *) changed="$changed $name" ;;
    esac
  done
  unset current have want
  if [ -n "$changed" ]; then
    echo "[up] 1Password から読んだ値が、動いている $app の値と違う:$changed" >&2
    echo "[up] 起こしていない。入れ替えた鍵なら、その変数名を YUI_ACCEPT_CHANGED に書いて起こす" >&2
    exit 1
  fi
fi

# `--env-file /dev/null` で、置き場に残った .env を compose に読ませない。
# 1Password のトークンは docker へ渡さない。
exec env -u OP_SERVICE_ACCOUNT_TOKEN -u YUI_UP_STAGE -u YUI_ACCEPT_CHANGED \
  docker compose --env-file /dev/null -f compose.yaml -f compose.op.yaml up -d "$@"
