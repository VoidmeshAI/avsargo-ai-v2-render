# Android 13 changes and acceptance

- Rebuilt welcome, chat, composer, document/profile sheets and navigation with a coherent charcoal/mint palette, complete light theme, larger text, safe Markdown formatting, response copy and reduced-motion support.
- Added separate, origin-restricted in-app owner panel and encrypted backend session/cache. Standard users no longer need to enter provider API keys.
- Added authenticated server settings, remote app configuration, Gemini/OpenAI proxy, explicit cloud consent and daily limits. Local profile/document events are excluded from automatic cloud history.
- Added Razorpay test/live credentials, server pricing, checkout, captured-payment verification and idempotent entitlement activation. Payments and AI start disabled.
- Added custom greeting/theme/accent/support/announcements/maintenance/official portals.
- V13 installs separately for testing because the previous CI debug signing key was not retained. V12 is not migrated automatically.

The original APK passed 75 regression checks, native Android lint/build, signature verification, rendered previews and live HTTPS health/config/admin-access checks. On-device OCR/document picker/Android Keystore, official portal compatibility and merchant capture need phone/account acceptance. Current AI connection verification is recorded below.

## AI connection repair · 11 October 2026

- Replaced model-list/manual-ID configuration with API key → Save → Test connection. A real AI reply selects and verifies a model automatically, then enables AI.
- Prefer available low-latency text models and model-supported thinking settings. Show key, billing/quota, model and transport errors separately.
- Replaced saved-key checkboxes with Remove key, confirmation and Undo removal before saving. Active AI key removal disables AI; key/provider changes require a fresh test.
- Preserve owner access and encrypted persistent settings. One bounded legacy connection check is recorded so restarts do not repeat provider usage.
- 32 backend checks and 20 Chromium/WebKit admin scenarios pass. A real saved Gemini key selected Gemini 3.5 Flash-Lite; Android chat API verification returned a reply in 670 ms. The existing APK uses the repair without reinstalling.
