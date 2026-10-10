# Native Android acceptance — PENDING

These tests must be performed on an actual compiled APK. None has been marked passed by source/DOM checks.

- [ ] CI lint, assembleDebug, APK package/signature verification pass.
- [ ] Install and launch on Android 8 and a modern Android 15/16 device. Status/navigation bars and keyboard do not hide the composer or portal controls.
- [ ] Chat remains one main screen; Settings contains AI/test controls. Chat/service restore after restarting the app.
- [ ] Configure a test Gemini key and consent; verify actual responses and follow-up conversation. No key/consent shows an accurate setup state.
- [ ] No key is baked into the APK; provider errors/quota/timeouts restore Send.
- [ ] Choose multiple dummy images/PDFs; cancellation and unsupported/oversized files recover; OCR extracts separate names/dates and combines review.
- [ ] A rotated dummy document scans correctly; PDF cache disappears after normal scan and is swept after restart.
- [ ] Review validation rejects invalid DOB/mobile/email/postal PIN and keeps entered values on failure.
- [ ] Dummy profile → Settings → Test tools → sample login. Assist does not read/fill password, OTP or CAPTCHA.
- [ ] Continue manually to step 1; approve fill; existing fields are preserved and state placeholder value 0 is handled.
- [ ] Enable same-website session permission; press Next manually; step 2 fills reviewed fields and missing qualification gets a popup.
- [ ] Switch page/origin while a fill approval is open; the stale approval cannot fill the new page.
- [ ] File input → select saved encrypted document → confirmation shows the site. Cancellation gives no document to the site. Selected upload actually reaches the website correctly.
- [ ] Site has no native JS bridge and cannot browse app files; content-provider URIs are read-only and require grants outside the app.
- [ ] Login/payment screens remain user-controlled. No automatic Next/Submit, eSign, appointments or declaration clicks.
- [ ] Unsupported embedded fields/portals show a useful limitation. SSL errors cannot be bypassed by the app.
- [ ] Backgrounding stops scans; resume works; Back closes sheet/drawer/browser in the correct order; rotation retains workflow.
- [ ] Delete all data clears documents/profile/chat/key/cookies, prevents pending old messages being saved, and disables any old autofill session.
- [ ] Test one permission-compatible official portal end to end without final submission, then only user-selected manual submission if wanted.

Do not claim universal official-portal compatibility based on the local sample form.
