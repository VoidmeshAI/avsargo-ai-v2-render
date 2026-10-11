# AvsarGo AI V14 — Documents to application autofill

Android test build, API 26+; package `com.avsargo.mobile.beta.v14`, label **AvsarGo AI 14**.

## Test the intended flow

1. Admin: save a Gemini or OpenAI API key, then **Test connection**. The server chooses a working model. Existing owner settings and keys are retained.
2. In the app, choose an application and tap **Upload documents**. Pick PDF/JPG/PNG files (8 MB each, up to 15).
3. Approve **Scan ke baad… AI… analyse** to run AI immediately after import, or tap **Analyse saved documents with AI** and select the scans to share.
4. AI extracts source-backed proposals from OCR text. Review the original sources, choose between conflicting values, edit missing details, then **Approve & save**.
5. Open the official application in the in-app browser. Optionally approve **AI Assist** for field-label matching. Profile values stay on the phone.
6. Review the proposed form values and tap **Fill details**. Missing profile fields or unmatched required controls open a popup. Session approval can fill later blank fields on that same website.
7. Tap **Docs** on a document step, choose the upload field and a saved file, then approve sending it to that website. Direct portal file-picker buttons also list saved documents.

Login, OTP, CAPTCHA, declarations, payment, eSign and final submission remain applicant actions. Check every field before continuing. Dynamic layouts, cross-origin frames, blocked embedded browsers and unsupported control types may require manual entry; universal portal automation is not claimed.

## Document processing

Bundled Latin + Devanagari ML Kit OCR runs locally. Scanned text (not original file bytes) goes to the owner-configured AI only after explicit selection/sharing consent. A PDF scan covers its first 3 pages and at most 12,000 characters per document; the UI warns about partial scans. Split additional required pages into separate files. One AI batch is limited to 45,000 characters. Photos/signatures without text remain available for portal upload.

Candidates include document source, quoted evidence and confidence. Unsupported, ungrounded or invalid proposals are discarded. Names are not silently split. Saved profile values are not silently replaced. Reviewed fields include applicant/contact/address details and education, passing year, percentage, category and domicile. Government identifiers and login/payment credentials are not saved in this reusable profile.

## Backend and privacy

`server/` uses Node 24, encrypted SQLite on the existing Railway volume (or PostgreSQL), owner cookie/CSRF protection and authenticated app installation tokens. Routes `/api/documents/analyse` and `/api/forms/map` share per-device/global AI allowance and concurrency controls with chat; failed provider operations refund allowance. Document text, extracted values and form labels are not persisted in server state or logs. Provider data retention follows the configured provider account; OpenAI requests use `store:false`.

The trusted bundled chat and portal have separate WebViews. The portal has no native JavaScript bridge. The injected helper fills approved blank safe controls, checks its page signature and preserves existing values. AI returns only profile-key mappings, never executable code. File-picker opening requires an explicit upload action. No navigation or submit controls are clicked.

Supported navigation: HTTPS `.gov.in` / `.nic.in`, plus exact PAN application hosts `onlineservices.proteantech.in`, `www.onlineservices.proteantech.in`, `pan.utiitsl.com`, `www.pan.utiitsl.com`. The Income Tax Department identifies Protean and UTIITSL as PAN operators. Other external hosts open via an explicit regular-browser handoff, where Assist is unavailable.

## Build and verification

Java 17, Gradle 8.10.2, Android SDK/build-tools 35. Use `python3 scripts/build_apk.py` or the Android GitHub Actions workflow. CI runs native lint/compile, portable Java profile validation, backend regressions, DOM workflow tests, and Chromium rendering with a simulated native OCR/picker fixture. Live provider checks use synthetic document text, never applicant documents.

V14 installs separately from V13, whose CI debug signing key was not retained. Keep V13 for its existing local files; select documents again in V14. The delivered V14 APK is re-signed with the dedicated backed-up test key. Future V14 updates must use that same private key. No signing key or API secret is included in this public source project. Physical-device OCR, file-provider behavior and authenticated government-portal acceptance still need the user's test.
