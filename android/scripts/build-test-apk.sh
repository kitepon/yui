#!/usr/bin/env bash
# A Release APK signed with the developer's debug keystore (its SHA-1 is the Android client in the yui-hosted Google project), for an emulator or phone.
# The store build is different: build the AAB unsigned and hand it to Sakura (docs/yui-android-notes in BellTeam).
set -euo pipefail
cd "$(dirname "$0")/../Yui"
KS="${YUI_DEBUG_KEYSTORE:-$HOME/.android/yui-debug.keystore}"
dotnet publish -f net10.0-android36.0 -c Release -p:AndroidPackageFormat=apk -p:AndroidKeyStore=true \
  -p:AndroidSigningKeyStore="$KS" -p:AndroidSigningKeyAlias=androiddebugkey -p:AndroidSigningKeyPass=pass:android -p:AndroidSigningStorePass=pass:android \
  -o "${1:-/tmp/yui-test-apk}"
