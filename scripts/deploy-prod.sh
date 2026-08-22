#!/bin/sh
# 手元で image を焼き、SSH で届くサーバーへ運んで compose up する。
# サーバー側では build しない（非力なミニ PC でも配れるように）。
#
# 使い方:
#   DEPLOY_HOST=user@host [DEPLOY_REMOTE_DIR=/home/user/yuihome] ./scripts/deploy-prod.sh
#
# 家に固有の設定（公開 URL、LAN 直結の宛先、秘密）はサーバーの deploy/.env が持つ。
# このスクリプトも compose.yaml も、それらの値を知らない。
set -eu

ROOT=$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)
NAME=yuihome

if [ -z "${DEPLOY_HOST:-}" ]; then
  echo "DEPLOY_HOST が要る（例: DEPLOY_HOST=user@192.168.0.2 $0）" >&2
  exit 1
fi
HOST=$DEPLOY_HOST
REMOTE_DIR=${DEPLOY_REMOTE_DIR:-yuihome}
# 公開する URL。サーバーの .env にも要るが、ビルド時にも埋める。
PUBLIC_HOSTNAME=${DEPLOY_PUBLIC_HOSTNAME:-}
# サーバーの CPU に合わせる（ミニ PC は amd64、Raspberry Pi は arm64）。
PLATFORM=${DEPLOY_PLATFORM:-linux/amd64}

cd "$ROOT"

# Docker Desktop 同梱の buildx が `docker buildx` で出ない環境があるため、両方見る。
if command -v docker-buildx >/dev/null 2>&1; then
  BUILDX="docker-buildx"
elif docker buildx version >/dev/null 2>&1; then
  BUILDX="docker buildx"
else
  echo "buildx が無い。Docker Desktop か docker-buildx を入れる" >&2
  exit 1
fi

SHA=$(git -C "$ROOT" rev-parse --short HEAD)
TAG=$(date +%Y%m%d)-$SHA
IMAGE="$NAME:$TAG"

echo "[deploy] vite build (node-server)"
NITRO_PRESET=node-server \
VITE_AUTH_ENABLED=true \
${PUBLIC_HOSTNAME:+VITE_PUBLIC_HOSTNAME=$PUBLIC_HOSTNAME} \
  npm run build

# nitro が pglite の wasm/data を .output に出さないので、参照先へ置く。
PGLITE_DIST="$ROOT/node_modules/@electric-sql/pglite/dist"
PGLITE_OUT="$ROOT/.output/server/_libs"
cp "$PGLITE_DIST/pglite.data" "$PGLITE_DIST/pglite.wasm" "$PGLITE_DIST/initdb.wasm" "$PGLITE_OUT/"

echo "[deploy] image $IMAGE ($PLATFORM)"
$BUILDX build --platform "$PLATFORM" --load -t "$IMAGE" "$ROOT"

echo "[deploy] load on $HOST"
docker save "$IMAGE" | ssh "$HOST" docker load
ssh "$HOST" "docker image inspect $IMAGE >/dev/null"

echo "[deploy] compose $REMOTE_DIR/deploy"
ssh "$HOST" "mkdir -p $REMOTE_DIR/deploy"
# 初回だけ、鍵を持つ .env を作る。既にあれば触らない。
ssh "$HOST" "umask 077; if [ ! -f $REMOTE_DIR/deploy/.env ]; then printf 'BETTER_AUTH_SECRET=%s\nHOME_SECRETS_KEY=%s\n' \"\$(openssl rand -hex 32)\" \"\$(openssl rand -hex 32)\" > $REMOTE_DIR/deploy/.env; echo '[deploy] wrote new deploy/.env — BETTER_AUTH_URL などを書き足すこと'; fi"
TMP=$(mktemp)
trap 'rm -f "$TMP"' EXIT
sed "s|image: yuihome:local|image: $IMAGE|" "$ROOT/deploy/compose.yaml" >"$TMP"
scp -q "$TMP" "$HOST:$REMOTE_DIR/deploy/compose.yaml"

echo "[deploy] up"
ssh "$HOST" "cd $REMOTE_DIR/deploy && docker compose up -d --force-recreate"
ssh "$HOST" "docker ps --filter name=^/${NAME}$ --format '{{.Names}}\t{{.Status}}\t{{.Image}}'"

echo "[deploy] probe"
ssh "$HOST" "cd $REMOTE_DIR/deploy && . ./.env 2>/dev/null; curl -fsS -o /dev/null -w '%{http_code}\n' --max-time 10 http://\${YUI_BIND:-127.0.0.1}:\${YUI_PORT:-18861}/"
echo "[deploy] done $IMAGE"
