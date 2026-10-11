# Android 13 changes and acceptance

- Rebuilt welcome, chat, composer, document/profile sheets and navigation with a coherent charcoal/mint palette, complete light theme, larger text, safe Markdown formatting, response copy and reduced-motion support.
- Added separate, origin-restricted in-app owner panel and encrypted backend session/cache. Standard users no longer need to enter provider API keys.
- Added authenticated server settings, remote app configuration, Gemini/OpenAI proxy, explicit cloud consent and daily limits. Local profile/document events are excluded from automatic cloud history.
- Added Razorpay test/live credentials, server pricing, checkout, captured-payment verification and idempotent entitlement activation. Payments and AI start disabled.
- Added custom greeting/theme/accent/support/announcements/maintenance/official portals.
- V13 installs separately for testing because the previous CI debug signing key was not retained. V12 is not migrated automatically.

75 regression checks pass locally. Native Android lint/build, signature verification, rendered previews and live HTTPS health/config/admin-access checks passed. On-device OCR/document picker/Android Keystore, official portal compatibility, merchant capture and real AI billing need final phone/account testing.
