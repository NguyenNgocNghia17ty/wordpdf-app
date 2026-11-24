#!/usr/bin/env bash
# Build toàn bộ, ghi log vào build.log
set -eo pipefail
{
  echo "== npm install";      npm install --no-audit --no-fund
  echo "== build web";        node build.mjs
  echo "== add android";      rm -rf android && npx cap add android
  echo "== patch";            (python3 -c "import PIL" 2>/dev/null || python3 -m pip install -q --break-system-packages pillow) && python3 tools/patch_android.py
  echo "== sync";             npx cap sync android
  echo "== keystore";         mkdir -p ~/.android && base64 -d tools/debug.keystore.b64 > ~/.android/debug.keystore
  echo "== gradle";           cd android && chmod +x gradlew && ./gradlew assembleDebug --no-daemon --stacktrace
  cd ..
  cp android/app/build/outputs/apk/debug/app-debug.apk WordPDF.apk
  echo "== OK"; ls -la WordPDF.apk
} 2>&1 | tee build.log
