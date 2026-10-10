# AvsarGo AI V12 — Fix audit and APK status

10 October 2026. Input: uploaded AvsarGo AI V11 Android Mobile In-App Autofill source.

**Result: an installable debug-signed V12 APK was built successfully.** All 48 deterministic regression checks, native Android compilation/lint and APK package/signature verification passed in GitHub Actions. The downloaded artifact and APK checksums match. Installation, on-device OCR/keystore/file upload and live portal/AI tests remain pending.

## Requirements recovered from prior chat

The relevant past-chat excerpts confirm a separate government/application-form AI app, not the AvsarGo Worker/Creator/Admin TaskEarn project. The latest direction is Android/mobile, documents requested before opening the official page, chat replaced by an in-app browser while filling, and popups where the user is needed. The broader direction includes all government forms/services (PAN, DL, certificates and exams), Hindi/English/Hinglish conversation, reusable reviewed profile, and user control of login/OTP/CAPTCHA/payment/eSign/declaration/appointments/final submission. The user rejected provider/language/login/status controls on the main chat and wanted a natural ChatGPT-style interface and actual AI rather than a guided demo presented as AI.

Retrieved excerpts are not a complete transcript of every historical message. Where previous concepts were not present in the uploaded Android project, they are listed as pending instead of represented as completed.

| Requirement / gap | V12 source status | Verification here |
|---|---|---|
| Android mobile, one chat, in-app browser replacing chat | Preserved; cleans header and moves developer/test controls into Settings | JS workflow/static; native layout pending |
| Documents before browser; encrypted local vault | Multi-file picker, consolidated review, rescan, MIME signatures and consent | JS flow/static; native picker/vault pending |
| English/Hindi document OCR | Preserves bundled ML Kit Latin/Devanagari; fixes line/name parsing and image orientation | Pure-Java parsing passed; model execution pending |
| Reviewed reusable profile | Expands supported fields and native validation; no automatic full-name splitting | 19 pure-Java checks passed |
| PAN/DL/exams/services | Preserves catalog, separates Railway/SSC; unknown services request official URL | Routing checks passed; live eligibility not implemented |
| Continuous assisted filling | Optional same-origin session approval, blank fields only, select placeholders, same-origin frames | 18 DOM unit checks passed; real WebView pending |
| Popup when user details are needed | Supported missing values prompt for entry; unmatched required fields prompt manual portal completion | Source/static; native dialogs pending |
| Upload previously saved document to official form | Explicit select/confirmation; read-only content URI streaming | Source/static; native upload pending |
| Human-controlled login/OTP/CAPTCHA/payment/final steps | Secret descriptors excluded; login/payment gates, no helper click/submit API | Negative DOM checks passed; live portal pending |
| Real AI, natural follow-up chat | Gemini conversation integration with hidden Settings, key/consent gate, accurate unavailable state; no cloud transfer of local OCR/profile/document-event data | JS request/context/error checks passed; actual API call pending |
| Persistence after restart | Encrypted current conversation and service restore | JS restore check passed; Android restart pending |
| Complete deletion | Stored files/chat/key, in-flight invalidation, browser storage/cookies and cached filling profile reset | JS/static checks; Android deletion pending |
| Android keyboard, Back, rotation/background | Insets/Back callbacks/lifecycle scanning changes | Java syntax/static; device pending |
| APK to install and test | **Built successfully; test APK available** | SDK 35 lint/compile, APK Signature Scheme v2 and package/checksum checks passed |
| Production backend, customers/admin, subscriptions/credits, cloud sync, live vacancy/eligibility, certified portal adapters, other AI providers | **Not implemented by this V12 mobile fix** | Not claimed complete |

## Bugs addressed

1. RRB/railway/NTPC requests were previously routed into SSC.
2. Current conversation and form context disappeared on restart.
3. OCR split used a double-escaped newline pattern; parent-name and arbitrary-date parsing were unsafe.
4. Native profile saved unvalidated phone/email/date data and supported only eight fields.
5. Hidden password inputs could disable autofill; scans included already-filled fields; select placeholder `0` was treated as non-empty.
6. No safe missing-value popup or explicit continued session approval existed.
7. Previously uploaded documents could not be selected for a portal upload.
8. App/portal WebViews enabled local file access and loaded trusted UI using file URLs.
9. Scanning continued when backgrounded; status/keyboard/Back handling had modern Android gaps.
10. Delete-data left chat, cookies/site state, cached fill profile, encryption key and some orphan/corrupt-index files; pending operations could restore deleted data.
11. AI lacked conversation context and its setup/error state was mixed into the workflow. Local document-event messages needed exclusion from cloud context.
12. Build instructions lacked a standalone checksum-verified build script; CI lacked native lint and APK signature/package checks.
13. Android compilation exposed two OCR listener callbacks shadowing the activity's result helper; both calls now explicitly use `MainActivity.this.result`.
14. The SDK setup action's default legacy `tools` package is no longer available; the workflow now requests `platform-tools` explicitly.

## Completed checks

- **19:** actual compiled ProfileRules validation/OCR parsing checks.
- **18:** portal-helper DOM unit checks covering secret-value nonaccess, no overwrite, dropdowns, frame handling, date formatting, stale approval guard, disabled/hidden fields, first/last names and no helper submission.
- **11:** chat/workflow unit checks with a simulated native bridge, including correct service routing, consent, multi-file OCR review, URL protection, cloud-context filtering, failure recovery, restore/erase and Back.
- Both JS scripts pass Node syntax checks.
- All six native Java files passed the earlier syntax parser and were subsequently compiled against Android SDK 35 by GitHub Actions.
- Android XML files parse; one native JS interface exists, on bundled chat only; SSL failure cancellation/file access restrictions are checked statically.
- Native `lintDebug` and `assembleDebug` passed. `apksigner` verified the debug APK using APK Signature Scheme v2, and `aapt dump badging` verified package/version/minSdk/targetSdk.
- The downloaded artifact SHA-256 matched GitHub's artifact digest; the extracted APK SHA-256 matched its build-generated checksum.

These test harnesses are not real Chromium/WebView or Android emulator tests. No successful device test is asserted.

## Successful APK build and remaining phone tests

The local workspace initially lacked an Android SDK and reachable Google/Maven/Gradle dependency servers. Its standalone prerequisite check returned exit code 21. After the user granted the GitHub App access to the AvsarGo repository, an isolated `android/v12-test-apk` branch provided a working remote Android build environment. The repository's main branch was not changed.

Successful build: [GitHub Actions run 38073731249](https://github.com/VoidmeshAI/avsargo-ai-v2-render/actions/runs/38073731249).

- Compiled source commit: `f2a64eb4cf5c8c5979a16632985ac01c8320cec3`.
- APK: `AvsarGo_AI_V12_Android_Test.apk`, 47,054,007 bytes.
- Package: `com.avsargo.mobile.beta`; versionCode 12; versionName `12.0-test`.
- Minimum Android API 26 (Android 8); target/compile SDK 35.
- Native architectures: arm64-v8a, armeabi-v7a, x86 and x86_64.
- APK SHA-256: `bc4d52d0c5657e0b62d9fc504aaa638342261a7a75666b75ff3bfffe0776c216`.
- Downloaded artifact SHA-256: `642e330c520d1ca74bcfd1b9aad8ebc330fada304f95956e00b157558d95c952`.

Earlier local prerequisite error, now bypassed by the successful remote build:

```
BLOCKED: Android SDK platform 35 is missing.
exit code: 21
```

The included `.github/workflows/android-debug-apk.yml` successfully completed tests, SDK 35 setup, native lint/compile, APK signature/package verification and artifact upload. `BUILD_APK.sh` / `BUILD_APK.cmd` remain alternatives for a developer environment with JDK 17 and SDK 35; their pinned Gradle distribution is checksum-verified.

This is a debug-signed test APK. Native phone tests are listed in `ANDROID_TEST_PLAN.md`. Actual Gemini chat needs a valid configured key and consent; official portal compatibility, file upload, lifecycle and storage behavior need device testing. Backend/subscriptions/cloud sync and certified portal adapters remain outside this V12 mobile fix. No website deployment or production launch was performed.
