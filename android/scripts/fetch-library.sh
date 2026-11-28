#!/usr/bin/env bash
# Fetches the shared login/billing library's Android part (private repo kitepon/login-billing, no NuGet feed)
# into android/.nuget-local, which android/nuget.config reads. Needs gh access to that repo. The package is never committed.
set -euo pipefail
VERSION=0.28.0
SHA256=5d2734010401861d9c0e64231fc677fc0da91f65d0d8fd524d85d86819aa593c
DIR="$(cd "$(dirname "$0")/.." && pwd)/.nuget-local"
FILE="Kitepon.LoginBilling.Android.$VERSION.nupkg"
mkdir -p "$DIR"
if [ ! -f "$DIR/$FILE" ]; then
  gh release download "v$VERSION" -R kitepon/login-billing -p "$FILE" -D "$DIR"
fi
echo "$SHA256  $DIR/$FILE" | sha256sum -c -
