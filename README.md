# AvsarGo AI Android 13

A refreshed Android government application assistant with a ChatGPT-style dark/light conversation interface and a secure owner control panel.

## Test APK

Android 8+ (API 26). V13 uses test package `com.avsargo.mobile.beta.v13`, labelled **AvsarGo AI 13**, so it can be installed alongside V12. It starts with its own local document/profile workspace. This is a debug-signed test build, not a Play Store release.

## Owner panel

https://avsargo-ai-admin-production.up.railway.app/admin

Use the private setup link delivered separately to create an owner username and a password of at least 12 characters. The setup token is absent from this repository and APK. After setup, use Settings → Open admin panel on Android to sign in.

The private setup link survives refresh in the same browser tab. If you opened the regular admin address before creating an account, paste the code from your private guide into **Private setup code**. Pending setup codes are cleared after account creation or when an owner already exists. The regular address then shows sign-in.

- AI: Gemini or OpenAI keys, model discovery, response instructions and per-device/global quotas.
- Payments: Razorpay test/live keys and webhook secrets, plan price/duration and a feature switch. Server-created orders, callback signature checks, captured-payment verification and idempotent webhooks protect entitlements. Government portal fees are separate.
- App: name, welcome text, default theme, accent, support, announcements, maintenance and official portal links.
- Owner account: password change, sign-out and recent administrative activity.

Save changes in the panel, then Android Settings → Refresh app settings, or reopen the app. Live AI and payments stay disabled until the owner saves valid provider credentials and enables them. No working API key is embedded. The optional model-list and payment-key checks make read-only provider requests.

## Backend

`server/` is a Node 24 service with an origin-protected admin interface. Sessions are HttpOnly/Secure/SameSite=Strict, with CSRF checks on mutations. Passwords use scrypt; credentials and settings use AES-256-GCM with an environment master key. Android uses an installation token stored in the phone's encrypted vault. Documents, reviewed profiles and message content remain outside the backend database; typed chat is proxied only with user consent.

The dedicated Railway free-plan service uses SQLite on a mounted persistent `/data` volume. An extra PostgreSQL service could not be provisioned because of the account resource limit. A PostgreSQL store is also provided for deployments supplying DATABASE_URL. Do not reuse another app's database. Back up the volume and keep CONFIG_ENCRYPTION_KEY when moving the service; replacing it makes encrypted state unreadable.

Required environment: CONFIG_ENCRYPTION_KEY (base64 32 bytes), ADMIN_SETUP_HASH (SHA-256 of private setup token), ADMIN_SETUP_EXPIRES_AT (milliseconds), PUBLIC_ORIGIN (HTTPS), PORT. DATA_DIR defaults to `/data`. All secrets belong in the service environment, never in the repository. `bootstrap.mjs` prepares volume ownership, then drops root privileges before starting the HTTP server.

Plus is tied to the current installation token. Reinstalling, clearing app data or moving to another phone does not restore it; account-based restore is not implemented in this test build. Live charges/refunds and provider availability require merchant/API account setup. Backend sleeping can add a short delay to the first request.

## Documents and applications

Encrypted PDF/JPG/PNG imports, on-device Latin/Devanagari OCR, combined detail review, local conversation restore and guarded in-app autofill are retained. Portal login, OTP, CAPTCHA, fees, declarations, eSign and final submit remain user actions. Documents are shared with a portal only after destination-specific upload approval. Admin WebView and portal WebView have no native bridge; only bundled chat has one.

## Validation

75 local regression checks pass: 19 profile/OCR parsing, 18 form-agent, 17 UI workflow and 21 backend/storage tests. Native Android lint/compile, APK signature verification and rendered browser checks passed in `.github/workflows/android-debug-apk.yml`. The dedicated backend is deployed successfully and live HTTPS health/config/admin-access checks passed. Real-phone OCR/vault/provider upload and live AI/payment checks still require device and account credentials.

Build: `python3 scripts/build_apk.py` with Java 17, Android SDK 35 and Gradle 8.10.2; or GitHub Actions. Run backend tests with `node --test server/test/*.test.mjs` on Node 24. The browser visual check uses Playwright 1.56.1 and QA data only.
