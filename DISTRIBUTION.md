# Shipping FinXAI to your device (no Play Store)

## One-time setup (already done on this machine)

- **Release keystore**: `android/app/finxai_release.keystore` (gitignored). Credentials live in
  `C:\Users\feyto\.gradle\gradle.properties` (outside the repo — Gradle reads it automatically):
  `KEYSTORE_PASSWORD`, `KEY_ALIAS`, `KEY_PASSWORD`.
  Do NOT put them back in `android/gradle.properties` — that file is git-tracked and the old
  passwords were exposed in the repo history (rotated 2026-07-08 for that reason).
- **BACK BOTH UP** (keystore + passwords) somewhere safe (password manager + cloud drive).
  If you lose them, devices with the app installed will refuse updates until they uninstall.
- Play Store restricts `READ_SMS` apps heavily — side-loading avoids that fight entirely.

## Build a release APK

```bash
npm run build          # = cd android && gradlew assembleRelease
# Output: android/app/build/outputs/apk/release/app-release.apk
```

Install on a device connected over USB (enable USB debugging):

```bash
adb install -r android/app/build/outputs/apk/release/app-release.apk
```

Or just copy the APK to the phone (Drive/WhatsApp/USB) and open it — allow
"install unknown apps" for the file manager when prompted.

## Recommended update flow: GitHub Releases + Obtainium

1. Bump `versionCode` (and `versionName`) in `android/app/build.gradle` — Android
   refuses to update unless `versionCode` increases.
2. Tag and push: `git tag v1.1 && git push origin v1.1` — the GitHub Actions
   workflow (`.github/workflows/release.yml`) builds the signed APK and attaches
   it to a GitHub Release automatically.
3. On your phone, install [Obtainium](https://github.com/ImranR98/Obtainium)
   (an app that installs/updates apps directly from GitHub releases).
   Add app → `https://github.com/feyton/finxai` — done. It notifies you and
   updates whenever a new release appears.
   - The repo is private? In Obtainium add a GitHub personal access token
     (Settings → Source-specific → GitHub) with `repo` read scope.

### CI secrets required (GitHub → repo → Settings → Secrets and variables → Actions)

| Secret | Value |
|---|---|
| `KEYSTORE_BASE64` | `base64 -w0 android/app/finxai_release.keystore` output |
| `KEYSTORE_PASSWORD` | same as local gradle.properties |
| `KEY_ALIAS` | same as local gradle.properties |
| `KEY_PASSWORD` | same as local gradle.properties |

PowerShell one-liner for the base64:

```powershell
[Convert]::ToBase64String([IO.File]::ReadAllBytes("android\app\finxai_release.keystore")) | Set-Clipboard
```

## Alternatives considered

- **Firebase App Distribution** — nice tester UX and install analytics, but requires
  adding Firebase to the project and testers installing App Tester. Worth it only
  if you start distributing to several people.
- **OTA JS updates (CodePush-style)** — CodePush itself retired with App Center.
  The modern option is [hot-updater](https://github.com/gronxb/hot-updater), which
  supports **Supabase storage** as the backend (which you already run). It ships
  JS-only changes instantly without reinstalling the APK. Native changes still
  need a new APK. Consider this once the native side stabilizes.
