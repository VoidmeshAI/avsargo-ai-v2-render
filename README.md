# AvsarGo AI — V15 Android test build

Customer application assistant with a separate owner dashboard.

## Customer flow

- Name an application in chat. Udyam/MSME, PAN, SSC, RRB, UPSC, IBPS, NTA, driving licence, passport, voter, scholarship and e-Shram resolve through an official directory. Regional certificate services ask for the state. Unknown applications use verified public sources or an application choice, never a customer URL field.
- Allow document/form automation once. The choice is encrypted on the device, reused across official applications and revocable in Preferences. Prior V14 document-analysis permission is migrated; revocation stays revoked.
- Upload up to 15 PDF/JPG/PNG files, maximum 8 MB each. Bundled Latin and Devanagari ML Kit scans sequentially up to 20 pages per document, keeps up to 48,000 OCR characters and two bounded page previews. Truncation is visible. Photos are corrected for EXIF orientation.
- Structured AI analysis reads all selected OCR text plus up to six selected page previews. There are 47 shared profile fields and labelled additional facts. Facts are source grounded and normalised. Image-only proposals are labelled for original review; conflicts require a choice.
- Confirm the actual extracted details. Review originals privately on the phone. Autofill fills only blank, matched controls and asks for missing values. Text, select, ordinary radio and separated DOB controls are supported; existing values remain intact.
- A uniquely matching saved document can attach to a visible portal upload field. Ambiguous types require a file choice. Document types can be corrected in the document workspace. Only a validated, focused file input receives native keyboard activation; screen-coordinate taps are not used.
- Login, OTP, CAPTCHA, legal declarations, payment, eSign, appointment choices and final submission remain applicant actions. Cross-origin frames and custom controls that cannot be matched safely need manual entry. Portals can block embedded browsers.
- Chat has recent conversations, a document workspace, reviewed profile, application progress and light/dark themes. Customer UI has no owner login or API key inputs. Connection errors offer Retry.
- Live questions use provider grounding when available; search quota failures fall back to reading verified official pages. If current registration status cannot be established, the response says so. Provider attribution is displayed with the full answer in a separate JavaScript-disabled WebView with no native bridge.

## Owner dashboard

`https://avsargo-ai-admin-production.up.railway.app/admin`

Existing login, encrypted provider/payment keys and persistent volume are retained. Add a provider key, save, then Test; the model is selected automatically. Remove a saved key with the dedicated action. No provider secret is shipped in the APK.

## Build and checks

Java 17, Gradle 8.10.2, Android SDK/build-tools 35, minimum Android 8/API 26.

```sh
node scripts/generate-profile-fields.mjs --check
node --test server/test/*.test.mjs
node tests/form-agent.test.cjs
node tests/ui-workflow.test.cjs
javac -d /tmp/avsargo-tests app/src/main/java/com/avsargo/mobile/ProfileFields.java app/src/main/java/com/avsargo/mobile/ProfileRules.java tests/ProfileRulesTest.java
java -cp /tmp/avsargo-tests ProfileRulesTest
gradle --no-daemon :app:lintDebug :app:assembleDebug
gradle --no-daemon :app:connectedDebugAndroidTest
```

GitHub Actions also checks phone/tablet/desktop customer screens, Chrome/Safari owner flows, Android 15 native OCR/WebView/file uploads, and optional saved-provider/official-site checks. Browser fixtures are explicitly simulated; native instrumentation runs bundled ML Kit, Keystore, WebViews and the Android file picker using synthetic files. It does not submit real government applications.

## Install/update

V15 retains `com.avsargo.mobile.beta.v14` and uses versionCode 15. The delivered APK uses the same dedicated test certificate as the delivered V14 APK, so it updates V14 in place. Back up needed data before uninstalling; ordinary update installation preserves the encrypted workspace. APK signing credentials are excluded from this repository and source archive.
