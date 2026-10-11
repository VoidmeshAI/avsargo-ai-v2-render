# V13 phone acceptance plan

The V13 APK previously passed native lint/signature verification, 75 original regressions and phone-size browser UI checks. The updated backend passes 32 backend regressions and 20 Chrome/Safari admin scenarios. A real saved-key Gemini reply and the Android chat endpoint are verified. Real merchant capture and physical-device acceptance remain.

1. Install **AvsarGo AI 13** on Android 8+. Check welcome, drawer, keyboard/composer visibility, dark/light themes, message formatting/copy, Back and conversation restore.
2. Use the private owner setup link, then sign into the in-app admin. Save an app greeting/theme/announcement, refresh Android settings and check that it appears. Test owner sign-out and password change.
3. Choose Gemini or OpenAI, enter an API key, **Save changes**, then **Test connection**. Confirm Connected and the automatically selected model; no Model ID input is required. Check key-removal confirmation, Cancel and Undo removal before saving. Refresh app settings on Android. Approve cloud consent in Android; chat in Hindi/Hinglish/English. Test long conversations and provider/quota errors. Do not paste applicant secrets into chat.
4. Import multiple PDF/JPG/PNG files with consent; review combined Latin/Devanagari OCR, rotate photos, rescan, correct name components, and reopen the saved profile/documents. Verify picker cancellation and unsupported/oversize files.
5. In Settings test tools, open the dummy application after approving a dummy profile. Check login, fill only reviewed blank fields, missing-details prompts, Next-page guards, saved-file upload approval, OTP/CAPTCHA and user-only final submission.
6. Try a relevant official portal. Some portals block embedded browsers or use unsupported frames/labels. Confirm the app pauses safely, preserves entered fields, and offers manual handling without claiming completion.
7. Configure Razorpay test keys/webhook and test checkout. Return to Settings and refresh Plus. Repeat payment callbacks/webhooks and check that entitlement is extended once. Live charges need completed merchant setup and a separate decision to enable Live mode.
8. Background/foreground the app, restart it and check document/chat encryption and admin settings persistence. Clearing the V13 app data removes local docs/profile/conversation/installation token and its Plus access. V13 does not migrate V12 data.

No real-phone/device claim is made by the browser mock/native compile checks. OCR parsing tests are separate from actual ML Kit camera/image recognition.
