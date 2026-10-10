# AvsarGo AI V12 — Android mobile source fixes

**This is updated Android source, not an APK. An APK has NOT been compiled, signed or tested in this session.** The Android SDK and Gradle are unavailable here and the download servers are blocked by this environment's network restrictions. No connected GitHub repository was available for a remote build. Do not interpret the included workflow or test results as a successful native build.

V12 follows the recovered AI form-filling chat requirements: Android-first, a single ChatGPT-style chat, upload documents before opening the form, an in-app browser in place of chat, approved autofill across form steps, and prompts when the applicant is needed. This is a separate project from the Worker/Creator/Admin TaskEarn platform; no TaskEarn source, accounts, payments or database were modified.

## Changes from V11

- Removes the Mobile beta chip and keeps provider, model and test tools inside Settings rather than the main chat.
- Separates Railway/RRB from SSC. Unknown exams and government services ask for their own official link instead of being sent to SSC. PAN, DL, certificates and passport preparation remain available. Checklists are indicative, not live verified eligibility decisions.
- Adds encrypted conversation persistence and restores the current service after restart. New chat resets that conversation.
- Supports multiple selected PDF/JPG/PNG documents, merges proposed OCR fields into one review, handles picker cancellation, and allows rescanning saved documents.
- Fixes OCR line splitting and name parsing. Father's/mother's names do not become the applicant name; unlabeled IDs do not become mobile numbers; issue dates do not become DOBs. Image rotation is handled before recognition.
- Adds separately reviewed first/middle/last names, city, district, postal PIN, gender, nationality and qualification. The app does not guess name components. Validation rejects invalid dates/mobile/email/PIN values.
- The portal helper offers only blank visible editable supported fields. Dropdown placeholders including `value=0` are handled; existing selections are preserved; length mismatches are skipped rather than truncated. Same-origin frames are supported; inaccessible frames are flagged.
- Offers optional permission for continued autofill of reviewed blank details on the **same website session**. The permission resets on origin changes and closing the browser. Missing supported details get an input popup. Unmatched required details are flagged for manual entry on the portal.
- Binds a fill approval to the current page/field signature and navigation. Page changes invalidate stale approvals.
- Portal upload buttons can use a saved encrypted document after the user selects and approves it for the current website. The read-only content provider streams decrypted bytes, avoiding a plaintext upload file on disk. The document is then sent by the website's upload control. Photo cropping/resizing is not automated.
- Moves bundled content from `file://` to a restricted virtual HTTPS asset origin. Disables arbitrary file access. Only the bundled chat has a native bridge; official websites never get that bridge.
- Adds loading/error status, modern Android insets and Back handling, and pauses scanning when the app is backgrounded.
- Deletion now removes documents, profile, chat, AI configuration/key, website storage and login cookies; it invalidates pending operations and the active fill session. Corrupt document metadata does not prevent sweeping stored documents.
- Real Gemini chat accepts conversation context when a key and cloud-chat consent are configured. Local document events, filenames and profile fields are excluded from automatically sent chat context. No key is embedded. HTTP redirects are disabled and provider errors restore the send button. There is no automatic provider/model fallback. If no live AI connection exists, the app identifies its local preparation tools clearly.

## Phone flow after an actual APK build

1. Type the application/form name in chat. With a configured AI connection, the model responds in the user's Hindi/English/Hinglish style. Local checklists remain usable without a cloud key.
2. Tap Upload documents, consent and choose files. OCR uses bundled Latin and Devanagari ML Kit recognition on the phone. First three pages of a PDF are scanned; files have an 8 MB limit and the vault has a 15-document limit.
3. Review/correct the fields, tick consent and Approve & save. Profile validation occurs in native code.
4. Open the official HTTPS `.gov.in` / `.nic.in` form inside the app. Complete the portal login yourself.
5. Accept the fill popup. Optionally allow continued reviewed-field filling on that website session. The user presses Next, reviews all details and handles OTP/CAPTCHA/fees/eSign/declaration/appointments/final submission.
6. On a portal document input, choose a saved document or a new phone file. Uploading a saved document requires a separate confirmation naming the website.

Sites that block WebView, use unapproved external domains, cross-origin frames, custom widgets or unsupported field types may require manual filling or an external browser. The app cannot guarantee all-form automation. Official provider domains outside `.gov.in`/`.nic.in` are not automatically granted autofill.

## Build the test APK

The project uses application ID `com.avsargo.mobile.beta`, versionCode 12, minSdk 26 (Android 8), target/compileSdk 35, JDK 17, AGP 8.7.3 and Gradle 8.10.2. Existing V11 vault filenames/key alias are retained.

### GitHub Actions — complete build recipe included, NOT executed

Place the contents of this project folder at the root of a private repository, including `.github`. In Actions, run **Build AvsarGo V12 Android test APK**. The workflow runs regression checks, installs SDK 35, runs native lint/compilation, verifies the APK signature/package, and uploads `AvsarGo-AI-V12-Android-Test-APK` only after success. The contained installable filename is `AvsarGo_AI_V12_Android_Test.apk`.

The workflow does not deploy a website, use Railway/Render, touch TaskEarn or publish to Google Play. GitHub Actions availability/permissions are needed. It cannot be run from an unconnected repository in this session.

### Developer machine

Install JDK 17 and Android SDK platform 35/build-tools 35.0.0. Set ANDROID_HOME or configure `sdk.dir` in local.properties. Run `BUILD_APK.sh` or `BUILD_APK.cmd` (Python 3 required). The included script downloads a Gradle distribution only if needed, verifies its pinned SHA-256, then runs lint/assembleDebug and copies the APK to the project root.

The distribution checksum comes from [Gradle's official checksum reference](https://gradle.org/release-checksums/). A compiled Gradle wrapper JAR could not be obtained in this environment; this standalone build script and the Actions installed-Gradle recipe do not depend on it.

## Verification completed here

- 19 checks of actual compiled pure-Java profile validation/OCR parsing.
- 18 deterministic portal-helper DOM unit checks.
- 11 deterministic chat/workflow checks using a simulated native bridge.
- JavaScript syntax checks and parsing of all six native Java source files.
- XML parsing and static bridge/security checks.

The DOM harness is **not Chromium, Android WebView or an emulator**. The native Java parse is **not compilation against the Android SDK**. No APK installation, on-device OCR, keystore/content-provider operation, native lint, live Gemini response or government portal flow has been executed here. See `docs/V12_AUDIT_REPORT.md` and `docs/ANDROID_TEST_PLAN.md`.

## Scope still pending

The attached V11 source is a single-user on-device application. V12 does not add a production customer/admin backend, cloud login/sync, subscription/credits, payment collection, live vacancy/eligibility database, portal-specific certified adapters or support for other AI providers. Those broader earlier concepts are not represented as completed features. A real AI key/consent and a successful native build/phone test are needed for the requested live-chat Android trial.

Technical references: [Android in-app content](https://developer.android.com/develop/ui/views/layout/webapps/load-local-content), [WebView](https://developer.android.com/develop/ui/views/layout/webapps/webview), [ML Kit Android OCR](https://developers.google.com/ml-kit/vision/text-recognition/v2/android), [Gemini API](https://ai.google.dev/api), [Railway Recruitment Control Board](https://www.rrcb.gov.in/rrbs.html), [SSC](https://ssc.gov.in/).
