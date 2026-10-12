#!/usr/bin/env bash
set -euo pipefail

mkdir -p native-verification
test_result=0
gradle --no-daemon :app:connectedDebugAndroidTest > native-verification/gradle.log 2>&1 &
gradle_pid=$!
while kill -0 "$gradle_pid" 2>/dev/null; do
  # AGP removes the test installation afterward; retain its screenshots now.
  adb pull /sdcard/Android/data/com.avsargo.mobile.beta.v14/files/verification native-verification/ > /dev/null 2>&1 || true
  sleep 1
done
wait "$gradle_pid" || test_result=$?
cat native-verification/gradle.log
adb logcat -d -s chromium AvsarGoStorage > native-verification/chromium.log
exit "$test_result"
