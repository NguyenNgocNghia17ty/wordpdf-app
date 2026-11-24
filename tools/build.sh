#!/usr/bin/env bash
# Build toan bo, ghi log vao build.log
set -eo pipefail

gradle_build() {
  # Thu lai toi da 4 lan neu kho thu vien (Maven) qua tai / loi mang
  for i in 1 2 3 4; do
    if ./gradlew assembleDebug --no-daemon --stacktrace; then return 0; fi
    echo "== gradle loi, thu lai lan $((i+1)) sau $((i*45))s"
    sleep $((i*45))
  done
  return 1
}

{
  echo "== npm install";      npm install --no-audit --no-fund
  echo "== build web";        node build.mjs
  echo "== add android";      rm -rf android && npx cap add android
  echo "== patch";            (python3 -c "import PIL" 2>/dev/null || python3 -m pip install -q --break-system-packages pillow) && python3 tools/patch_android.py
  echo "== sync";             npx cap sync android
  echo "== keystore";         mkdir -p ~/.android && base64 -d tools/debug.keystore.b64 > ~/.android/debug.keystore
  echo "== gradle";           cd android && chmod +x gradlew && gradle_build
  cd ..
  cp android/app/build/outputs/apk/debug/app-debug.apk WordPDF.apk
  echo "== OK"; ls -la WordPDF.apk
} 2>&1 | tee build.log
